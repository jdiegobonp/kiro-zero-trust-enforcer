# Requirements Document

## Introduction

This document specifies the requirements for an AWS Lambda function that processes messages from SQS queues. The Lambda function will be deployed in the us-east-1 region using Terraform infrastructure-as-code. The initial implementation intentionally uses overly-permissive IAM policies (Action: "*", Resource: "*") to demonstrate blast radius analysis and zero-trust policy violations, with a path to least-privilege remediation.

## Glossary

- **Lambda_Function**: The AWS Lambda function that processes SQS messages
- **Execution_Role**: The IAM role assumed by the Lambda function during execution
- **SQS_Queue**: Amazon Simple Queue Service queue that triggers the Lambda function
- **CloudWatch_Logs**: AWS CloudWatch Logs service for Lambda execution logs
- **Terraform**: Infrastructure-as-code tool used to deploy AWS resources
- **IAM_Policy**: AWS Identity and Access Management policy defining permissions
- **Message**: A unit of data sent to and received from an SQS queue

## Requirements

### Requirement 1: Lambda Function Deployment

**User Story:** As a developer, I want to deploy a Lambda function in us-east-1, so that I can process SQS messages in that region.

#### Acceptance Criteria

1. THE Lambda_Function SHALL be deployed in the us-east-1 AWS region
2. THE Lambda_Function SHALL be created using Terraform infrastructure-as-code
3. THE Lambda_Function SHALL have a runtime environment compatible with message processing
4. THE Lambda_Function SHALL be associated with an Execution_Role

### Requirement 2: SQS Message Processing

**User Story:** As a system operator, I want the Lambda function to process SQS messages, so that queued work can be executed asynchronously.

#### Acceptance Criteria

1. WHEN a Message arrives in an SQS_Queue, THE Lambda_Function SHALL be triggered
2. WHEN triggered, THE Lambda_Function SHALL receive the Message payload
3. WHEN processing completes successfully, THE Lambda_Function SHALL delete the Message from the SQS_Queue
4. IF processing fails, THEN THE Lambda_Function SHALL allow the Message to return to the SQS_Queue for retry

### Requirement 3: Execution Role with Full Permissions

**User Story:** As a developer, I want the Lambda execution role to have full AWS permissions, so that I can demonstrate the security implications of overly-permissive policies.

#### Acceptance Criteria

1. THE Execution_Role SHALL include an IAM_Policy with Action set to "*"
2. THE Execution_Role SHALL include an IAM_Policy with Resource set to "*"
3. THE Execution_Role SHALL allow the Lambda service to assume the role
4. THE Execution_Role SHALL be created using Terraform

### Requirement 4: CloudWatch Logs Integration

**User Story:** As a developer, I want Lambda execution logs sent to CloudWatch, so that I can monitor and debug function execution.

#### Acceptance Criteria

1. WHEN the Lambda_Function executes, THE Lambda_Function SHALL write logs to CloudWatch_Logs
2. THE Execution_Role SHALL include permissions for logs:CreateLogGroup
3. THE Execution_Role SHALL include permissions for logs:CreateLogStream
4. THE Execution_Role SHALL include permissions for logs:PutLogEvents
5. THE CloudWatch_Logs log group SHALL follow the naming pattern /aws/lambda/{function-name}

### Requirement 5: Terraform Infrastructure Definition

**User Story:** As a DevOps engineer, I want all infrastructure defined in Terraform, so that deployments are reproducible and version-controlled.

#### Acceptance Criteria

1. THE Lambda_Function SHALL be defined as a Terraform aws_lambda_function resource
2. THE Execution_Role SHALL be defined as a Terraform aws_iam_role resource
3. THE IAM_Policy SHALL be defined as a Terraform aws_iam_role_policy or aws_iam_policy resource
4. THE SQS_Queue SHALL be defined as a Terraform aws_sqs_queue resource
5. THE Lambda_Function trigger configuration SHALL be defined as a Terraform aws_lambda_event_source_mapping resource

### Requirement 6: Security Analysis and Remediation Path

**User Story:** As a security engineer, I want to analyze the blast radius of the overly-permissive policy, so that I can understand the risk and provide a least-privilege alternative.

#### Acceptance Criteria

1. WHEN the architecture specification is created, THE system SHALL validate it against zero-trust policies
2. WHEN validation detects IAM-001 violation (wildcard action), THE system SHALL report it as CRITICAL severity
3. WHEN validation detects IAM-002 violation (wildcard resource), THE system SHALL report it as CRITICAL severity
4. WHEN violations are detected, THE system SHALL calculate the blast radius score for the Execution_Role
5. WHEN violations are detected, THE system SHALL offer a least-privilege alternative with minimal SQS permissions

