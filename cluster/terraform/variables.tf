variable "cluster_name" {
  type        = string
  description = "Name of the AKS cluster"
  default     = "aks-cueballs"
}

variable "location" {
  type        = string
  description = "Azure region — must be one of the regions allowed by the student subscription policy"
  default     = "polandcentral"
}

variable "network_resource_group_name" {
  type        = string
  description = "Name of the pre-existing resource group holding the static public IP"
  default     = "rg-cueballs-network"
}

variable "node_count" {
  type        = number
  description = "Number of nodes in the default node pool"
  default     = 1

  validation {
    condition     = var.node_count > 0 && var.node_count < 5
    error_message = "node_count must stay small: this is a student-credit lab cluster."
  }
}

variable "node_vm_size" {
  type        = string
  description = "VM size for the node pool — B-series burstable to minimize idle cost"
  default     = "Standard_B2as_v2"
}