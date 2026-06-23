# Pool - Cluster Setup

## Prerequisites

The following tools must be installed on your machine.

### kubectl
```bash
# Pacman
sudo pacman -S kubectl
```
```bash
# Verify
kubectl version --client
```

### Minikube
```bash
# Pacman
sudo pacman -S minikube
```
```bash
# Verify
minikube version
```

### Helm
```bash
# Pacman
sudo pacman -S helm
```
```bash
# Verify
helm version
```

---

## Start the cluster

```bash
minikube start
```

Enable the tunnel to expose LoadBalancer services (run in a dedicated terminal, keep it open) :

```bash
minikube tunnel
```

---

## Build images

### Backend
```bash
cd backend
docker build -t pool-backend:1.0.0 .
cd ..
```

### Frontend

`VITE_API_URL` is resolved at runtime via nginx proxy to the backend service - no IP required at build time.

```bash
cd frontend
docker build -t pool-frontend:1.0.0 .
cd ..
```

### Load images into Minikube

```bash
minikube image load pool-backend:1.0.0
minikube image load pool-frontend:1.0.0
```

### Verify images are available in Minikube

```bash
minikube image ls | grep pool
```

Expected : `docker.io/library/pool-backend:1.0.0` and `docker.io/library/pool-frontend:1.0.0`.

---

## Deploy Traefik

Add the Helm chart repository (once) :

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
```

Install Traefik :

```bash
helm install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  -f cluster/k8s/traefik/values.yaml
```

Verify the GatewayClass is ready :

```bash
kubectl get gatewayclass
```

Expected : a `traefik` GatewayClass with `ACCEPTED: True`.

---

## Retrieve the Traefik external IP

```bash
kubectl get svc traefik -n traefik
```

Note the value in the `EXTERNAL-IP` column (e.g. `10.101.159.91`).

Set `GATEWAY_IP` in `cluster/k8s/.env.local` to this value, then render and apply the HTTPRoute templates :

```bash
source cluster/k8s/.env.local
envsubst < backend/deploy/k8s/httproute.yaml | kubectl apply -f -
envsubst < frontend/deploy/k8s/httproute.yaml | kubectl apply -f -
```

---

## Setup secrets

Secret files are gitignored. Copy the example files and fill in the values before deploying.

```bash
cp db/deploy/k8s/secret.example.yaml db/deploy/k8s/secret.yaml
cp backend/deploy/k8s/secret.example.yaml backend/deploy/k8s/secret.yaml
```

Edit each file and replace the placeholder values :

- `db/deploy/k8s/secret.yaml` : set `POSTGRES_USER` and `POSTGRES_PASSWORD`
- `backend/deploy/k8s/secret.yaml` : set `DATABASE_URL` (must match postgres credentials above), `JWT_SECRET` (use a long random string, e.g. `openssl rand -hex 64`)

The `REDIS_URL` and `JWT_EXPIRES_IN` fields can be left as-is for local development.

---

## Deploy the application

Apply shared cluster resources (namespace + gateway), if a namespace error occurs just try a second time :

```bash
kubectl apply -f cluster/k8s/pool/ -R
```

Apply infrastructure services first, then backend and frontend :

```bash
kubectl apply -f db/deploy/k8s/ -R
kubectl apply -f redis/deploy/k8s/ -R
kubectl apply -f backend/deploy/k8s/ -R
kubectl apply -f frontend/deploy/k8s/ -R
```

> The backend pod will not start until PostgreSQL is ready. The init container (`db-init`) runs
> `prisma migrate deploy` then `prisma db seed` before the main container starts. If postgres is
> not yet ready, K8s retries automatically until it succeeds.

---

## Verify

```bash
# All pods running
kubectl get pods -n pool

# Gateway and routes accepted
kubectl get gateway,httproute -n pool
```

Expected : Gateway `Programmed: True`, both HTTPRoutes `Accepted: True`.

### Front

```bash
curl -I http://web.<EXTERNAL-IP>.nip.io
# Expected : HTTP/1.1 200 OK
```

### Back

Check if swagger doc is available in your browser at :   
> http://api.<EXTERNAL-IP>.nip.io/api

---

## Updating an image

Minikube does not re-pull an image if the tag already exists in its local registry, even after a
`minikube image load`. The following procedure guarantees the new image is actually used.

> The backend has a helper script at `backend/minkube_load_image.sh` that automates steps 1-4.

```bash
# 1. Scale down to 0 to release the image lock
kubectl scale deployment/<name> -n pool --replicas=0

