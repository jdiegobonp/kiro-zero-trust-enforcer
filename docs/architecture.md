# Architecture

## Enforcement Chain

```
  Developer writes spec
         │
         ▼
  .kiro/specs/example.yaml          ← YAML architecture specification
         │
         │ (Kiro post-spec hook)
         ▼
  .kiro/hooks/policy-enforcer.js    ← Node.js hook, reads spec, calls MCP server
         │
         │ HTTP POST (parallel)
         ├────────────────────────► /tools/validate_iam_policy
         └────────────────────────► /tools/check_network_posture
                                           │
                                    mcp-server (port 3000)
                                    ├── validate-iam.ts
                                    ├── check-network.ts
                                    ├── blast-radius.ts
                                    └── suggest-minimal.ts
                                           │
                                    Structured JSON log
                                    { timestamp, tool, duration_ms,
                                      violation_count, severity }
                                           │
         ◄────────────────────────────────┘
         │
         ├── violations found + DRY_RUN=false → exit 1 (Kiro blocks codegen)
         ├── violations found + DRY_RUN=true  → exit 0 (log only, codegen proceeds)
         └── no violations → exit 0 (codegen proceeds)
                                    │
                              git push
                                    │
                                    ▼
                        GitHub Actions CI Gate
                        ┌──────────────────────────────────┐
                        │ spec-validation.yml              │
                        │  - npm run build + test          │
                        │  - Start MCP server              │
                        │  - Test enforce mode: exit 1     │
                        │  - Test dry-run mode: exit 0     │
                        │  - Test secure spec: exit 0      │
                        └──────────────────────────────────┘
                        ┌──────────────────────────────────┐
                        │ plan-security.yml                │
                        │  - OPA check policies/opa/       │
                        │  - terraform validate (3 modules)│
                        └──────────────────────────────────┘
                        ┌──────────────────────────────────┐
                        │ deploy-prod.yml (main branch)    │
                        │  - Gate: both workflows green    │
                        │  - Environment: production       │
                        │    (manual approval required)    │
                        │  - OIDC → AWS deploy role        │
                        │  - terraform apply               │
                        └──────────────────────────────────┘
```

## Component Roles

### Kiro Hook (`policy-enforcer.js`)

The hook is the first line of defense. It runs synchronously before Kiro generates any Terraform code. If it exits with code 1, codegen is blocked.

Key behaviors:
- **Fail-closed**: if the MCP server is unreachable, exits 1 (not 0)
- **Dry-run mode**: reads `POLICY_ENFORCER_DRY_RUN` env var; if `true`, always exits 0
- **Parallel calls**: validates IAM and network policies simultaneously (faster feedback)
- **Uses native `fetch`**: requires Node 18+ (no additional HTTP client dependency)

### MCP Server (`mcp-server/src/index.ts`)

Runs as a persistent process on port 3000. Exposes both:
- **MCP Streamable HTTP** at `/mcp` — for Kiro and Claude Desktop integration
- **REST API** at `/tools/*` — for direct `curl` testing and the hook

Every tool call emits a structured JSON log line to stdout:
```json
{"timestamp":"2025-01-01T00:00:00Z","tool":"validate_iam_policy","duration_ms":12,"violation_count":3,"severity":"CRITICAL"}
```

This is compatible with CloudWatch Logs Insights, Datadog, and any log aggregator that reads JSON per line.

### OPA Policies (`policies/opa/`)

Three policy files covering different domains:
- `iam_least_privilege.rego` — IAM action/resource wildcards, admin without MFA
- `no_public_resources.rego` — RDS public access, S3 public ACL, dangerous port exposure
- `network_zero_trust.rego` — SG documentation, VPC endpoint coverage

Policies consume the same YAML spec format as the MCP server, so the same test fixtures apply to both.

### Terraform Modules (`terraform/modules/`)

Three reusable modules that implement the security controls the OPA policies enforce:
- `minimal-iam` — parameterized IAM role with conditional statements, max 64-char name validation
- `secure-rds` — PostgreSQL with KMS encryption, private subnets, SG-to-SG ingress, SSL parameter group
- `secure-s3` — Private S3 with KMS-SSE, versioning, lifecycle tiers, TLS-deny bucket policy

## Decision Log

### Why MCP over direct API calls?

The MCP protocol lets the same validation logic run in three contexts without code duplication:
1. Kiro hook (REST API call from Node.js)
2. Claude Desktop (MCP tool call)
3. Direct `curl` for demo purposes

A direct API call would require separate integrations for each context.

### Why fail-closed when MCP server is unreachable?

Zero Trust assumes breach. If the policy enforcement service is down, the safe default is to block — not to allow. An outage in the security layer should surface immediately, not silently allow insecure specs through.

The dry-run mode exists specifically for teams onboarding to this workflow who need a grace period before enforcement is strict.

### Why OPA over custom scripts?

OPA provides:
- Declarative policy language (Rego) with structured output
- Native `opa test` for unit-testing policies
- Standard `opa eval` CLI for CI integration
- A well-understood audit surface vs. custom Node/Python logic

### Why OIDC for GitHub Actions?

OIDC eliminates long-lived credentials. The GitHub token is exchanged for a short-lived AWS role session scoped to the repository and branch. No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is ever stored in GitHub Secrets.

## Adding New Policy Rules

### To the MCP server (TypeScript):

1. Add a new violation check in `src/tools/validate-iam.ts` or `check-network.ts`
2. Add a test case in the corresponding `.test.ts` file
3. Run `npm test` to verify

Example — adding a check for CloudTrail logging:
```typescript
// In check-network.ts
case 'aws_cloudtrail': {
  if (resource.config['is_logging'] === false) {
    violations.push({
      ruleId: 'NET-009',
      severity: 'HIGH',
      resource: resource.id,
      message: 'CloudTrail logging is disabled',
      remediation: 'Set is_logging = true and configure log file validation',
    });
  }
  break;
}
```

### To OPA (Rego):

1. Add a `deny` or `warn` rule to the relevant `.rego` file
2. Document with the `# §RULE-ID` comment convention
3. Run `opa test policies/opa/ -v` to verify

### To both (for consistency):

The TypeScript tools and OPA policies serve different purposes — TypeScript runs in real-time during development, OPA runs in CI on plan JSON. Keep them synchronized: a new rule in one should have an equivalent in the other.
