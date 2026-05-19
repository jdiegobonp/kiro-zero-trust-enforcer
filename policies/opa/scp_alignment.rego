package scp_alignment

import rego.v1

# Catches Terraform plans whose effective behavior would be DENIED by the SCPs
# defined in terraform/modules/scp-zero-trust. The goal is to fail at plan time
# instead of waiting for the AWS API to reject the apply.

dangerous_ports := {22, 23, 1433, 3306, 5432, 6379, 9200, 9300, 27017}

allowed_regions := {"us-east-1", "us-west-2", "eu-west-1"}

# §SCP-PUBLIC-S3
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_s3_bucket"
	resource.config.acl in {"public-read", "public-read-write", "authenticated-read"}
	msg := sprintf(
		"[§SCP-PUBLIC-S3] Plan would be denied by SCP deny_public_s3: bucket '%v' uses public ACL '%v'",
		[resource.id, resource.config.acl],
	)
}

deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_s3_bucket_public_access_block"
	some flag in {"block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"}
	resource.config[flag] == false
	msg := sprintf(
		"[§SCP-PUBLIC-S3] Plan would be denied by SCP deny_public_s3: '%v' disables %v",
		[resource.id, flag],
	)
}

# §SCP-RDS-PUBLIC
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_db_instance"
	resource.config.publicly_accessible == true
	msg := sprintf(
		"[§SCP-RDS-PUBLIC] Plan would be denied by SCP deny_rds_public: '%v' has publicly_accessible=true",
		[resource.id],
	)
}

# §SCP-RDS-ENCRYPT
deny contains msg if {
	resource := input.resources[_]
	resource.type in {"aws_db_instance", "aws_rds_cluster"}
	resource.config.storage_encrypted == false
	msg := sprintf(
		"[§SCP-RDS-ENCRYPT] Plan would be denied by SCP deny_unencrypted_rds: '%v' has storage_encrypted=false",
		[resource.id],
	)
}

# §SCP-OPEN-PORTS
deny contains msg if {
	resource := input.resources[_]
	resource.type in {"aws_security_group", "aws_security_group_rule", "aws_vpc_security_group_ingress_rule"}
	rule := all_ingress(resource)[_]
	rule.cidr == "0.0.0.0/0"
	rule.port in dangerous_ports
	msg := sprintf(
		"[§SCP-OPEN-PORTS] Plan would be denied by SCP deny_open_dangerous_ports: '%v' opens port %v to 0.0.0.0/0",
		[resource.id, rule.port],
	)
}

all_ingress(resource) := rules if {
	resource.type == "aws_security_group"
	rules := resource.config.ingress
}

all_ingress(resource) := [{"cidr": resource.config.cidr_blocks[_], "port": resource.config.from_port}] if {
	resource.type == "aws_security_group_rule"
	resource.config.type == "ingress"
}

all_ingress(resource) := [{"cidr": resource.config.cidr_ipv4, "port": resource.config.from_port}] if {
	resource.type == "aws_vpc_security_group_ingress_rule"
}

# §SCP-REGION
deny contains msg if {
	resource := input.resources[_]
	region := resource.config.region
	region != ""
	not region in allowed_regions
	msg := sprintf(
		"[§SCP-REGION] Plan would be denied by SCP deny_outside_regions: '%v' targets region '%v' (allowed: %v)",
		[resource.id, region, allowed_regions],
	)
}

allow if {
	count(deny) == 0
}
