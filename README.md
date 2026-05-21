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

> When releasing a new version, bump the image tag, rebuild, reload into Minikube,
> and update the `image:` field in the corresponding `deployment.yaml` before re-applying manifests.

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

The external IP assigned to the Traefik LoadBalancer service is stable as long as the service exists,
but must be retrieved once after installation to configure the HTTPRoutes.

```bash
kubectl get svc traefik -n traefik
```

Note the value in the `EXTERNAL-IP` column (e.g. `10.101.159.91`).

Update the `hostnames` field in both HTTPRoute files with this IP :

```
backend/deploy/k8s/httproute.yaml  ->  api.<EXTERNAL-IP>.nip.io
frontend/deploy/k8s/httproute.yaml ->  web.<EXTERNAL-IP>.nip.io
```

---

## Deploy the application

Apply shared cluster resources (namespace + gateway) :

```bash
kubectl apply -f cluster/k8s/pool/ -R
```

Apply backend and frontend manifests :

```bash
kubectl apply -f backend/deploy/k8s/ -R
kubectl apply -f frontend/deploy/k8s/ -R
```

---

## Verify

```bash
# All pods running
kubectl get pods -n pool

# Gateway and routes accepted
kubectl get gateway,httproute -n pool
```

Expected : Gateway `Programmed: True`, both HTTPRoutes `Accepted: True`.

```bash
curl http://api.<EXTERNAL-IP>.nip.io/api/health
# Expected : {"status":"ok"}

curl -I http://web.<EXTERNAL-IP>.nip.io
# Expected : HTTP/1.1 200 OK
```

---

## Teardown

```bash
# Remove application manifests
kubectl delete -f backend/deploy/k8s/ -R
kubectl delete -f frontend/deploy/k8s/ -R
kubectl delete -f cluster/k8s/pool/ -R

# Remove Traefik
helm uninstall traefik --namespace traefik

# Stop cluster
minikube stop
```