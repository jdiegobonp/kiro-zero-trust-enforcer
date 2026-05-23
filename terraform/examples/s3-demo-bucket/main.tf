# Data source for dynamic account ID retrieval
data "aws_caller_identity" "current" {}

# Local value for bucket name construction
locals {
  bucket_name = "${data.aws_caller_identity.current.account_id}-zero-trust-demo"
}

# Module instantiation using secure-s3
module "demo_bucket" {
  source = "../../modules/secure-s3"

  bucket_name         = local.bucket_name
  allow_force_destroy = true

  tags = {
    Environment = "demo"
    Purpose     = "zero-trust-demonstration"
    ManagedBy   = "terraform"
  }
}