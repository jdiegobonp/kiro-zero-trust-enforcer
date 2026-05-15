terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  policy_files = {
    deny_public_s3            = "${path.module}/policies/deny_public_s3.json"
    deny_rds_public           = "${path.module}/policies/deny_rds_public.json"
    deny_unencrypted_rds      = "${path.module}/policies/deny_unencrypted_rds.json"
    deny_open_dangerous_ports = "${path.module}/policies/deny_open_dangerous_ports.json"
    require_mfa_for_admin     = "${path.module}/policies/require_mfa_for_admin.json"
    deny_outside_regions      = "${path.module}/policies/deny_outside_regions.json"
  }

  policy_descriptions = {
    deny_public_s3            = "Zero-Trust: deny public S3 ACLs and disabling Public Access Block"
    deny_rds_public           = "Zero-Trust: deny creating RDS with PubliclyAccessible=true"
    deny_unencrypted_rds      = "Zero-Trust: deny RDS instances/clusters without storage encryption"
    deny_open_dangerous_ports = "Zero-Trust: deny SG ingress from 0.0.0.0/0 on dangerous ports"
    require_mfa_for_admin     = "Zero-Trust: deny IAM/Org/Billing admin actions without MFA"
    deny_outside_regions      = "Zero-Trust: deny regional API calls outside the allowed region list"
  }
}

resource "aws_organizations_policy" "zero_trust" {
  for_each = var.enabled_policies

  name        = "ZeroTrust-${replace(each.key, "_", "-")}"
  description = local.policy_descriptions[each.key]
  type        = "SERVICE_CONTROL_POLICY"
  content     = file(local.policy_files[each.key])

  tags = merge(var.tags, {
    "ZeroTrust:Layer"  = "L-1-org-guardrail"
    "ZeroTrust:Source" = "terraform/modules/scp-zero-trust"
  })
}

resource "aws_organizations_policy_attachment" "zero_trust" {
  for_each = {
    for pair in setproduct(tolist(var.enabled_policies), var.target_ids) :
    "${pair[0]}::${pair[1]}" => {
      policy_key = pair[0]
      target_id  = pair[1]
    }
  }

  policy_id = aws_organizations_policy.zero_trust[each.value.policy_key].id
  target_id = each.value.target_id
}
