# scp-zero-trust

Reusable Terraform module that materializes the project's Zero-Trust rules as **AWS Organizations Service Control Policies** (SCPs). SCPs sit **above** IAM — they cap what any principal in an attached account can do, regardless of role policy. They are layer **L-1** in the enforcement model documented in `docs/aws-mcp-integration.md`.

## What This Enforces

| SCP file | Mirrors rule | Effect |
|---|---|---|
| `deny_public_s3.json` | NET-004 | Deny `s3:PutBucketAcl`/`PutObjectAcl`/`CreateBucket` with public ACL; deny disabling Public Access Block |
| `deny_rds_public.json` | NET-001 | Deny `rds:CreateDBInstance`/`ModifyDBInstance`/restore APIs with `PubliclyAccessible=true` |
| `deny_unencrypted_rds.json` | NET-002 | Deny RDS create/restore when `StorageEncrypted=false` |
| `deny_open_dangerous_ports.json` | NET-005 | Deny `ec2:AuthorizeSecurityGroupIngress` from `0.0.0.0/0` on ports 22, 23, 1433, 3306, 5432, 6379, 9200, 9300, 27017 |
| `require_mfa_for_admin.json` | IAM-004 | Deny `iam:*` / `organizations:*` / `account:*` / `billing:*` without `aws:MultiFactorAuthPresent`. Service-linked and SSO roles excluded. |
| `deny_outside_regions.json` | (region condition) | Deny regional API calls outside `us-east-1`, `us-west-2`, `eu-west-1`. Global services excluded via `NotAction`. |

## What This Does NOT Cover

SCPs evaluate API calls + condition keys. They cannot see counts of statements or string lengths. These spec rules stay enforced only at L0/L1:

- IAM-001 — wildcard `Action: "*"` in a role policy (the role still has to be **used** for the SCP to deny anything — the wildcard policy creation itself is allowed)
- IAM-003 — `>15` actions per statement
- IAM-005 — role name length
- NET-003 — RDS backup retention `<7` days (no condition key)
- NET-008 — missing VPC endpoint

Detect those at spec time (`mcp-server`) and plan time (OPA). The SCPs here are the runtime backstop.

## Usage

Apply from the **AWS Organizations management account** only:

```hcl
module "zero_trust_scps" {
  source     = "../../modules/scp-zero-trust"
  target_ids = [data.aws_organizations_organization.current.roots[0].id]
  tags = {
    Owner = "platform-security"
  }
}
```

Selective rollout (e.g., new SCP only on a sandbox OU first):

```hcl
module "scp_sandbox" {
  source           = "../../modules/scp-zero-trust"
  target_ids       = ["ou-xxxx-sandbox"]
  enabled_policies = ["deny_open_dangerous_ports"]
}
```

## Order of Rollout (Recommended)

1. Apply to a sandbox OU. Watch CloudTrail for `errorCode=AccessDeniedException` with the `Sid` from the SCP. Tune.
2. Promote to non-prod OU.
3. Promote to prod OU.
4. Attach to the org root only after every account is clean for 7 days.

This staged rollout is mandatory because **SCPs are not detective — they break workflows the moment they attach**.

## Drift Detection

Local file is the source of truth. To verify the attached SCPs in AWS still match this module, run the `aws-account-audit` skill with scope `scp` (see `.kiro/skills/aws-account-audit/SKILL.md`). It calls AWS MCP `organizations:ListPolicies` + `organizations:DescribePolicy` and diffs against `policies/*.json` in this directory.

## Limitations

- Requires AWS Organizations. Single-account devs cannot test locally — use a throwaway sandbox org or LocalStack Pro (not all Organizations APIs supported).
- `aws_organizations_policy_attachment` is **destructive**: removing a target from `target_ids` detaches it on next apply.
- The `deny_outside_regions` policy uses a curated `NotAction` allowlist of global services. Audit it before each AWS service launch — new global services need to be added or they will break.
