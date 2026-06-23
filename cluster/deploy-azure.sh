#!/usr/bin/env bash
#
# Deploys the Cue & Balls stack onto an already-provisioned AKS cluster.
# The cluster itself (terraform apply), the network resource group and the
# static public IP are expected to exist beforehand and are NOT handled here.
#
# Portable across macOS (bash 3.2) and Linux. Idempotent and re-runnable.

set -euo pipefail

# Resolve the repo root from the script location, independent of the CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

readonly ENV_FILE="${REPO_ROOT}/cluster/k8s/.env.azure"
readonly TERRAFORM_DIR="${REPO_ROOT}/cluster/terraform"
readonly BACKEND_SECRET="${REPO_ROOT}/backend/deploy/k8s/secret.yaml"
readonly EXPECTED_CONTEXT="aks-cueballs"
readonly GATEWAY_API_VERSION="v1.5.1"
readonly POSTGRES_WAIT_TIMEOUT="120s"
readonly LB_IP_RETRIES=30
readonly LB_IP_INTERVAL=10
readonly API_RETRIES=30
readonly API_INTERVAL=10

# ── Logging ──────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  C_RESET="$(printf '\033[0m')"
  C_BLUE="$(printf '\033[1;34m')"
  C_GREEN="$(printf '\033[1;32m')"
  C_YELLOW="$(printf '\033[1;33m')"
  C_RED="$(printf '\033[1;31m')"
else
  C_RESET="" C_BLUE="" C_GREEN="" C_YELLOW="" C_RED=""
fi

step() { printf '\n%s==>%s %s\n' "${C_BLUE}" "${C_RESET}" "$1"; }
ok()   { printf '%s  ✓%s %s\n' "${C_GREEN}" "${C_RESET}" "$1"; }
warn() { printf '%s  !%s %s\n' "${C_YELLOW}" "${C_RESET}" "$1"; }
die()  { printf '%s  ✗%s %s\n' "${C_RED}" "${C_RESET}" "$1" >&2; exit 1; }

# ── Portability helpers ────────────────────────────────────────────────────────

# Maps a missing command to its install hint for the current platform.
install_hint() {
  local cmd="$1"
  local pkg="$cmd"
  [ "$cmd" = "envsubst" ] && pkg="gettext"
  case "$(uname -s)" in
    Darwin) printf 'brew install %s' "$pkg" ;;
    Linux)  printf 'your package manager (e.g. pacman -S %s / apt install %s)' "$pkg" "$pkg" ;;
    *)      printf 'your package manager' ;;
  esac
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 \
    || die "'$cmd' not found. Install it with: $(install_hint "$cmd")"
}

# ── 0. Prerequisites ───────────────────────────────────────────────────────────

step "Checking required tools"
for cmd in az terraform kubectl helm envsubst; do
  require_cmd "$cmd"
done
ok "az, terraform, kubectl, helm, envsubst present"

# ── 1. File prerequisites ──────────────────────────────────────────────────────

step "Checking configuration files"
[ -f "${ENV_FILE}" ] || die "Missing ${ENV_FILE}"
# shellcheck disable=SC1090
. "${ENV_FILE}"
for var in DOMAIN BACKEND_IMAGE FRONTEND_IMAGE IMAGE_PULL_POLICY; do
  eval "value=\${$var:-}"
  [ -n "${value}" ] || die "Variable ${var} is empty or unset in ${ENV_FILE}"
done
export DOMAIN BACKEND_IMAGE FRONTEND_IMAGE IMAGE_PULL_POLICY
ok "env.azure loaded (DOMAIN=${DOMAIN})"

[ -f "${BACKEND_SECRET}" ] \
  || die "Missing ${BACKEND_SECRET}. Copy it: cp backend/deploy/k8s/secret.example.yaml backend/deploy/k8s/secret.yaml"
ok "backend secret present"

# ── 2. Azure authentication (verify only) ──────────────────────────────────────

step "Verifying Azure authentication"
az account show >/dev/null 2>&1 \
  || die "Not logged in to Azure. Run: az login  (then 'az account set --subscription <id>' if needed)"
ok "Azure session active ($(az account show --query name -o tsv))"

# ── 3. Kubeconfig from Terraform state ─────────────────────────────────────────

step "Refreshing kubeconfig from Terraform output"
KUBECONFIG_TMP="$(mktemp)"
MERGED_TMP="$(mktemp)"
trap 'rm -f "${KUBECONFIG_TMP}" "${MERGED_TMP}"' EXIT

terraform -chdir="${TERRAFORM_DIR}" output -raw kube_config > "${KUBECONFIG_TMP}" 2>/dev/null \
  || die "terraform output failed. Provision the cluster first: cd cluster/terraform && terraform apply"

# An empty output means the state holds no cluster (e.g. after a destroy).
[ -s "${KUBECONFIG_TMP}" ] && grep -q 'server:' "${KUBECONFIG_TMP}" \
  || die "Terraform returned no kubeconfig. The cluster is not provisioned. Run: cd cluster/terraform && terraform apply"

mkdir -p "${HOME}/.kube"
# Fresh config first so its values win over any stale entry on conflict.
KUBECONFIG="${KUBECONFIG_TMP}:${HOME}/.kube/config" \
  kubectl config view --flatten > "${MERGED_TMP}"
