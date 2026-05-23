# Requirements Document

## Introduction

Este documento define los requisitos para una función Lambda en AWS que procesa archivos almacenados en S3, cumpliendo con los principios de Zero Trust y privilegio mínimo. La solución debe evitar permisos comodín (wildcard) y limitar el acceso únicamente a los recursos y acciones específicamente necesarios para la operación.

## Glossary

- **Lambda_Function**: La función AWS Lambda que ejecuta la lógica de procesamiento de archivos
- **Source_Bucket**: El bucket de S3 que contiene los archivos de entrada a procesar
- **Destination_Bucket**: El bucket de S3 donde se almacenan los archivos procesados
- **Execution_Role**: El rol IAM que la Lambda_Function asume para acceder a recursos AWS
- **CloudWatch_Logs**: El servicio de AWS que almacena los logs de ejecución de la Lambda_Function
- **KMS_Key**: La clave de cifrado AWS KMS utilizada para cifrar objetos en S3
- **Processing_Result**: El archivo transformado o procesado generado por la Lambda_Function

## Requirements

### Requirement 1: Lambda Function Deployment

**User Story:** Como desarrollador, quiero desplegar una función Lambda con Terraform, para que pueda procesar archivos de S3 de forma automatizada.

#### Acceptance Criteria

1. THE Lambda_Function SHALL be deployed using Terraform with runtime Python 3.11 or later
2. THE Lambda_Function SHALL have a timeout configuration between 30 and 900 seconds
3. THE Lambda_Function SHALL have memory allocation between 128 MB and 3008 MB
4. THE Lambda_Function SHALL be tagged with "ZeroTrustCompliant=true" and "ManagedBy=terraform"
5. THE Lambda_Function SHALL use environment variables for Source_Bucket and Destination_Bucket names

### Requirement 2: S3 Read Access with Least Privilege

**User Story:** Como arquitecto de seguridad, quiero que la Lambda tenga acceso de lectura limitado a buckets específicos, para que cumpla con el principio de privilegio mínimo.

#### Acceptance Criteria

