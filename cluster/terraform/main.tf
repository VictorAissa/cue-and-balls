# Cluster resource group: destroyed/recreated along with the cluster itself,
# unlike rg-cueballs-network which holds the persistent static IP.
resource "azurerm_resource_group" "cluster" {
  name     = "rg-cueballs-cluster"
  location = var.location
}

resource "azurerm_kubernetes_cluster" "main" {
  name                = var.cluster_name
  location            = azurerm_resource_group.cluster.location
  resource_group_name = azurerm_resource_group.cluster.name
  dns_prefix          = "cueballs"

  # Free tier: no SLA, no control plane cost.
  sku_tier = "Free"

  default_node_pool {
    name       = "default"
    node_count = var.node_count
    vm_size    = var.node_vm_size
  }

  identity {
    type = "SystemAssigned"
  }
}

# The static public IP lives in a separate, persistent resource group.
# The cluster's managed identity needs Network Contributor there so the
# Traefik LoadBalancer service can attach to that IP via annotations.
resource "azurerm_role_assignment" "aks_network_contributor" {
  scope                = data.azurerm_resource_group.network.id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_kubernetes_cluster.main.identity[0].principal_id
}

data "azurerm_resource_group" "network" {
  name = var.network_resource_group_name
}