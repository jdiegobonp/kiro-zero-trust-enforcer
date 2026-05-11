variable "role_name" {
  description = "Name of the IAM role (max 64 chars)"
  type        = string

  validation {
    condition     = length(var.role_name) <= 64
    error_message = "IAM role name must be 64 characters or fewer."
  }
}

variable "trusted_service" {
  description = "AWS service principal that can assume this role (e.g., lambda.amazonaws.com)"
  type        = string
}

variable "policy_statements" {
  description = "List of IAM policy statements"
  type = list(object({
    effect    = string
    actions   = list(string)
    resources = list(string)
    conditions = optional(list(object({
      test     = string
      variable = string
      values   = list(string)
    })), [])
  }))
}

variable "max_session_duration" {
  description = "Maximum session duration in seconds (900–43200)"
  type        = number
  default     = 3600

  validation {
    condition     = var.max_session_duration >= 900 && var.max_session_duration <= 43200
    error_message = "max_session_duration must be between 900 and 43200 seconds."
  }
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
