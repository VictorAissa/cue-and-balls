# Exercice K8s — Architecture 2-tier (Frontend + Backend)

> **Date :** 21/05/2026  
> **IP du nœud :** `10.108.143.255`  
> **Accès DNS :** `<nom>.10.108.143.255.nip.io`

---

## Objectif

Déployer une architecture 2 couches dans Kubernetes et l'exposer via des URLs DNS lisibles grâce à **nip.io** — sans configuration DNS, l'IP est encodée directement dans le nom de domaine.

Le routage externe est assuré par la **Gateway API** (objets `Gateway` + `HTTPRoute`), implémentée ici par **Traefik**.

| Tier     | URL cible                              |
|----------|----------------------------------------|
| Frontend | `http://web.10.108.143.255.nip.io`   |
| Backend  | `http://api.10.108.143.255.nip.io`     |

---

## Prérequis

Vérifiez que les CRDs Gateway API sont bien installés sur le cluster :

```bash
kubectl get crd gateways.gateway.networking.k8s.io httproutes.gateway.networking.k8s.io
```

Si les CRDs sont absents, installez-les :

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/standard-install.yaml
```

Vérifiez également que Traefik est déployé et qu'une `GatewayClass` nommée `traefik` existe :

```bash
kubectl get gatewayclass
```

Vous pouvez vous référer au start-minikube.md pour déployer traefik.

---


## Étape 0 — Namespace

Tous les objets doivent être déployés dans un namespace dédié.

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: {votre-ns}
```

```bash
kubectl apply -f k8s/namespace.yaml
```

---

## Étape 1 — Gateway

La `Gateway` est le point d'entrée unique du cluster. Elle écoute sur le port 80 et accepte les routes déclarées dans le namespace `{votre-ns}`.

```yaml
# k8s/gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: tp-gateway
  namespace: {votre-ns}
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: Same
```

```bash
kubectl apply -f k8s/gateway.yaml

# Vérifier que la Gateway est Ready
kubectl get gateway -n {votre-ns}
```

---

## Étape 2 — Backend (API)

### Deployment

Le backend expose **au minimum un endpoint** :
- `GET /api/health` → `{"status": "ok"}`

Vous pouvez utiliser n'importe quel langage/framework (Node.js/Express, Python/FastAPI, Go…).

```yaml
# k8s/backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: {votre-ns}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: <votre-image>   # ex: monrepo/api:latest
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
```

### Service

Un `ClusterIP` suffit — la Gateway se chargera de l'exposition externe.

```yaml
# k8s/backend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: {votre-ns}
spec:
  selector:
    app: backend
  ports:
    - port: 80
      targetPort: 3000
```

### HTTPRoute

L'`HTTPRoute` rattache ce service à la Gateway en filtrant sur le hostname `api.10.108.143.255.nip.io`.

```yaml
# k8s/backend/httproute.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: backend-route
  namespace: {votre-ns}
spec:
  parentRefs:
    - name: tp-gateway
  hostnames:
    - "api.10.108.143.255.nip.io"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: backend
          port: 80
```

---

## Étape 3 — Frontend

### Deployment

Le frontend doit consommer l'API backend. La variable `VITE_API_URL` (ou équivalent selon votre framework) doit pointer vers l'URL publique de l'API.

```yaml
# k8s/frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: {votre-ns}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: <votre-image>   # ex: monrepo/front:latest
          ports:
            - containerPort: 80
          env:
            - name: VITE_API_URL
              value: "http://api.10.108.143.255.nip.io"
```

### Service

```yaml
# k8s/frontend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: {votre-ns}
spec:
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 80
```

### HTTPRoute

```yaml
# k8s/frontend/httproute.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: frontend-route
  namespace: {votre-ns}
spec:
  parentRefs:
    - name: tp-gateway
  hostnames:
    - "web.10.108.143.255.nip.io"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: frontend
          port: 80
```

---

## Déploiement complet

```bash
# Appliquer tous les manifestes
kubectl apply -f k8s/

# Vérifier que les pods sont Running
kubectl get pods -n {votre-ns}

# Vérifier les services
kubectl get svc -n {votre-ns}

# Vérifier la Gateway et les HTTPRoutes
kubectl get gateway,httproute -n {votre-ns}
```

L'état `Accepted` et `Programmed` sur la Gateway indique que Traefik a bien pris en compte la configuration.

---

## Validation

```bash
# 1. Backend : health check
curl http://api.10.108.143.255.nip.io/api/health
# Attendu : {"status":"ok"}

# 2. Frontend : page HTML
curl -I http://web.10.108.143.255.nip.io
# Attendu : HTTP/1.1 200 OK
```

Ouvrez `http://web.10.108.143.255.nip.io` dans un navigateur et vérifiez que le frontend affiche des données provenant de l'API.

---

## Critères de validation

- [ ] Les pods backend et frontend sont en état `Running`
- [ ] La `Gateway` est en état `Programmed: True`
- [ ] Les deux `HTTPRoute` sont en état `Accepted: True`
- [ ] `curl .../api/health` répond `200` avec un body JSON
- [ ] Le frontend s'affiche dans le navigateur
- [ ] Le frontend appelle l'API (vérifiable via les DevTools réseau)
- [ ] Toutes les ressources sont dans le namespace `{votre-ns}`

---

## Bonus

- Ajouter une `readinessProbe` et une `livenessProbe` sur le backend
- Externaliser la config dans un `ConfigMap` (port, `VITE_API_URL`…)
- Ajouter un second endpoint sur l'API (ex: `GET /api/items`) et l'afficher côté frontend
- Tester la résilience : `kubectl delete pod <backend-pod>` et observer le redémarrage automatique
- Ajouter un filtre de réécriture de chemin sur l'`HTTPRoute` backend (`/api` → `/`)
