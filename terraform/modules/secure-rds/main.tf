terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  default_tags = {
    ZeroTrustCompliant = "true"
    ManagedBy          = "terraform"
    Module             = "secure-rds"
  }
  merged_tags = merge(local.default_tags, var.tags)
}

resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption — ${var.identifier}"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  tags                    = local.merged_tags
}

resource "aws_kms_alias" "rds" {
  name          = "alias/rds-${var.identifier}"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_db_subnet_group" "this" {
  name        = "${var.identifier}-subnet-group"
  description = "Isolated subnet group for ${var.identifier} — no public subnets"
  subnet_ids  = var.isolated_subnet_ids
  tags        = local.merged_tags
}

resource "aws_db_parameter_group" "this" {
  name        = "${var.identifier}-params"
  family      = "${var.engine}${split(".", var.engine_version)[0]}"
  description = "Parameter group for ${var.identifier} — enforces SSL and logging"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  tags = local.merged_tags
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.identifier}-rds-"
  description = "RDS security group for ${var.identifier} — app SG access only"
  vpc_id      = var.vpc_id
  tags        = local.merged_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group_rule" "rds_ingress_from_app" {
  type                     = "ingress"
  description              = "Allow database connections from application security group"
  from_port                = var.db_port
  to_port                  = var.db_port
  protocol                 = "tcp"
  source_security_group_id = var.app_security_group_id
  security_group_id        = aws_security_group.rds.id
}

resource "aws_db_instance" "this" {
  identifier     = var.identifier
  engine         = var.engine
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = var.db_port

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.this.name

  publicly_accessible    = false
  multi_az               = var.multi_az
  deletion_protection    = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "${var.identifier}-final-snapshot"

  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  enabled_cloudwatch_logs_exports  = ["postgresql", "upgrade"]
  performance_insights_enabled     = true
  performance_insights_kms_key_id  = aws_kms_key.rds.arn
  auto_minor_version_upgrade       = true

  tags = local.merged_tags
}