# 2. Remove the old image from Minikube
minikube image rm docker.io/library/<name>:<tag>

# 3. Remove the old image from Docker (optional but avoids tag confusion)
docker rmi <name>:<tag>

# 4. Rebuild and reload
docker build -t <name>:<tag> .
minikube image load <name>:<tag>

# 5. Update the image tag in the manifest if the tag changed, then reapply
#    WARNING: the tag in deployment.yaml must match exactly what was loaded
kubectl apply -f deploy/k8s/ -R
```

---

## Teardown

```bash
# Remove application manifests
kubectl delete -f backend/deploy/k8s/ -R
kubectl delete -f frontend/deploy/k8s/ -R
kubectl delete -f db/deploy/k8s/ -R
kubectl delete -f redis/deploy/k8s/ -R
kubectl delete -f cluster/k8s/pool/ -R

# Remove Traefik
helm uninstall traefik --namespace traefik

# Stop cluster
minikube stop
```

---

# Azure Deployment (AKS + Terraform)

Cluster deployment on Azure Kubernetes Service via Terraform, as an alternative to the local Minikube setup. Routing relies on Traefik through the Gateway API, same as the Minikube setup.

## Prerequisites

### Azure CLI
```bash
# Pacman
sudo pacman -S azure-cli
```
```bash
# Verify
az version
```

### Terraform
```bash
# Pacman
sudo pacman -S terraform
```
```bash
# Verify
terraform version
```

---

## Connect to Azure

```bash
# Login (opens the browser)
az login
```

```bash
# Check the active subscription
az account show --output table
```

```bash
# If multiple subscriptions, select the right one
az account set --subscription "<SUBSCRIPTION_ID>"
```

> Student subscriptions are commonly restricted to a subset of Azure regions
> and VM sizes by a tenant-level policy. Check the allowed regions with:
> ```bash
> az policy assignment list --query "[?contains(displayName, 'location')]" --output json
> ```
> Look for `parameters.listOfAllowedLocations.value` in the result. VM size
> restrictions are not exposed this way — they only surface as an error when
> `terraform apply` attempts to create the cluster, with the allowed sizes
> listed in the error message.

---

## Network resource group + static IP

> Specific to the Azure plan. Provision once, kept across the cluster's
> `terraform destroy` / `apply` cycles to preserve a stable public IP.

```bash
# Create the network resource group (if not already done)
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
# Retrieve the allocated IP (report it into cluster/k8s/.env.azure)
az network public-ip show \
  --resource-group rg-cueballs-network \
  --name pip-cueballs-gateway \
  --query ipAddress -o tsv
```

Update the export line in cluster/k8s/.env.azure.   

The static IP is assigned to the `LoadBalancer` service that Traefik exposes for its
`web` entrypoint (Gateway API, HTTP on port 8000). It is wired through the Traefik Helm
values (`service` annotations / `loadBalancerIP`), giving a stable nip.io hostname unlike
the Minikube setup, where the IP came from `minikube tunnel`.

> This resource group and IP are billed continuously (~3-4$/month for the
> Standard static IP), independent of the cluster's lifecycle. They are
> intentionally kept outside Terraform's state so that destroying the cluster
> never affects them.

---

## Provision the infrastructure (Terraform)

Terraform code lives in `cluster/terraform/`.

> The network resource group (`rg-cueballs-network`) and the static public IP are
> referenced by Terraform but created beforehand (see section above).

```bash
cd cluster/terraform
```

```bash
# Initialize (downloads the azurerm provider, sets up the backend)
terraform init
```

```bash
# Review the plan (dry-run) before any apply
terraform plan
```

```bash
# Apply — creates the cluster RG, the AKS cluster and the role assignment
# AKS provisioning takes ~3 to 5 min
terraform apply
```

Resources created:
- `azurerm_resource_group.cluster`: `rg-cueballs-cluster` (region: `polandcentral`)
- `azurerm_kubernetes_cluster.main`: `aks-cueballs` (1 node `Standard_B2as_v2`, Free SKU)
- `azurerm_role_assignment.aks_network_contributor`: Network Contributor role on the network RG

> Note: the student subscription policy restricts which regions and VM sizes
> are allowed (see `cluster/terraform/variables.tf` for the current `location`
> default). If `terraform apply` fails with a region or VM size error, check
> the allowed list returned in the error message before retrying.

```bash
# Tear down everything (cluster, node, LB, disks) when done for the session
terraform destroy
```

> `terraform destroy` does not touch `rg-cueballs-network` or the static IP —
> they live outside this Terraform state by design.

---

## Retrieve the kubectl context

> The AKS API server FQDN embeds a random suffix regenerated on every cluster
> creation. After a `terraform destroy` / `apply` cycle the FQDN changes, so any
> kubeconfig entry from a previous cluster goes stale and resolves to
> "no such host". The kubeconfig must be refreshed after every `apply`.

Refresh it straight from the Terraform state (does not depend on the Azure CLI):

```bash
# Dump the fresh kubeconfig exposed by the cluster module output
terraform output -raw kube_config > /tmp/aks-cueballs.kubeconfig
```

```bash
# Merge it into ~/.kube/config, keeping other contexts (e.g. minikube) intact.
# The fresh file is listed FIRST so its values win over any stale entry on conflict.
KUBECONFIG=/tmp/aks-cueballs.kubeconfig:$HOME/.kube/config \
  kubectl config view --flatten > /tmp/kubeconfig.merged
