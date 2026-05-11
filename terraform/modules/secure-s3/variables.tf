variable "bucket_name" {
  description = "Name of the S3 bucket (globally unique)"
  type        = string
}

variable "kms_key_id" {
  description = "ARN of the KMS key for bucket encryption (leave empty to create a new key)"
  type        = string
  default     = ""
}

variable "logging_bucket_id" {
  description = "Bucket ID to receive S3 access logs (must already exist)"
  type        = string
  default     = ""
}

variable "logging_prefix" {
  description = "Prefix for S3 access log objects"
  type        = string
  default     = "s3-access-logs/"
}

variable "allow_force_destroy" {
  description = "Allow bucket to be destroyed even when non-empty (set false in production)"
  type        = bool
  default     = false
}

variable "lifecycle_ia_transition_days" {
  description = "Days before transitioning objects to STANDARD_IA"
  type        = number
  default     = 30
}

variable "lifecycle_glacier_transition_days" {
  description = "Days before transitioning objects to GLACIER"
  type        = number
  default     = 90
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
