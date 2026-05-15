variable "target_ids" {
  description = "Organization root, OU, or account IDs to attach the SCPs to. Must be set from the management account."
  type        = list(string)
  validation {
    condition     = length(var.target_ids) > 0
    error_message = "At least one target_id (root, OU, or account) is required."
  }
}

variable "enabled_policies" {
  description = "Set of SCP names to create and attach. Default enables all."
  type        = set(string)
  default = [
    "deny_public_s3",
    "deny_rds_public",
    "deny_unencrypted_rds",
    "deny_open_dangerous_ports",
    "require_mfa_for_admin",
    "deny_outside_regions",
  ]
  validation {
    condition = alltrue([
      for p in var.enabled_policies : contains([
        "deny_public_s3",
        "deny_rds_public",
        "deny_unencrypted_rds",
        "deny_open_dangerous_ports",
        "require_mfa_for_admin",
        "deny_outside_regions",
      ], p)
    ])
    error_message = "Unknown SCP name in enabled_policies."
  }
}

variable "tags" {
  description = "Tags applied to every SCP resource."
  type        = map(string)
  default     = {}
}
