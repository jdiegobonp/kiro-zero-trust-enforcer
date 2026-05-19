output "policy_ids" {
  description = "Map of SCP key → AWS Organizations policy ID."
  value       = { for k, p in aws_organizations_policy.zero_trust : k => p.id }
}

output "policy_arns" {
  description = "Map of SCP key → ARN."
  value       = { for k, p in aws_organizations_policy.zero_trust : k => p.arn }
}

output "attachments" {
  description = "List of (policy_key, target_id) tuples actually attached."
  value = [
    for k, a in aws_organizations_policy_attachment.zero_trust :
    { policy_key = a.policy_id, target_id = a.target_id, key = k }
  ]
}
