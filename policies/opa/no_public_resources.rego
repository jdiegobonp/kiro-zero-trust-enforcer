package no_public_resources

import rego.v1

# §NET-001: RDS instance publicly accessible
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_db_instance"
	resource.config.publicly_accessible == true
	msg := sprintf(
		"[§NET-001] CRITICAL: RDS instance '%v' is publicly accessible — Zero Trust violation",
		[resource.id],
	)
}

# §NET-002: S3 bucket with public ACL
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_s3_bucket"
	resource.config.acl in {"public-read", "public-read-write", "authenticated-read"}
	msg := sprintf(
		"[§NET-002] CRITICAL: S3 bucket '%v' allows public access via ACL '%v'",
		[resource.id, resource.config.acl],
	)
}

# §NET-003: Security group allows unrestricted access on dangerous ports
dangerous_ports := {22, 23, 3306, 5432, 1433, 6379, 27017, 9200, 9300}

deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_security_group"
	rule := resource.config.ingress[_]
	rule.cidr == "0.0.0.0/0"
	rule.port in dangerous_ports
	msg := sprintf(
		"[§NET-003] CRITICAL: Security group '%v' allows unrestricted access on port %v",
		[resource.id, rule.port],
	)
}

# §NET-004: EC2 instance with public IP in non-public context (any public IP is flagged)
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_instance"
	resource.config.associate_public_ip_address == true
	msg := sprintf(
		"[§NET-004] HIGH: EC2 instance '%v' has a public IP — use a NAT gateway or private subnet",
		[resource.id],
	)
}

# §NET-005: RDS storage not encrypted
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_db_instance"
	resource.config.storage_encrypted == false
	msg := sprintf(
		"[§NET-005] HIGH: RDS instance '%v' has storage encryption disabled",
		[resource.id],
	)
}

allow if {
	count(deny) == 0
}
