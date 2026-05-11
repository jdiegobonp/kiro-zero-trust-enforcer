package network_zero_trust

import rego.v1

# §ZT-001: Security group ingress rule missing description
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_security_group"
	not resource.config.description
	msg := sprintf(
		"[§ZT-001] MEDIUM: Security group '%v' missing description — Zero Trust requires explicit documentation",
		[resource.id],
	)
}

# §ZT-002: Security group ingress rule has no source restriction (pure 0.0.0.0/0 on non-web ports)
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_security_group"
	rule := resource.config.ingress[_]
	rule.cidr == "0.0.0.0/0"
	not rule.port in {80, 443}
	msg := sprintf(
		"[§ZT-002] HIGH: Security group '%v' has unrestricted ingress on port %v — restrict to source SG or CIDR",
		[resource.id, rule.port],
	)
}

# §ZT-003: S3 buckets exist but no VPC endpoint defined (traffic may traverse internet)
warn contains msg if {
	some resource in input.resources
	resource.type == "aws_s3_bucket"
	not any_vpc_endpoint_for_s3
	msg := sprintf(
		"[§ZT-003] MEDIUM: S3 bucket '%v' defined without VPC Endpoint — traffic may traverse the public internet",
		[resource.id],
	)
}

any_vpc_endpoint_for_s3 if {
	some resource in input.resources
	resource.type == "aws_vpc_endpoint"
	contains(resource.config.service_name, "s3")
}

# §ZT-004: No deletion protection on RDS
warn contains msg if {
	resource := input.resources[_]
	resource.type == "aws_db_instance"
	not resource.config.deletion_protection == true
	msg := sprintf(
		"[§ZT-004] LOW: RDS instance '%v' has deletion protection disabled — enable for production",
		[resource.id],
	)
}

allow if {
	count(deny) == 0
}
