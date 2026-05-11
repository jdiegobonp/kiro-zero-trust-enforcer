output "bucket_id" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.this.arn
}

output "bucket_domain_name" {
  description = "Bucket domain name for use in policies and configurations"
  value       = aws_s3_bucket.this.bucket_domain_name
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for bucket encryption"
  value       = local.effective_kms_key_id
}