mv /tmp/kubeconfig.merged "$HOME/.kube/config"
```

```bash
# Sanity check
kubectl config current-context   # → aks-cueballs
kubectl get nodes                # → node Ready
```

> Fallback only: `az aks get-credentials --resource-group rg-cueballs-cluster \
> --name aks-cueballs --overwrite-existing` achieves the same result but relies on
> a working Azure CLI, which can break on dependency upgrades on a rolling-release
> distro. The Terraform output method above is the reliable default.

> To switch back to Minikube: `kubectl config use-context minikube`.
> Always check `kubectl config current-context` before any `apply` / `delete`.

---

## Deploy Traefik

Traefik is installed via Helm with the Gateway API provider enabled (`kubernetesGateway`)
and the Ingress provider disabled. The `web` listener serves HTTP on port 8000 and accepts
routes from all namespaces.

```bash
# Install Gateway API CRDs before Traefik, the Helm chart requires them to exist at install time.
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
```

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
```

```bash
helm install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  -f cluster/k8s/traefik/values.yaml
```

```bash
# Confirm the GatewayClass is accepted by the cluster before proceeding
kubectl get gatewayclass
```

```bash
# The EXTERNAL-IP should match the reserved static IP (pip-cueballs-gateway).
kubectl get svc traefik -n traefik
```

> The external IP should match the reserved static IP. Report it into `cluster/k8s/.env.azure`,
> then render and apply the HTTPRoute templates as in the Minikube setup.

---

## Deploy cluster

```bash
# Load env vars (GATEWAY_IP, BACKEND_IMAGE, FRONTEND_IMAGE, IMAGE_PULL_POLICY)
# required by envsubst for the templated manifests below
source cluster/k8s/.env.azure
```

```bash
# Create the pool namespace and the Gateway object (Traefik entry point).
# If a namespace error occurs on first run, apply a second time.
kubectl apply -f cluster/k8s/pool/ -R
```

```bash
# Deploy PostgreSQL StatefulSet + PVC + Service
kubectl apply -f db/deploy/k8s/ -R
```

```bash
# Deploy Redis 
kubectl apply -f redis/deploy/k8s/ -R
```

```bash
# Block until the postgres pod is Ready before applying the backend.
kubectl wait --for=condition=ready pod -l app=postgres -n pool --timeout=120s
```

```bash
# Render the backend Deployment manifest and apply it.
envsubst < backend/deploy/k8s/deployment.yaml | kubectl apply -f -
```

```bash
# Render and apply the backend HTTPRoute
envsubst < backend/deploy/k8s/httpRoute.yaml | kubectl apply -f -
```

```bash
# Apply backend Secret.
kubectl apply -f backend/deploy/k8s/secret.yaml -f backend/deploy/k8s/service.yaml
```

```bash
# Render and apply the frontend Deployment.
envsubst < frontend/deploy/k8s/deployment.yaml | kubectl apply -f -
```

```bash
# Render and apply the frontend HTTPRoute.
envsubst < frontend/deploy/k8s/httpRoute.yaml | kubectl apply -f -
```

```bash
# Apply the frontend ClusterIP Service
kubectl apply -f frontend/deploy/k8s/service.yaml
```

```bash
# Check all pods are Running in the pool namespace.
# The backend pod starts only after the init container completes (~30s on first deploy).
kubectl get pods -n pool
```