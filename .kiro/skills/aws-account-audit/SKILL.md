---
name: aws-account-audit
description: |
  Use this skill when the user says "audit the account", "check live AWS state", "verify deployed posture",
  "run AWS MCP audit", "/aws-account-audit", or asks whether the deployed account matches the spec.
  Uses the AWS MCP Server (mcp-proxy-for-aws) with read-only IAM to verify zero-trust posture against
  the live account. Findings are reported with the same ruleId namespace as the local MCP (IAM-*, NET-*).
---

# aws-account-audit — Verify Live AWS Posture via AWS MCP

Run a curated set of read-only `call_aws` checks through the AWS MCP Server and emit violations in the
same shape as the local MCP server.

This skill does **not** mutate AWS state. It does **not** replace `/validate-spec`. It runs **after** a
spec has passed local enforcement, to confirm the deployed account actually matches.

## Prerequisites

- AWS MCP Server registered in Kiro: an `aws-mcp` entry exists in `.kiro/settings/mcp.json`
  (workspace) or `~/.kiro/settings/mcp.json` (user), and Kiro lists it as an available MCP server.
- Active AWS credentials with read-only audit permissions (`ec2:Describe*`, `rds:Describe*`,
  `s3:GetBucket*`, `iam:Get*`, `iam:List*`, `iam:Simulate*`).
- If missing: tell the user to follow the Kiro install block in `docs/aws-mcp-integration.md`
  (edit `.kiro/settings/mcp.json` and reload the Kiro window) and stop. Do not suggest
  `claude mcp add-json` — that is Claude Code, not Kiro.

## Arguments

- `<scope>` (optional) — `iam` · `network` · `s3` · `rds` · `scp` · `all` (default: `all`)
- `--region <region>` (optional) — defaults to the caller's default region
- `--spec <path>` (optional) — when provided, cross-reference findings against the spec's resources

## Steps

### Step 1 — Confirm AWS MCP availability

Ask Kiro to use the `aws-mcp` server. If the user's Kiro session has no `aws-mcp` registered in
`.kiro/settings/mcp.json`, halt and print the Kiro install block from `docs/aws-mcp-integration.md`.

### Step 2 — Run the scoped audit

For each scope requested, call the AWS MCP tool `call_aws` with these API operations.
**All calls are read-only.** Do not call any operation outside this list without explicit user confirmation.

**iam:**
- `iam:ListRoles` — enumerate roles
- For each role with the project tag or matching the spec: `iam:GetRolePolicy` and `iam:ListAttachedRolePolicies`
- If `--spec` provided: `iam:SimulateCustomPolicy` with the spec's statements to confirm intended `Allow` decisions

**network:**
- `ec2:DescribeSecurityGroups` — flag any rule with `CidrIp: 0.0.0.0/0` on dangerous ports (22, 23, 3306, 5432, 6379, 27017)
- `ec2:DescribeVpcEndpoints` — flag S3 buckets in spec without a matching VPC endpoint

**s3:**
- `s3:ListBuckets`
- For each bucket touched by the spec:
  - `s3:GetBucketPolicy` — must include `aws:SecureTransport=true` deny
  - `s3:GetBucketPublicAccessBlock` — all four flags must be `true`
  - `s3:GetBucketEncryption` — must specify KMS or AES256

**rds:**
- `rds:DescribeDBInstances` — flag `PubliclyAccessible=true`, `StorageEncrypted=false`, `BackupRetentionPeriod<7`

**scp:**

Only run when the caller is in the **AWS Organizations management account**. If not, emit a single info finding and skip.

- `organizations:ListPolicies` with `Filter=SERVICE_CONTROL_POLICY` — enumerate all SCPs
- For each SCP whose name starts with `ZeroTrust-`: `organizations:DescribePolicy` — fetch content
- Diff content against `terraform/modules/scp-zero-trust/policies/<name>.json` (the local source of truth)
- `organizations:ListTargetsForPolicy` — confirm attachments match the `target_ids` declared in Terraform
- Flag any SCP starting with `ZeroTrust-` that:
  - exists in AWS but not in the module (orphan, mint `DRIFT-SCP-001`)
  - exists in the module but not in AWS (missing, mint `DRIFT-SCP-002`)
  - exists in both but content differs (drift, mint `DRIFT-SCP-003`)
  - is attached to a target not in `target_ids` (rogue attachment, mint `DRIFT-SCP-004`)

### Step 3 — Normalize findings to the local schema

Each finding must be shaped like a local MCP violation:

```json
{
  "ruleId": "IAM-002",
  "severity": "CRITICAL",
  "resource": "arn:aws:iam::123456789012:role/payment-lambda-role",
  "message": "Live role grants Resource=\"*\" — drifted from spec",
  "remediation": "Replace with specific ARNs and re-deploy",
  "source": "aws-mcp"
}
```

The `source: aws-mcp` field distinguishes live findings from spec-time ones in the dashboard.
Reuse the same `ruleId` values where the rule matches. Mint new IDs only for checks the local server
cannot perform (e.g., `DRIFT-001` for spec-vs-account mismatch).

### Step 4 — Present results

Group by severity, then by source:

```
AWS Account Audit — <account-id> / <region>

CRITICAL (3 findings)
  IAM-002 / aws-mcp   arn:aws:iam::.../payment-lambda-role
                      Live role grants Resource="*" — drifted from spec
                      Remediation: replace with specific ARNs and re-deploy

  NET-001 / aws-mcp   arn:aws:rds:.../payments-db
                      RDS publicly_accessible=true in live account
                      Remediation: modify-db-instance --no-publicly-accessible

  DRIFT-001 / aws-mcp arn:aws:s3:::payments-archive
                      Spec defines this bucket; not found in account or different region

HIGH (1 finding) ...
```

Exit code:
- `0` — no CRITICAL/HIGH findings
- `1` — at least one CRITICAL/HIGH finding (only when this skill is invoked from CI; in IDE just report)

### Step 5 — Offer follow-up

- If spec drift found: offer `/suggest-permissions` to regenerate the IAM block.
- If network drift found: print the exact `aws` CLI command to remediate, but **do not run it**.
- If clean: offer to generate a Security Considerations addendum with the audit timestamp.

## Hard Rules

- Read-only `call_aws` operations only. Anything that mutates state is out of scope for this skill.
- Never paste raw AWS account IDs or ARNs into chat output without the user asking. Truncate to the last 4 digits in summaries.
- If AWS MCP returns an `AccessDenied`, do not retry with broader permissions. Report the missing permission and stop.
- This skill is **additive** to `/validate-spec`. It does not replace it.
