# Deployment manual

Procedures to deploy the Cue & Balls stack on a Kubernetes cluster. Two targets are
covered: Azure Kubernetes Service (AKS), which is the primary target, and a local
Minikube cluster as an alternative.

Each target offers a one-command script as the recommended path, plus the individual
command blocks for a step-by-step setup when you need to understand or debug a stage.

## 1. Prerequisites

### Common tools

Required for both targets.

```bash
# CachyOS / Arch (or your distro's package manager)
sudo pacman -S kubectl helm docker git

# envsubst ships with gettext
sudo pacman -S gettext
```

```bash
kubectl version --client
helm version
docker --version
envsubst --version
```

`envsubst` renders the templated manifests (`deployment.yaml`, `httpRoute.yaml`) from the
per-environment variables described in section 4.

### Azure target only

```bash
sudo pacman -S azure-cli terraform
```

```bash
az version
terraform version
```

### Local target only

```bash
sudo pacman -S minikube
```

```bash
minikube version
```

---

## 2. Azure deployment (AKS)

Routing relies on Traefik through the Gateway API, same as the local setup.

### 2.0 Connect to Azure

```bash
# Login (opens the browser)
az login
```

```bash
# Check the active subscription
az account show --output table
```

```bash
# Select the right subscription if you have several
az account set --subscription "<SUBSCRIPTION_ID>"
```

Student subscriptions are commonly restricted to a subset of regions and VM sizes by a
tenant-level policy. Check the allowed regions with:

```bash
az policy assignment list \
  --query "[?contains(displayName, 'location')]" --output json
```

Look for `parameters.listOfAllowedLocations.value`. VM size restrictions are not exposed
this way; they only surface as an error when `terraform apply` tries to create the
cluster, with the allowed sizes listed in the error message.

### 2.1 Network resource group and static IP (one-time)

This step provisions a stable public IP, kept outside the cluster lifecycle so it survives
`terraform destroy` / `apply` cycles. It is the default, documented path: the IP is wired
into Traefik and the cluster is built around it.

```bash
# Create the network resource group (once)
az group create --name rg-cueballs-network --location polandcentral
```

```bash
# Reserve a static public IP
az network public-ip create \
  --resource-group rg-cueballs-network \
  --name pip-cueballs-gateway \
  --sku Standard \
  --allocation-method Static
```

```bash
# Retrieve the allocated IP and report it into cluster/k8s/.env.azure (DOMAIN)
az network public-ip show \
  --resource-group rg-cueballs-network \
  --name pip-cueballs-gateway \
  --query ipAddress -o tsv
```

This resource group and IP are billed continuously (about 3 to 4 USD per month for the
Standard static IP), independently of the cluster. They are intentionally kept outside
Terraform's state so destroying the cluster never affects them.

> Variant without a reserved IP: you can skip this step and let Azure assign a dynamic IP
> to the Traefik LoadBalancer, then read it from `kubectl get svc traefik -n traefik`
> after Traefik is deployed, set `DOMAIN` accordingly and remove the static IP wiring from
> `cluster/k8s/traefik/values.yaml`. This breaks the one-command flow (the IP is not known
> in advance), so the reserved IP above is recommended.

### 2.2 Provision the infrastructure (Terraform)

Terraform code lives in `cluster/terraform/`. It references the network resource group and
the static IP created above.

```bash
cd cluster/terraform
```

```bash
# Initialize (downloads the azurerm provider, sets up the backend)
terraform init
```

```bash
# Review the plan before applying
terraform plan
```

```bash
# Apply. AKS provisioning takes about 3 to 5 minutes.
terraform apply
```

Resources created:

- `azurerm_resource_group.cluster`: `rg-cueballs-cluster` (region `polandcentral`)
- `azurerm_kubernetes_cluster.main`: `aks-cueballs` (1 node `Standard_B2as_v2`, Free SKU)
- `azurerm_role_assignment.aks_network_contributor`: Network Contributor on the network RG,
  required so the cluster can attach the static IP that lives in a separate resource group

```bash
# Tear everything down when done for the session
terraform destroy
```

`terraform destroy` does not touch `rg-cueballs-network` or the static IP; they live
outside this Terraform state by design.

### 2.3 Deploy the application

#### Recommended: one command

After `terraform apply` succeeds, run the deployment script from the repo root:

```bash
./cluster/deploy-azure.sh
```

It performs the full post-apply sequence: refresh the kubeconfig from the Terraform
output, guard the kubectl context, wait for the API server, install the Gateway API CRDs,
install Traefik, wait for the LoadBalancer IP, then deploy the namespace, Gateway,
PostgreSQL, Redis, backend and frontend in order.

Prerequisites checked by the script:

- `cluster/k8s/.env.azure` exists and defines `DOMAIN`, `BACKEND_IMAGE`, `FRONTEND_IMAGE`,
  `IMAGE_PULL_POLICY` (see section 4)
