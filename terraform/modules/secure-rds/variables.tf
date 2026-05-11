variable "identifier" {
  description = "Unique identifier for the RDS instance"
  type        = string
}

variable "engine" {
  description = "Database engine (postgres, mysql)"
  type        = string
  default     = "postgres"
}

variable "engine_version" {
  description = "Database engine version"
  type        = string
  default     = "15.4"
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GiB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Name of the initial database"
  type        = string
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
}

variable "db_password" {
  description = "Master password for the database"
  type        = string
  sensitive   = true
}

variable "vpc_id" {
  description = "VPC ID where the RDS instance will be deployed"
  type        = string
}

variable "isolated_subnet_ids" {
  description = "List of private/isolated subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "app_security_group_id" {
  description = "Security group ID of the application layer (allowed to connect to RDS)"
  type        = string
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Number of days to retain automated backups (minimum 7)"
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_period >= 7
    error_message = "backup_retention_period must be at least 7 days per zero-trust policy."
  }
}

variable "db_port" {
  description = "Database port"
  type        = number
  default     = 5432
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
