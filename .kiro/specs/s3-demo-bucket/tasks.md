# Implementation Tasks: s3-demo-bucket

This document defines the implementation tasks for creating a zero-trust compliant S3 bucket using the secure-s3 Terraform module.

## Overview

- **Feature**: S3 Demo Bucket
- **Spec Type**: New Feature
- **Workflow**: Requirements-First
- **Target**: Instantiate secure-s3 module with dynamic bucket naming

---

## Task List

- [x] 1. Create Terraform directory structure for example

- [x] 2. Create versions.tf with provider requirements

- [x] 3. Create main.tf with module instantiation

- [x] 4. Create outputs.tf for bucket metadata exposure

- [x] 5. Run terraform validate

- [x] 6. Run terraform plan and verify resources

- [ ] *Optional: Run terraform apply in test account*

---

## Task Details

### 1. Create Terraform directory structure for example

**Description**: Create the directory `terraform/examples/s3-demo-bucket/` to hold the Terraform configuration files.

**Location**: `terraform/examples/s3-demo-bucket/`

**Commands**:
```bash
mkdir -p terraform/examples/s3-demo-bucket
```

**Verification**: Directory exists with no files inside.

---

### 2. Create versions.tf with provider requirements

**Description**: Create `versions.tf` to define the required Terraform and AWS provider versions.

**File**: `terraform/examples/s3-demo-bucket/versions.tf`

**Content**:
```hcl
terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

**Verification**: File created, terraform init succeeds.

---

### 3. Create main.tf with module instantiation

**Description**: Create `main.tf` that retrieves the AWS account ID dynamically and instantiates the secure-s3 module.

**File**: `terraform/examples/s3-demo-bucket/main.tf`

**Content**:
```hcl
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
```

**Requirements Covered**:
- Req 1: Dynamic bucket naming with AWS account ID
- Req 2: Module instantiation from secure-s3
- Req 3: Encryption compliance (inherited from module)
- Req 4: Access control compliance (inherited from module)
- Req 5: Transport security compliance (inherited from module)
- Req 6: Versioning compliance (inherited from module)
- Req 9: Lifecycle management (inherited from module)

**Verification**: File created with correct module path and variables.

---

### 4. Create outputs.tf for bucket metadata exposure

**Description**: Create `outputs.tf` to expose bucket metadata for downstream use.

**File**: `terraform/examples/s3-demo-bucket/outputs.tf`

**Content**:
```hcl
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
```

**Requirements Covered**:
- Req 8: Output exposure for bucket_id, bucket_arn, kms_key_arn

**Verification**: File created, outputs match module interface.

---

### 5. Run terraform validate

**Description**: Validate the Terraform configuration for syntax errors and required variables.

**Commands**:
```bash
cd terraform/examples/s3-demo-bucket
terraform init -backend=false
terraform validate
```

**Expected Output**:
```
Success! The configuration is valid.
```

**Verification**: Exit code 0, no errors.

---

### 6. Run terraform plan and verify resources

**Description**: Generate a plan to verify the expected resources will be created.

**Commands**:
```bash
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
```

**Verification**: Plan shows:
- `aws_s3_bucket` resource with correct name pattern
- `aws_kms_key` resource with key rotation
- `aws_s3_bucket_versioning` resource
- `aws_s3_bucket_public_access_block` resource
- `aws_s3_bucket_server_side_encryption_configuration` resource
- `aws_s3_bucket_policy` resource (TLS enforcement)
- `aws_s3_bucket_lifecycle_configuration` resource

---

### *Optional: Run terraform apply in test account

**Description**: Deploy the S3 bucket to AWS for end-to-end testing. Only run in a test account.

**Warning**: This creates real AWS resources. Use a sandbox/test account only.

**Commands**:
```bash
terraform apply
```

**Post-Apply Verification**:
```bash
# Verify bucket exists
aws s3 ls | grep zero-trust-demo

# Verify encryption
aws s3api get-bucket-encryption --bucket <bucket-name>

# Verify public access block
aws s3api get-public-access-block --bucket <bucket-name>

# Verify versioning
aws s3api get-bucket-versioning --bucket <bucket-name>
```

**Cleanup**:
```bash
terraform destroy
```

---

## Dependencies

1. **Prerequisites**: 
   - Terraform >= 1.0 installed
   - AWS credentials configured
   - secure-s3 module at `terraform/modules/secure-s3/`

2. **Sequential Order**:
   - Task 1 must complete before tasks 2-4
   - Tasks 2-4 can be created in any order
   - Task 5 requires tasks 2-4 to be complete
   - Task 6 requires task 5 to complete successfully

---

## Rollback Plan

If deployment fails:

1. **Terraform Error**: Run `terraform destroy` to clean up partial resources
2. **Bucket Name Conflict**: Modify `locals.bucket_name` in main.tf to add suffix (e.g., `-v2`)
3. **Policy Violation**: Ensure spec.yaml passes policy enforcer before deployment

---

## Success Criteria

- [ ] All required Terraform files created in `terraform/examples/s3-demo-bucket/`
- [ ] `terraform validate` passes with exit code 0
- [ ] `terraform plan` shows expected S3 bucket and KMS key resources
- [ ] Bucket name follows pattern `<account-id>-zero-trust-demo`
- [ ] All security controls inherited from secure-s3 module (encryption, public block, TLS, versioning)
- [ ] Optional: Deploy to test account and verify via AWS CLI