1. THE Execution_Role SHALL grant s3:GetObject action only
2. THE Execution_Role SHALL restrict s3:GetObject to Source_Bucket ARN with wildcard path suffix only (arn:aws:s3:::bucket-name/*)
3. THE Execution_Role SHALL NOT use wildcard actions (Action: "*" or "s3:*")
4. THE Execution_Role SHALL NOT use wildcard resources (Resource: "*")
5. WHEN the Lambda_Function attempts to read from a bucket outside Source_Bucket, THE AWS IAM service SHALL deny the request

### Requirement 3: S3 Write Access with Least Privilege

**User Story:** Como arquitecto de seguridad, quiero que la Lambda tenga acceso de escritura limitado a buckets específicos, para que no pueda modificar recursos no autorizados.

#### Acceptance Criteria

1. THE Execution_Role SHALL grant s3:PutObject action only
2. THE Execution_Role SHALL restrict s3:PutObject to Destination_Bucket ARN with wildcard path suffix only (arn:aws:s3:::bucket-name/*)
3. THE Execution_Role SHALL NOT grant s3:DeleteObject unless explicitly required by the use case
4. WHEN the Lambda_Function attempts to write to a bucket outside Destination_Bucket, THE AWS IAM service SHALL deny the request
5. THE Execution_Role SHALL include a condition requiring aws:SecureTransport=true for all S3 operations

### Requirement 4: KMS Encryption Access

**User Story:** Como arquitecto de seguridad, quiero que la Lambda pueda cifrar y descifrar objetos usando KMS, para que los datos estén protegidos en reposo.

#### Acceptance Criteria

1. THE Execution_Role SHALL grant kms:Decrypt action for reading encrypted objects from Source_Bucket
2. THE Execution_Role SHALL grant kms:Encrypt and kms:GenerateDataKey actions for writing encrypted objects to Destination_Bucket
3. THE Execution_Role SHALL restrict KMS actions to specific KMS_Key ARNs only
4. THE Execution_Role SHALL NOT use wildcard KMS key resources (Resource: "*")
5. WHEN Source_Bucket or Destination_Bucket use server-side encryption with KMS, THE Lambda_Function SHALL successfully read and write objects

### Requirement 5: CloudWatch Logging

**User Story:** Como operador, quiero que la Lambda registre sus ejecuciones en CloudWatch, para que pueda monitorear y depurar el procesamiento.

#### Acceptance Criteria

1. THE Execution_Role SHALL grant logs:CreateLogGroup, logs:CreateLogStream, and logs:PutLogEvents actions
2. THE Execution_Role SHALL restrict logging actions to log group ARN pattern "arn:aws:logs:REGION:ACCOUNT:log-group:/aws/lambda/FUNCTION_NAME*"
3. THE Lambda_Function SHALL log the start and completion of each file processing operation
4. WHEN an error occurs during processing, THE Lambda_Function SHALL log the error message and stack trace to CloudWatch_Logs
5. THE CloudWatch_Logs log group SHALL have a retention period of at least 7 days

### Requirement 6: IAM Policy Compliance

**User Story:** Como arquitecto de seguridad, quiero que el rol IAM cumpla con las políticas Zero Trust, para que pase la validación del policy enforcer.

#### Acceptance Criteria

1. THE Execution_Role SHALL NOT violate rule IAM-001 (no wildcard actions)
2. THE Execution_Role SHALL NOT violate rule IAM-002 (no wildcard resources)
3. THE Execution_Role SHALL NOT violate rule IAM-003 (maximum 15 actions per statement)
4. WHEN the policy enforcer validates the spec, THE validation SHALL return exit code 0
5. THE Execution_Role SHALL use separate policy statements for S3, KMS, and CloudWatch permissions

### Requirement 7: S3 Bucket Security Configuration

**User Story:** Como arquitecto de seguridad, quiero que los buckets S3 estén configurados de forma segura, para que cumplan con las políticas de red Zero Trust.

#### Acceptance Criteria

1. THE Source_Bucket and Destination_Bucket SHALL have server-side encryption enabled with aws:kms algorithm
2. THE Source_Bucket and Destination_Bucket SHALL block all public access (block_public_acls=true, block_public_policy=true, ignore_public_acls=true, restrict_public_buckets=true)
3. THE Source_Bucket and Destination_Bucket SHALL have versioning enabled
4. THE Source_Bucket and Destination_Bucket SHALL enforce TLS-only access via bucket policy with aws:SecureTransport condition
5. THE Source_Bucket and Destination_Bucket SHALL NOT use ACL "public-read" or "public-read-write"

### Requirement 8: Lambda Trigger Configuration

**User Story:** Como desarrollador, quiero que la Lambda se ejecute automáticamente cuando se crea un archivo en S3, para que el procesamiento sea inmediato.

#### Acceptance Criteria

1. WHEN a new object is created in Source_Bucket with prefix "input/", THE S3 service SHALL trigger the Lambda_Function
2. THE Lambda_Function SHALL receive the S3 event notification containing bucket name and object key
3. THE Execution_Role SHALL grant s3:GetBucketNotification permission on Source_Bucket for event configuration
4. WHEN the Lambda_Function is triggered, THE Lambda_Function SHALL process the file within the configured timeout period
5. IF processing fails, THEN THE Lambda_Function SHALL return an error and the event SHALL be retried according to Lambda retry configuration

### Requirement 9: Error Handling and Resilience

**User Story:** Como operador, quiero que la Lambda maneje errores de forma robusta, para que los fallos transitorios no causen pérdida de datos.

#### Acceptance Criteria

1. WHEN an S3 GetObject operation fails with a transient error, THE Lambda_Function SHALL retry up to 3 times with exponential backoff
2. WHEN an S3 PutObject operation fails, THE Lambda_Function SHALL log the error and raise an exception
3. IF the source file does not exist, THEN THE Lambda_Function SHALL log a warning and return successfully without processing
4. WHEN KMS decryption fails due to missing permissions, THE Lambda_Function SHALL log the error with the KMS key ARN and fail the execution
5. THE Lambda_Function SHALL have a Dead Letter Queue (DLQ) configured for failed executions after all retries are exhausted

### Requirement 10: Resource Tagging and Identification

**User Story:** Como administrador de infraestructura, quiero que todos los recursos estén etiquetados consistentemente, para que pueda rastrear costos y cumplimiento.

#### Acceptance Criteria

1. THE Lambda_Function, Execution_Role, Source_Bucket, and Destination_Bucket SHALL be tagged with "Environment" (dev/staging/prod)
2. THE Lambda_Function, Execution_Role, Source_Bucket, and Destination_Bucket SHALL be tagged with "Project=lambda-s3-processor"
3. THE Lambda_Function, Execution_Role, Source_Bucket, and Destination_Bucket SHALL be tagged with "ZeroTrustCompliant=true"
4. THE Lambda_Function, Execution_Role, Source_Bucket, and Destination_Bucket SHALL be tagged with "ManagedBy=terraform"
5. WHERE custom tags are provided via Terraform variables, THE resources SHALL merge custom tags with default tags
