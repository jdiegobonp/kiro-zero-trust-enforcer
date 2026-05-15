# AWS MCP Server Integration

> Status: design + skill scaffolding. No changes to `mcp-server/` source yet.
> Companion to the local zero-trust MCP server, not a replacement.

## Why

The local MCP server (this repo) gates **specs**. It cannot see whether the deployed account actually matches the spec, nor whether a proposed IAM policy would simulate clean against existing AWS state.

The [AWS MCP Server](https://aws.amazon.com/blogs/aws/the-aws-mcp-server-is-now-generally-available/) (GA 2026) closes that gap. It gives any MCP client authenticated access to 15,000+ AWS APIs through three tools: `call_aws`, `run_script`, and documentation search.

Together:

```
spec edit ──► local MCP (static)  ──► block on CRITICAL/HIGH    ◄── deterministic, offline
                                                                    sub-100ms
                                  ──► AWS MCP (live, optional) ──► account drift, simulate,
                                                                   doc-grounded advice
```

## Layered Enforcement Model

| Layer | Where | Source of Truth | Failure Mode |
|---|---|---|---|
| **L0 — Spec rules** | local MCP, Kiro hook | YAML `ArchSpec` | exit 1 on CRITICAL/HIGH |
| **L1 — Plan rules** | OPA in CI | Terraform plan JSON | PR check red |
| **L2 — Account rules** | AWS MCP `call_aws` | live AWS API | PR check red + Slack |
| **L3 — Continuous audit** | AWS MCP scheduled run | live AWS API | dashboard + alert |

L0 and L1 exist today. L2 and L3 are what AWS MCP unlocks.

## Concrete Use Cases

### 1. Pre-apply IAM simulation

Before `terraform apply` in `deploy-prod.yml`:

```python
# pseudo-code, executed inside AWS MCP run_script
import boto3
iam = boto3.client('iam')
for stmt in spec['statements']:
    sim = iam.simulate_custom_policy(
        PolicyInputList=[json.dumps(stmt)],
        ActionNames=stmt['actions'],
        ResourceArns=stmt['resources'],
    )
    # fail the workflow if any EvalDecision != 'allowed' under expected conditions
```

Catches: typos in resource ARNs, missing trust relationships, conditions that nullify the policy.

### 2. Post-deploy posture audit

Skill `aws-account-audit` invokes via AWS MCP:

- `ec2:DescribeSecurityGroups` — confirm no `0.0.0.0/0` on dangerous ports
- `rds:DescribeDBInstances` — confirm `PubliclyAccessible=false`, `StorageEncrypted=true`
- `s3:GetBucketPolicy` + `s3:GetBucketPublicAccessBlock` — confirm TLS-only and no public ACLs
- `iam:GetAccountAuthorizationDetails` — list roles with admin-equivalent permissions

Each finding maps back to the same `ruleId` namespace used by the local MCP (`IAM-001..005`, `NET-001..008`) so dashboards stay consistent.

### 3. Doc-grounded least-privilege

Today `suggest_least_privilege` ships hardcoded presets. AWS MCP `search_documentation` lets a future variant ground each suggestion in the current AWS recommended pattern, with a citation URL.

This is **not** wired up yet. It is a candidate follow-up.

### 4. Blast-radius using real account topology

`calculate_blast_radius` currently estimates from action lists alone. A `run_script` variant can pull the actual reachable services (peered VPCs, cross-account trust, resource-based policies) and produce an account-grounded number.

## Setup

1. Install the proxy and register the server with Kiro / Claude Code:

   ```bash
   claude mcp add-json aws-mcp --scope user \
     '{"command":"uvx","args":["mcp-proxy-for-aws@latest","https://aws-mcp.us-east-1.api.aws/mcp"]}'
   ```

2. Confirm an IAM identity with **read-only** permissions for the audit set:

   ```
   ec2:Describe*
   rds:Describe*
   s3:GetBucket*, s3:ListAllMyBuckets
   iam:Get*, iam:List*, iam:SimulatePrincipalPolicy, iam:SimulateCustomPolicy
   ```

   Use a dedicated `ZeroTrustAuditor` role assumed via OIDC in CI. Do not use long-lived keys.

3. (CI) Add the proxy to the runner image and assume the role via existing OIDC config in `deploy-prod.yml`.

## Boundaries

- The AWS MCP signal is **additive**. The local MCP remains the authoritative spec-time gate.
- Read-only by default. Any `call_aws` that mutates state requires an explicit approval path — never default-allowed in CI.
- `run_script` runs without network access; safe for one-shot account analytics, not for fetching external dependencies.
- Two regions only at GA: `us-east-1`, `eu-central-1`. Choose based on data residency.

## Open Questions

Tracked here so they do not get lost:

- **Q1:** Which audit checks should block deploy vs. only post-deploy warn? Proposal: spec-mismatch = block, drift-from-baseline = warn.
- **Q2:** Where to store the AWS MCP audit role ARN? Proposal: `terraform/modules/auditor-role/` + GitHub Environment secret.
- **Q3:** Rate limits / cost when audit runs on every PR? Need data before turning on.

## Out of Scope (this branch)

- No changes to `mcp-server/src/`. Logic for L2 checks lives in scripts run **through** AWS MCP, not in the local server.
- No new GitHub workflow yet. A `plan-aws-mcp-check.yml` is a candidate but blocked on Q2 above.
