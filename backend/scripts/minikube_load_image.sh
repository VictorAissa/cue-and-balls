#!/bin/bash
TAG="1.0.0"

kubectl scale deployment/backend -n pool --replicas=0
minikube image rm pool-backend:$TAG 2>/dev/null
docker image rm pool-backend:$TAG
docker build -t pool-backend:$TAG ../.
minikube image load pool-backend:$TAG