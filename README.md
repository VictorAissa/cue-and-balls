# Pool - Cluster Setup

## Prerequisites

The following tools must be installed on your machine.

### kubectl

```bash
# Arch / CachyOS
sudo pacman -S kubectl
```

```bash
# Verify
kubectl version --client
```

### Minikube

```bash
# Arch / CachyOS
sudo pacman -S minikube
```

```bash
# Verify
minikube version
```

### Helm

```bash
# Arch / CachyOS
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

Expected output : a `traefik` GatewayClass with `ACCEPTED: True`.

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
curl http://api.10.108.143.255.nip.io:8000/api/health
# Expected : {"status":"ok"}

curl -I http://web.10.108.143.255.nip.io:8000
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