- `backend/deploy/k8s/secret.yaml` exists (copy it from the example, see section 3 of the
  local setup for the field values)

#### Alternative: step by step

The blocks below reproduce what the script does, in order.

```bash
# 1. Refresh the kubeconfig from the Terraform state.
#    The AKS API server FQDN changes on every cluster recreation, so the kubeconfig
#    must be refreshed after every apply.
terraform -chdir=cluster/terraform output -raw kube_config > /tmp/aks-cueballs.kubeconfig
KUBECONFIG=/tmp/aks-cueballs.kubeconfig:$HOME/.kube/config \
  kubectl config view --flatten > /tmp/kubeconfig.merged
mv /tmp/kubeconfig.merged "$HOME/.kube/config"
kubectl config use-context aks-cueballs
```

```bash
# Sanity check before touching the cluster
kubectl config current-context   # -> aks-cueballs
kubectl get nodes                # -> node Ready
```

```bash
# 2. Install the Gateway API CRDs (Traefik's Helm chart requires them at install time)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
```

```bash
# 3. Install Traefik (Gateway API provider, web listener on port 8000)
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm upgrade --install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  -f cluster/k8s/traefik/values.yaml
```

```bash
# Confirm the GatewayClass is accepted and the LoadBalancer picked up the static IP
kubectl get gatewayclass
kubectl get svc traefik -n traefik
```

```bash
# 4. Load the per-environment variables consumed by envsubst
source cluster/k8s/.env.azure
```

```bash
# 5. Shared resources: namespace, Gateway, GHCR pull secret.
#    If a namespace race error occurs on first run, apply a second time.
kubectl apply -f cluster/k8s/pool/ -R
```

```bash
# 6. PostgreSQL, then Redis
kubectl apply -f db/deploy/k8s/ -R
kubectl apply -f redis/deploy/k8s/ -R
```

```bash
# 7. Block until PostgreSQL is ready (the backend init container depends on it)
kubectl wait --for=condition=ready pod -l app=postgres -n pool --timeout=120s
```

```bash
# 8. Backend. Secret and Service are plain manifests; Deployment and HTTPRoute are
#    templated and rendered with envsubst.
kubectl apply -f backend/deploy/k8s/secret.yaml -f backend/deploy/k8s/service.yaml
envsubst < backend/deploy/k8s/deployment.yaml | kubectl apply -f -
envsubst < backend/deploy/k8s/httpRoute.yaml  | kubectl apply -f -
```

```bash
# 9. Frontend
kubectl apply -f frontend/deploy/k8s/service.yaml
envsubst < frontend/deploy/k8s/deployment.yaml | kubectl apply -f -
envsubst < frontend/deploy/k8s/httpRoute.yaml  | kubectl apply -f -
```

### 2.4 Verify

```bash
kubectl get pods -n pool
kubectl get gateway,httproute -n pool
```

Expected: every pod `Running`, Gateway `Programmed: True`, both HTTPRoutes
`Accepted: True`. The backend pod starts only after its init container completes (about 30s
on the first deploy), which runs the Prisma migration and seed.

```bash
# Frontend
curl -I http://web.<DOMAIN>          # -> HTTP/1.1 200 OK
```

The backend Swagger UI is available at `http://api.<DOMAIN>/api`.

### 2.5 Teardown

For Azure, the teardown is the Terraform destroy from section 2.2, which removes the
cluster, node, LoadBalancer and disks in one go. The network resource group and static IP
survive.

---

## 3. Local deployment (Minikube)

### 3.1 Start the cluster

```bash
minikube start
```

```bash
# Expose LoadBalancer services. Run in a dedicated terminal and keep it open.
minikube tunnel
```

### 3.2 Build and load images

Minikube does not pull from GHCR here; it uses images loaded into its local registry.

```bash
# Backend
cd backend && docker build -t pool-backend:1.0.0 . && cd ..
# Frontend
cd frontend && docker build -t pool-frontend:1.0.0 . && cd ..
```

```bash
minikube image load pool-backend:1.0.0
minikube image load pool-frontend:1.0.0
minikube image ls | grep pool
```

The helper `cluster/minikube/minikube_load_image.sh` automates the rebuild and reload of
the backend image (scale down, remove the cached image, rebuild, reload). It exists because
Minikube does not re-pull an image whose tag already exists in its local registry, even
after a fresh `minikube image load`.

