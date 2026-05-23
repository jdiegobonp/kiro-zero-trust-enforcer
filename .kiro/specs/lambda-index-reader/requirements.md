# Requirements Document

## Introduction

This document specifies the requirements for an AWS Lambda function named "lector-index" that reads a specific file from S3 with minimal privilege IAM permissions. The solution adheres to Zero Trust security principles, avoiding wildcard actions and resources, and limiting access to only the specific S3 object required for operation.

## Glossary

- **Lambda_Function**: The AWS Lambda function named "lector-index" that reads the index.json file
- **Source_Bucket**: The S3 bucket "mi-bucket-datos" containing the index.json file
- **Index_File**: The specific file "index.json" stored in Source_Bucket
- **Execution_Role**: The IAM role assumed by Lambda_Function with minimal privilege permissions
- **CloudWatch_Logs**: AWS CloudWatch Logs service for Lambda execution logs
- **Log_Group**: The specific CloudWatch log group for Lambda_Function logs

## Requirements

### Requirement 1: Lambda Function Deployment

**User Story:** As a developer, I want to deploy a Lambda function named "lector-index" using Terraform, so that I can read the index.json file from S3 in an automated way.

#### Acceptance Criteria

1. THE Lambda_Function SHALL be named "lector-index"
2. THE Lambda_Function SHALL be deployed using Terraform infrastructure-as-code
3. THE Lambda_Function SHALL use Python 3.11 or later runtime
4. THE Lambda_Function SHALL have a timeout between 30 and 300 seconds
5. THE Lambda_Function SHALL be associated with Execution_Role

### Requirement 2: Minimal Privilege S3 Read Access

**User Story:** As a security architect, I want the Lambda to have read access limited to a single specific file, so that it complies with the principle of least privilege.

#### Acceptance Criteria

1. THE Execution_Role SHALL grant s3:GetObject action only
2. THE Execution_Role SHALL restrict s3:GetObject to resource "arn:aws:s3:::mi-bucket-datos/index.json" exactly
3. THE Execution_Role SHALL NOT use wildcard actions (Action: "*" or "s3:*")
4. THE Execution_Role SHALL NOT use wildcard resources (Resource: "*" or "arn:aws:s3:::mi-bucket-datos/*")
5. WHEN Lambda_Function attempts to read any S3 object other than index.json, THE AWS IAM service SHALL deny the request

### Requirement 3: CloudWatch Logging with Minimal Privilege

**User Story:** As an operator, I want the Lambda to log execution details to CloudWatch with minimal permissions, so that I can monitor operations without granting excessive access.

#### Acceptance Criteria

1. THE Execution_Role SHALL grant logs:CreateLogGroup action restricted to Log_Group ARN only
2. THE Execution_Role SHALL grant logs:CreateLogStream action restricted to Log_Group ARN only
3. THE Execution_Role SHALL grant logs:PutLogEvents action restricted to Log_Group ARN pattern "arn:aws:logs:REGION:ACCOUNT:log-group:/aws/lambda/lector-index:*"
4. THE Execution_Role SHALL NOT use wildcard resources for CloudWatch Logs actions
5. WHEN Lambda_Function executes, THE Lambda_Function SHALL write logs to Log_Group "/aws/lambda/lector-index"

### Requirement 4: IAM Policy Zero Trust Compliance

**User Story:** As a security architect, I want the IAM policy to pass all Zero Trust validation rules, so that the infrastructure meets organizational security standards.

#### Acceptance Criteria

1. THE Execution_Role SHALL NOT violate rule IAM-001 (no wildcard actions)
2. THE Execution_Role SHALL NOT violate rule IAM-002 (no wildcard resources)
3. THE Execution_Role SHALL NOT violate rule IAM-003 (maximum 15 actions per statement)
4. THE Execution_Role SHALL NOT violate rule IAM-004 (no admin actions without MFA)
5. WHEN the policy enforcer validates the spec, THE validation SHALL return exit code 0

### Requirement 5: Lambda Execution and File Reading

**User Story:** As a developer, I want the Lambda to successfully read the index.json file when invoked, so that I can process its contents.

#### Acceptance Criteria

1. WHEN Lambda_Function is invoked, THE Lambda_Function SHALL read Index_File from Source_Bucket
2. WHEN the read operation succeeds, THE Lambda_Function SHALL return the file contents
3. IF Index_File does not exist, THEN THE Lambda_Function SHALL log an error and return a 404 status
4. IF the read operation fails due to permissions, THEN THE Lambda_Function SHALL log the error with the specific IAM denial reason
5. THE Lambda_Function SHALL complete execution within the configured timeout period

### Requirement 6: Error Handling and Resilience

**User Story:** As an operator, I want the Lambda to handle errors gracefully, so that transient failures are logged and permanent failures are clearly identified.

#### Acceptance Criteria

1. WHEN an S3 GetObject operation fails with a transient error, THE Lambda_Function SHALL retry up to 3 times with exponential backoff
2. WHEN an S3 GetObject operation fails with AccessDenied, THE Lambda_Function SHALL log the error and fail immediately without retry
3. IF Index_File does not exist (NoSuchKey), THEN THE Lambda_Function SHALL log a warning and return a structured error response
4. WHEN any error occurs, THE Lambda_Function SHALL log the error message, error code, and request ID to CloudWatch_Logs
5. THE Lambda_Function SHALL return a structured JSON response indicating success or failure with appropriate HTTP status codes

### Requirement 7: Resource Tagging and Identification

**User Story:** As an infrastructure administrator, I want all resources tagged consistently, so that I can track costs and compliance.

#### Acceptance Criteria

1. THE Lambda_Function SHALL be tagged with "Project=lambda-index-reader"
2. THE Lambda_Function SHALL be tagged with "ZeroTrustCompliant=true"
3. THE Lambda_Function SHALL be tagged with "ManagedBy=terraform"
4. THE Execution_Role SHALL be tagged with the same tags as Lambda_Function
5. WHERE custom tags are provided via Terraform variables, THE resources SHALL merge custom tags with default tags

### Requirement 8: S3 Bucket Security Assumptions

**User Story:** As a security architect, I want to document the security assumptions about the S3 bucket, so that the deployment context is clear.

#### Acceptance Criteria

1. THE Source_Bucket SHALL be assumed to have server-side encryption enabled
2. THE Source_Bucket SHALL be assumed to block all public access
3. THE Source_Bucket SHALL be assumed to enforce TLS-only access via bucket policy
4. THE Lambda_Function SHALL NOT create or modify Source_Bucket configuration
5. THE deployment documentation SHALL list Source_Bucket security configuration as a prerequisite
