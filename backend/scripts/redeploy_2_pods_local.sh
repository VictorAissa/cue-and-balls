#!/bin/bash
# redeploy-and-forward.sh
kubectl apply -f ../deploy/k8s/deployment.yaml -n pool
kubectl rollout status deployment/backend -n pool

PODS=($(kubectl get pods -n pool -l app=backend --field-selector=status.phase=Running -o jsonpath='{.items[*].metadata.name}'))

echo "Pods: ${PODS[0]} ${PODS[1]}"

kubectl port-forward -n pool pod/${PODS[0]} 3001:3000 &
PF1=$!
kubectl port-forward -n pool pod/${PODS[1]} 3002:3000 &
PF2=$!

echo "Port-forwards actifs — pod[0] -> 3001, pod[1] -> 3002"
echo "Ctrl+C pour tout stopper"

trap "kill $PF1 $PF2 2>/dev/null" EXIT INT
wait