### 3.3 Deploy Traefik

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  -f cluster/k8s/traefik/values.yaml
```

```bash
kubectl get gatewayclass
# Note the EXTERNAL-IP (assigned by minikube tunnel)
kubectl get svc traefik -n traefik
```

Set `DOMAIN` in `cluster/k8s/.env.local` to `<EXTERNAL-IP>.nip.io`, and point
`BACKEND_IMAGE` / `FRONTEND_IMAGE` at the locally loaded tags with
`IMAGE_PULL_POLICY=IfNotPresent`.

### 3.4 Secrets

Secret files are gitignored. Copy the examples and fill in the values.

```bash
cp db/deploy/k8s/secret.example.yaml db/deploy/k8s/secret.yaml
cp backend/deploy/k8s/secret.example.yaml backend/deploy/k8s/secret.yaml
```

- `db/deploy/k8s/secret.yaml`: set `POSTGRES_USER` and `POSTGRES_PASSWORD`
- `backend/deploy/k8s/secret.yaml`: set `DATABASE_URL` (must match the postgres
  credentials above) and `JWT_SECRET` (a long random string, e.g. `openssl rand -hex 64`).
  `REDIS_URL` and `JWT_EXPIRES_IN` can stay as-is for local development.

### 3.5 Deploy the application

```bash
source cluster/k8s/.env.local
```

```bash
# Shared resources (retry once on a namespace race)
kubectl apply -f cluster/k8s/pool/ -R
```

```bash
kubectl apply -f db/deploy/k8s/ -R
kubectl apply -f redis/deploy/k8s/ -R
kubectl wait --for=condition=ready pod -l app=postgres -n pool --timeout=120s
```

```bash
# Backend
kubectl apply -f backend/deploy/k8s/secret.yaml -f backend/deploy/k8s/service.yaml
envsubst < backend/deploy/k8s/deployment.yaml | kubectl apply -f -
envsubst < backend/deploy/k8s/httpRoute.yaml  | kubectl apply -f -
```

```bash
# Frontend
kubectl apply -f frontend/deploy/k8s/service.yaml
envsubst < frontend/deploy/k8s/deployment.yaml | kubectl apply -f -
envsubst < frontend/deploy/k8s/httpRoute.yaml  | kubectl apply -f -
```

Verification is the same as the Azure target (section 2.4), against
`http://web.<DOMAIN>` and `http://api.<DOMAIN>/api`.

### 3.6 Update an image

A new image with the same tag is ignored by Minikube. Force the update:

```bash
# 1. Scale down to release the image lock
kubectl scale deployment/backend -n pool --replicas=0
# 2. Remove the old image from Minikube
minikube image rm docker.io/library/pool-backend:1.0.0
# 3. Remove it from Docker (optional, avoids tag confusion)
docker rmi pool-backend:1.0.0
# 4. Rebuild and reload
cd backend && docker build -t pool-backend:1.0.0 . && cd ..
minikube image load pool-backend:1.0.0
# 5. Scale back up (or reapply the deployment)
kubectl scale deployment/backend -n pool --replicas=2
```

Steps 1 to 4 are automated by `cluster/minikube/minikube_load_image.sh`.

To test multi-pod behavior locally, `cluster/minikube/redeploy_2_pods_local.sh` redeploys
the backend and opens a port-forward to two running pods (3001 and 3002), so you can drive
each pod independently and exercise the Redis pub/sub routing.

### 3.7 Teardown

```bash
kubectl delete -f backend/deploy/k8s/ -R
kubectl delete -f frontend/deploy/k8s/ -R
kubectl delete -f db/deploy/k8s/ -R
kubectl delete -f redis/deploy/k8s/ -R
kubectl delete -f cluster/k8s/pool/ -R
helm uninstall traefik --namespace traefik
minikube stop
```

---

## 4. Environment variables

Both targets render the templated manifests with `envsubst` from a per-environment file.
The only difference between targets is which file you `source`:
`cluster/k8s/.env.azure` or `cluster/k8s/.env.local`.

| Variable            | Description                                                                 | Example                                          |
|---------------------|-----------------------------------------------------------------------------|--------------------------------------------------|
| `DOMAIN`            | Base hostname derived from the external IP. Used in the HTTPRoute hostnames (`web.` and `api.`). | `20.215.68.60.nip.io`                            |
| `BACKEND_IMAGE`     | Full backend image reference with tag.                                      | `ghcr.io/victoraissa/cueballs-backend:1.0.0`     |
| `FRONTEND_IMAGE`    | Full frontend image reference with tag.                                     | `ghcr.io/victoraissa/cueballs-frontend:1.0.0`    |
| `IMAGE_PULL_POLICY` | Pull policy applied to both Deployments.                                    | `IfNotPresent`                                   |

On Azure, `BACKEND_IMAGE` and `FRONTEND_IMAGE` point at the images published to GHCR by the
CI pipeline. Locally, they point at the tags loaded into Minikube.

---

## 5. CI/CD

The container images consumed here are built and published to GHCR by the CI pipeline; see
the CI/CD section of the project [README](../README.md). Rolling out a new image is done by
publishing a new tag and updating `BACKEND_IMAGE` / `FRONTEND_IMAGE` in the relevant
`.env` file, since the `IfNotPresent` pull policy ignores a reused tag.
