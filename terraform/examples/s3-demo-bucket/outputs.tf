output "bucket_id" {
  description = "Name of the demo S3 bucket"
  value       = module.demo_bucket.bucket_id
}

output "bucket_arn" {
  description = "ARN of the demo S3 bucket"
  value       = module.demo_bucket.bucket_arn
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for bucket encryption"
  value       = module.demo_bucket.kms_key_arn
}

output "bucket_domain_name" {
  description = "Domain name of the S3 bucket"
  value       = module.demo_bucket.bucket_domain_name
}