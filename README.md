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

Update the `hostnames` field in both HTTPRoute files with this IP :

```
backend/deploy/k8s/httproute.yaml  ->  api.<EXTERNAL-IP>.nip.io
frontend/deploy/k8s/httproute.yaml ->  web.<EXTERNAL-IP>.nip.io
```

> **What is nip.io ?**
> nip.io is a wildcard DNS service that resolves any hostname of the form `<anything>.<IP>.nip.io`
> directly to `<IP>`, with no DNS configuration required. This lets us use proper hostnames locally
> without editing `/etc/hosts`. The IP here is the one assigned by `minikube tunnel` to the Traefik
> LoadBalancer — it is stable as long as the Traefik Helm release exists, but changes on full reinstall.

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