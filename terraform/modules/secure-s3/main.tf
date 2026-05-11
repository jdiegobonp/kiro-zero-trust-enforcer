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
    Module             = "secure-s3"
  }
  merged_tags    = merge(local.default_tags, var.tags)
  use_custom_key = var.kms_key_id != ""
}

resource "aws_kms_key" "bucket" {
  count                   = local.use_custom_key ? 0 : 1
  description             = "KMS key for S3 bucket ${var.bucket_name}"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  tags                    = local.merged_tags
}

resource "aws_kms_alias" "bucket" {
  count         = local.use_custom_key ? 0 : 1
  name          = "alias/s3-${var.bucket_name}"
  target_key_id = aws_kms_key.bucket[0].key_id
}

locals {
  effective_kms_key_id = local.use_custom_key ? var.kms_key_id : aws_kms_key.bucket[0].arn
}

resource "aws_s3_bucket" "this" {
  bucket        = var.bucket_name
  force_destroy = var.allow_force_destroy
  tags          = local.merged_tags
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = local.effective_kms_key_id
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_logging" "this" {
  count         = var.logging_bucket_id != "" ? 1 : 0
  bucket        = aws_s3_bucket.this.id
  target_bucket = var.logging_bucket_id
  target_prefix = var.logging_prefix
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "tiered-storage"
    status = "Enabled"
    filter {}

    transition {
      days          = var.lifecycle_ia_transition_days
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = var.lifecycle_glacier_transition_days
      storage_class = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "deny_non_tls" {
  bucket = aws_s3_bucket.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.this.arn,
          "${aws_s3_bucket.this.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.this]
}
