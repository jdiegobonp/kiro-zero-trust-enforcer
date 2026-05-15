---
inclusion: always
---

# AWS SCPs — Org Guardrail (Layer L-1)

Service Control Policies sit **above** IAM. AWS Organizations evaluates SCPs **before** IAM role policies — a `Deny` in an SCP cannot be overridden by any role policy, inline policy, resource policy, or boundary. This is the org-level backstop for the project's Zero-Trust rules.

## Position in the Enforcement Chain

```
L-1  SCP (org)            ◄── this doc — runtime, deny-by-default, can't be bypassed
L0   spec rules (MCP)     ◄── pre-codegen, deterministic
L1   plan rules (OPA)     ◄── pre-apply, CI gate
L2   account audit (AWS MCP) ◄── post-apply, drift detect
L3   continuous audit (AWS MCP scheduled)
```

Each layer is independent. The same violation should be caught at multiple layers; SCPs exist so that even a misconfigured-but-applied resource cannot be **used** in a violating way.

## Source of Truth

`terraform/modules/scp-zero-trust/policies/*.json` — six SCPs covering:

| File | Mirrors | What it blocks |
|---|---|---|
| `deny_public_s3.json` | NET-004 | Public S3 ACLs; disabling Public Access Block |
| `deny_rds_public.json` | NET-001 | `PubliclyAccessible=true` on RDS create/modify/restore |
| `deny_unencrypted_rds.json` | NET-002 | RDS create/restore without `StorageEncrypted=true` |
| `deny_open_dangerous_ports.json` | NET-005 | SG ingress from `0.0.0.0/0` on 22, 23, 1433, 3306, 5432, 6379, 9200, 9300, 27017 |
| `require_mfa_for_admin.json` | IAM-004 | `iam:*`, `organizations:*`, `account:*`, `billing:*` without MFA. Service-linked roles + SSO excluded. |
| `deny_outside_regions.json` | region condition | All regional APIs outside `us-east-1`, `us-west-2`, `eu-west-1`. Global services excluded via `NotAction`. |

## What SCPs Cannot Catch

- IAM-001 (wildcard `Action: "*"` in role policy) — SCP cannot inspect *another* policy's content, only the API call itself.
- IAM-003 (action-count thresholds) — no condition key for statement length.
- IAM-005 (role name length).
- NET-003 (RDS backup retention < 7 days).
- NET-008 (missing VPC endpoint).

These remain enforced at L0/L1 only.

## Rollout Protocol

SCPs are **not detective** — they break workflows the instant they attach.

1. Sandbox OU first. Tail CloudTrail for `errorCode=AccessDeniedException` with the SCP `Sid`.
2. Non-prod OU.
3. Prod OU.
4. Org root only after 7 days clean.

`terraform plan` against this module is mandatory; never `apply -auto-approve` for SCP changes.

## Drift Detection

The OPA policy `policies/opa/scp_alignment.rego` runs in CI on every Terraform plan. It flags resources the plan would create that the SCPs would deny — so the build fails before `apply` calls the AWS API and gets a runtime deny.

The skill `aws-account-audit` with scope `scp` (see `.kiro/skills/aws-account-audit/SKILL.md`) reads the live attached SCPs via AWS MCP `organizations:ListPolicies` + `DescribePolicy` and diffs them against the local JSON files. Use it after every change to the management account.

## Hard Rules

- **Never** edit SCPs in the console. Console changes will be overwritten on the next Terraform apply, and the audit skill will flag the drift.
- **Never** apply this module from outside the AWS Organizations management account.
- **Never** widen `enabled_policies` past the default set without security review.
- If an SCP blocks a legitimate workflow, the fix is to **change the workflow**, not to weaken the SCP. If that is impossible, document the exception in the SCP `Condition` block and PR it through the security review.

## Pointers

- Module + JSON SCPs: `terraform/modules/scp-zero-trust/`
- Plan-time alignment check: `policies/opa/scp_alignment.rego`
- Runtime audit skill: `.kiro/skills/aws-account-audit/SKILL.md`
- Layered enforcement model: `docs/aws-mcp-integration.md`
