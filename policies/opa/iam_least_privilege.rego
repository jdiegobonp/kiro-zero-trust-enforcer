package iam_least_privilege

import rego.v1

# §IAM-001: Wildcard action grants unrestricted permissions
deny contains msg if {
	resource := input.resources[_]
	resource.type in {"aws_iam_role", "aws_iam_policy"}
	stmt := resource.config.statements[_]
	stmt.effect == "Allow"
	action := stmt.actions[_]
	regex.match(`^(\*|[a-zA-Z0-9\-]+:\*)$`, action)
	msg := sprintf(
		"[§IAM-001] CRITICAL: '%v' uses wildcard IAM action '%v' — violates least privilege",
		[resource.id, action],
	)
}

# §IAM-002: Wildcard resource grants access to all AWS resources
deny contains msg if {
	resource := input.resources[_]
	resource.type in {"aws_iam_role", "aws_iam_policy"}
	stmt := resource.config.statements[_]
	stmt.effect == "Allow"
	res := stmt.resources[_]
	res == "*"
	msg := sprintf(
		"[§IAM-002] CRITICAL: '%v' has wildcard IAM resource '*' — scope to specific ARNs",
		[resource.id],
	)
}

# §IAM-003: AssumeRole without Condition block (cross-service assume role)
deny contains msg if {
	resource := input.resources[_]
	resource.type == "aws_iam_role"
	stmt := resource.config.statements[_]
	stmt.effect == "Allow"
	action := stmt.actions[_]
	action == "sts:AssumeRole"
	not stmt.conditions
	msg := sprintf(
		"[§IAM-003] HIGH: '%v' AssumeRole policy missing Condition block — add aws:PrincipalOrgID or aws:PrincipalAccount",
		[resource.id],
	)
}

# §IAM-004: Admin actions without MFA condition
deny contains msg if {
	resource := input.resources[_]
	resource.type in {"aws_iam_role", "aws_iam_policy"}
	stmt := resource.config.statements[_]
	stmt.effect == "Allow"
	action := stmt.actions[_]
	startswith(action, "iam:")
	not stmt.conditions
	msg := sprintf(
		"[§IAM-004] CRITICAL: '%v' grants admin action '%v' without MFA condition",
		[resource.id, action],
	)
}

# §IAM-005: Warn on excessive action count (> 15 actions per statement)
warn contains msg if {
	resource := input.resources[_]
	resource.type in {"aws_iam_role", "aws_iam_policy"}
	stmt := resource.config.statements[_]
	action_count := count(stmt.actions)
	action_count > 15
	msg := sprintf(
		"[§IAM-005] HIGH: '%v' has %v actions in one statement — consider splitting by function",
		[resource.id, action_count],
	)
}

allow if {
	count(deny) == 0
}
