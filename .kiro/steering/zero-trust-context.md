---
inclusion: always
---

# Zero Trust Enforcer — Project Context

This project enforces Zero Trust security policies on AWS architecture specs before any infrastructure code is generated.

## Enforcement Chain

```
.kiro/specs/<name>.yaml  →  .kiro/hooks/policy-enforcer.js  →  MCP REST API  →  exit 0 / 1
```

## MCP Server

- **URL:** `http://localhost:3000`
- **Start:** `cd mcp-server && npm run build && node dist/index.js`
- **Health check:** `GET http://localhost:3000/health` → `{ "status": "ok", "tools": [...] }`
- **PID file:** `.kiro/.demo-pid` (written by demo-setup, used by resilience-check)

## Policy Hook

```bash
# Enforce mode (blocks on CRITICAL/HIGH)
node .kiro/hooks/policy-enforcer.js <spec.yaml>

# Dry-run mode (logs but never exits 1)
POLICY_ENFORCER_DRY_RUN=true node .kiro/hooks/policy-enforcer.js <spec.yaml>
```

Exit codes: `0` = pass or dry-run | `1` = blocked (enforce) or server unreachable (enforce)

## Severity Model

| Severity | Enforce mode | Dry-run mode |
|---|---|---|
| CRITICAL | Blocks (exit 1) | Logged only |
| HIGH | Blocks (exit 1) | Logged only |
| MEDIUM | Logged only | Logged only |
| LOW | Logged only | Logged only |

## IAM Rules (validate_iam_policy)

| Rule ID | Severity | Condition |
|---|---|---|
| IAM-001 | CRITICAL | Wildcard action (`*` or `service:*`) |
| IAM-002 | CRITICAL | Wildcard resource (`*`) |
| IAM-003 | HIGH | >15 actions per statement |
| IAM-004 | CRITICAL | Admin actions (`iam:*`, `organizations:*`) without MFA condition |
| IAM-005 | MEDIUM | Role name exceeds 64 characters |

**Never suggest `Action: "*"` or `Resource: "*"` — both are automatic CRITICAL violations.**

## Network Rules (check_network_posture)

| Rule ID | Severity | Condition |
|---|---|---|
| NET-001 | CRITICAL | RDS `publicly_accessible: true` |
| NET-002 | HIGH | RDS `storage_encrypted: false` |
| NET-003 | MEDIUM | RDS backup retention < 7 days |
| NET-004 | CRITICAL | S3 ACL `public-read` or `public-read-write` |
| NET-005 | CRITICAL | Security group exposes dangerous port (22, 23, 3306, 5432, etc.) to `0.0.0.0/0` |
| NET-006 | HIGH | Security group exposes non-standard port to `0.0.0.0/0` |
| NET-007 | MEDIUM | Port 80/443 open to `0.0.0.0/0` without ALB |
| NET-008 | MEDIUM | S3 bucket defined without VPC endpoint |

## REST Tool Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/tools/validate_iam_policy` | POST | IAM rules on `ArchSpec` body |
| `/tools/check_network_posture` | POST | Network rules on `ArchSpec` body |
| `/tools/calculate_blast_radius` | POST | `{ roleName, actions[], resources[] }` |
| `/tools/suggest_least_privilege` | POST | `{ currentActions[], useCase }` |
| `/health` | GET | Server liveness |

## Least Privilege Presets (suggest_least_privilege)

`lambda-s3-writer` · `lambda-rds-reader` · `lambda-secrets` · `api-gateway-invoker` · `cloudwatch-logger`

## HTTP Calls

Use `python3` for HTTP calls to avoid RTK proxy summarizing JSON:
```bash
python3 -c "
import urllib.request, json, sys
req = urllib.request.Request(
    'http://localhost:3000/tools/calculate_blast_radius',
    data=json.dumps({...}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req) as r:
    print(json.dumps(json.loads(r.read()), indent=2))
"
```

## Terraform Modules

```
terraform/modules/minimal-iam/   → zero-trust IAM role + inline policy
terraform/modules/secure-rds/    → encrypted, private RDS with KMS
terraform/modules/secure-s3/     → private S3 with KMS, versioning, TLS-only policy
```

Validate: `cd terraform/modules/<name> && terraform init -backend=false && terraform validate`

## OPA Policies

```
policies/opa/iam_least_privilege.rego   → IAM-001..005 in Rego
policies/opa/no_public_resources.rego   → NET-001..005 in Rego
policies/opa/network_zero_trust.rego    → ZT-001..004 in Rego
```

## Spec Format (ArchSpec)

```yaml
name: <spec-name>
version: "1.0"
resources:
  - type: aws_iam_role
    id: <resource-id>
    config:
      role_name: <name>
      statements:
        - effect: Allow
          actions: [...]
          resources: [...]
```

## Example Specs

- `.kiro/specs/insecure-example.yaml` — intentionally violates 10 rules (use for demo blocking scenarios)
- `.kiro/specs/secure-example.yaml` — fully compliant (use for happy-path demos)