mv "${MERGED_TMP}" "${HOME}/.kube/config"
kubectl config use-context "${EXPECTED_CONTEXT}" >/dev/null
ok "kubeconfig merged, context set to ${EXPECTED_CONTEXT}"

# ── 4. Context guard (critical) ────────────────────────────────────────────────

step "Guarding kubectl context"
current="$(kubectl config current-context)"
[ "${current}" = "${EXPECTED_CONTEXT}" ] \
  || die "Current context is '${current}', expected '${EXPECTED_CONTEXT}'. Aborting to avoid hitting the wrong cluster."
ok "context confirmed: ${current}"

# Wait until the API server FQDN resolves and answers. After a fresh
# terraform apply the DNS suffix may take a moment to propagate.
step "Waiting for the API server to respond"
i=0
while [ "${i}" -lt "${API_RETRIES}" ]; do
  if kubectl version >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep "${API_INTERVAL}"
done
[ "${i}" -lt "${API_RETRIES}" ] \
  || die "API server unreachable after $((API_RETRIES * API_INTERVAL))s (DNS not resolving?). Try: kubectl get nodes"
ok "API server reachable"

# ── 5. Gateway API CRDs ────────────────────────────────────────────────────────

step "Installing Gateway API CRDs (${GATEWAY_API_VERSION})"
# --validate=false: skip the openapi schema download from the API server.
# Safe here, this is the official upstream CRD manifest, not user content.
kubectl apply --validate=false -f "https://github.com/kubernetes-sigs/gateway-api/releases/download/${GATEWAY_API_VERSION}/standard-install.yaml"
ok "Gateway API CRDs applied"

# ── 6. Traefik (idempotent) ────────────────────────────────────────────────────

step "Deploying Traefik"
helm repo add traefik https://traefik.github.io/charts >/dev/null 2>&1 || true
helm repo update traefik >/dev/null
helm upgrade --install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  -f "${REPO_ROOT}/cluster/k8s/traefik/values.yaml"
ok "Traefik installed/upgraded"

step "Confirming GatewayClass is accepted"
kubectl get gatewayclass
ok "GatewayClass present"

# ── 7. Verify the LoadBalancer picked up the static IP ─────────────────────────

step "Waiting for Traefik LoadBalancer external IP"
external_ip=""
i=0
while [ "${i}" -lt "${LB_IP_RETRIES}" ]; do
  external_ip="$(kubectl get svc traefik -n traefik \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  [ -n "${external_ip}" ] && break
  i=$((i + 1))
  sleep "${LB_IP_INTERVAL}"
done

if [ -z "${external_ip}" ]; then
  warn "LoadBalancer IP not assigned yet after $((LB_IP_RETRIES * LB_IP_INTERVAL))s. Continuing, but routing may not work until Azure assigns it."
elif [ "${external_ip}" != "${DOMAIN}" ]; then
  warn "Traefik EXTERNAL-IP (${external_ip}) differs from DOMAIN (${DOMAIN}). Check the loadBalancerIP annotation in traefik/values.yaml."
else
  ok "Traefik bound to the static IP ${external_ip}"
fi

# ── 8. Application deployment ──────────────────────────────────────────────────

step "Applying shared cluster resources (namespace + gateway)"
# The namespace and the Gateway can race on the first apply; retry once.
kubectl apply -f "${REPO_ROOT}/cluster/k8s/pool/" -R \
  || { warn "First apply failed (likely namespace race), retrying"; \
       kubectl apply -f "${REPO_ROOT}/cluster/k8s/pool/" -R; }
ok "namespace + gateway applied"

step "Deploying PostgreSQL"
kubectl apply -f "${REPO_ROOT}/db/deploy/k8s/" -R
ok "PostgreSQL applied"

step "Deploying Redis"
kubectl apply -f "${REPO_ROOT}/redis/deploy/k8s/" -R
ok "Redis applied"

step "Waiting for PostgreSQL to be ready"
kubectl wait --for=condition=ready pod -l app=postgres -n pool --timeout="${POSTGRES_WAIT_TIMEOUT}" \
  || die "PostgreSQL did not become ready within ${POSTGRES_WAIT_TIMEOUT}"
ok "PostgreSQL ready"

step "Deploying backend"
# Secret and service first: the backend pod consumes the secret at boot.
kubectl apply -f "${BACKEND_SECRET}" -f "${REPO_ROOT}/backend/deploy/k8s/service.yaml"
envsubst < "${REPO_ROOT}/backend/deploy/k8s/deployment.yaml" | kubectl apply -f -
envsubst < "${REPO_ROOT}/backend/deploy/k8s/httpRoute.yaml" | kubectl apply -f -
ok "backend deployed"

step "Deploying frontend"
kubectl apply -f "${REPO_ROOT}/frontend/deploy/k8s/service.yaml"
envsubst < "${REPO_ROOT}/frontend/deploy/k8s/deployment.yaml" | kubectl apply -f -
envsubst < "${REPO_ROOT}/frontend/deploy/k8s/httpRoute.yaml" | kubectl apply -f -
ok "frontend deployed"

# ── 9. Final verification ──────────────────────────────────────────────────────

step "Final state"
kubectl get pods -n pool
kubectl get gateway,httproute -n pool

printf '\n%sDeployment complete.%s\n' "${C_GREEN}" "${C_RESET}"
printf '  Frontend : http://web.%s\n' "${DOMAIN}"
printf '  Backend  : http://api.%s/api\n' "${DOMAIN}"