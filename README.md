# kiro-zero-trust-enforcer

**Zero Trust from the first keystroke — not the first alert.**

A demo repository for AWS talks showing how to enforce Zero Trust security policies at the spec level, before any infrastructure code is generated.

---

## What Is This?

This project shows how to wire together Kiro IDE, the Model Context Protocol, Open Policy Agent, and GitHub Actions into a continuous security enforcement chain. When a developer writes an architecture spec, violations are detected and blocked before a single line of Terraform is generated.

The same policy logic runs in three places: the Kiro hook (developer's machine), the MCP server (policy engine), and GitHub Actions (CI gate). You can't bypass one without bypassing all three.

---

## Architecture

```
  Developer writes spec (.kiro/specs/)
           │
           ▼ Kiro post-spec hook
  policy-enforcer.js
           │ HTTP POST (parallel)
           ├──► /tools/validate_iam_policy
           └──► /tools/check_network_posture
                       │
              mcp-server (port 3000)
              JSON log: {timestamp, tool, duration_ms, violation_count, severity}
                       │
           ┌───────────┴───────────┐
     violations?              no violations
     DRY_RUN=true?
           │                       │
     log + exit 0             exit 0
     DRY_RUN=false?       (codegen proceeds)
           │
     exit 1 (blocked)
           │
       git push
           │
  GitHub Actions
  ├── spec-validation.yml  (MCP tests + hook integration)
  ├── plan-security.yml    (OPA + terraform validate)
  └── deploy-prod.yml      (gate: both green + manual approval + OIDC)
```

---

## Quick Start

```bash
# 1. Clone
git clone <your-repo-url>
cd kiro-zero-trust-enforcer

# 2. Build the MCP server
cd mcp-server && npm install && npm run build && cd ..

# 3. Install hook dependencies
cd .kiro/hooks && npm install && cd ../..

# 4. Start the MCP server (keep this terminal open)
cd mcp-server && npm start

# 5. In a new terminal — test the hook in enforce mode (expect exit 1)
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml

# 6. Test dry-run mode (expect exit 0, violations logged)
POLICY_ENFORCER_DRY_RUN=true node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml

# 7. Test the secure spec (expect exit 0, no violations)
node .kiro/hooks/policy-enforcer.js .kiro/specs/secure-example.yaml
```

---

## How It Works

### Kiro Hooks

The hook in `.kiro/hooks/policy-enforcer.js` fires after every spec save in Kiro. It calls the MCP server's REST API in parallel for IAM and network validation, then:

- **Enforce mode** (default): exits 1 on CRITICAL or HIGH violations, blocking codegen
- **Dry-run mode** (`POLICY_ENFORCER_DRY_RUN=true`): logs all violations but always exits 0
- **Fail-closed**: if the MCP server is unreachable, exits 1 by default

### MCP Server

The TypeScript server in `mcp-server/` runs on port 3000 and exposes:

- **MCP Streamable HTTP** at `/mcp` — for Kiro IDE integration
- **REST API** at `/tools/*` — for direct testing and the hook
- **Health check** at `/health` — used by GitHub Actions readiness probes

Every tool call emits structured JSON to stdout:
```json
{"timestamp":"...","tool":"validate_iam_policy","duration_ms":12,"violation_count":3,"severity":"CRITICAL"}
```

Available tools: `validate_iam_policy`, `check_network_posture`, `calculate_blast_radius`, `suggest_least_privilege`, `generate_security_addendum`

### OPA Policies

Three Rego policy files in `policies/opa/` implement the same rules as the TypeScript tools, for use in CI against Terraform plan JSON:

- `iam_least_privilege.rego` — wildcard actions/resources, admin without MFA, excessive action counts
- `no_public_resources.rego` — public RDS, S3 public ACL, open security group ports
- `network_zero_trust.rego` — SG documentation, VPC endpoint coverage, deletion protection

### OIDC

All GitHub Actions workflows use OIDC to assume AWS roles — no access keys are stored anywhere. The `deploy-prod.yml` workflow additionally requires manual approval via GitHub Environment protection rules.

---

## AWS MCP Server — Runtime Companion

The local MCP server in this repo enforces zero-trust at **spec time** (before codegen). It does not — and should not — call AWS.

The [AWS MCP Server](https://aws.amazon.com/blogs/aws/the-aws-mcp-server-is-now-generally-available/) (GA, 2026) is the runtime counterpart: an authenticated MCP endpoint that exposes `call_aws`, `run_script`, and AWS documentation search to any MCP client, using existing IAM credentials.

This branch wires it in as an **additive** layer:

- `.kiro/steering/aws-mcp.md` — tells Kiro when to delegate to AWS MCP vs. the local server
- `.kiro/skills/aws-account-audit/SKILL.md` — read-only audit of the live account, findings shaped like local MCP violations (same `ruleId` namespace)
- `docs/aws-mcp-integration.md` — design, setup, layered enforcement model (L-1..L3), open questions

No changes to `mcp-server/src/`. The AWS MCP signal **augments** local enforcement; it never overrides a `CRITICAL` block.

### SCP Layer (L-1)

Service Control Policies sit **above** IAM at the AWS Organizations level — a `Deny` here cannot be bypassed by any role policy. Six SCPs mirror the project's CRITICAL rules and ship as a reusable Terraform module:

- `terraform/modules/scp-zero-trust/` — module with `deny_public_s3`, `deny_rds_public`, `deny_unencrypted_rds`, `deny_open_dangerous_ports`, `require_mfa_for_admin`, `deny_outside_regions`
- `policies/opa/scp_alignment.rego` — fails CI when a Terraform plan would be denied by an attached SCP (catches contradictions before `apply`)
- `.kiro/steering/aws-scp.md` — rollout protocol, what SCPs cover vs. don't
- `aws-account-audit` skill, scope `scp` — drift detection: local JSON vs. live SCPs via AWS MCP

Apply from the AWS Organizations management account only, and stage the rollout sandbox → non-prod → prod → root.

Install (Kiro only). Register the server in Kiro's MCP config — `.kiro/settings/mcp.json` for the workspace or `~/.kiro/settings/mcp.json` for the user. Create the file if it does not exist:

```json
{
  "mcpServers": {
    "aws-mcp": {
      "command": "uvx",
      "args": [
        "mcp-proxy-for-aws@latest",
        "https://aws-mcp.us-east-1.api.aws/mcp"
      ]
    }
  }
}
```

Reload the Kiro window after saving. The `claude mcp add-json` CLI belongs to Claude Code and does **not** apply here.

---

## Demo Scenarios

See [docs/demo-script.md](docs/demo-script.md) for a complete 10-minute live demo script including backup plans.

**Core demo flow:**
1. Open `insecure-example.yaml` in Kiro → ask for Terraform → hook blocks with violations
2. Run `calculate_blast_radius` via curl → show 847 affected services
3. Switch to `secure-example.yaml` → hook passes → codegen proceeds

---

## Customizing Policies

### Add a TypeScript rule

Edit `mcp-server/src/tools/validate-iam.ts` or `check-network.ts`, add a `violations.push()` call with a new `ruleId`, then add a test in the corresponding `.test.ts` file.

### Add an OPA rule

Edit the appropriate `.rego` file in `policies/opa/`. Follow the `# §RULE-ID` comment convention. Run `opa test policies/opa/ -v` to verify.

Both should stay synchronized — the same violation that's caught by TypeScript in development should also be caught by OPA in CI.

---

## Project Structure

```
.
├── .kiro/
│   ├── hooks/
│   │   ├── package.json          — js-yaml dependency
│   │   └── policy-enforcer.js    — Kiro hook with dry-run mode
│   └── specs/
│       ├── insecure-example.yaml — Demo: 7+ violations
│       └── secure-example.yaml   — Demo: clean, compliant
├── mcp-server/
│   ├── src/
│   │   ├── index.ts              — MCP server + Express on port 3000
│   │   ├── logger.ts             — Structured JSON log emitter
│   │   ├── types.ts              — Shared TypeScript interfaces
│   │   └── tools/
│   │       ├── validate-iam.ts   — IAM policy validation
│   │       ├── check-network.ts  — Network posture validation
│   │       ├── blast-radius.ts   — Compromise blast radius estimator
│   │       └── suggest-minimal.ts — Least-privilege suggestions
│   ├── package.json
│   └── tsconfig.json
├── terraform/
│   └── modules/
│       ├── minimal-iam/          — Least-privilege IAM role module
│       ├── secure-rds/           — Encrypted private RDS module
│       └── secure-s3/            — Private S3 with KMS + TLS-deny policy
├── policies/
│   └── opa/
│       ├── iam_least_privilege.rego
│       ├── no_public_resources.rego
│       └── network_zero_trust.rego
├── .github/
│   └── workflows/
│       ├── spec-validation.yml   — Tests hook in enforce + dry-run mode
│       ├── plan-security.yml     — OPA check + terraform validate
│       └── deploy-prod.yml       — Gate + OIDC deploy
└── docs/
    ├── setup.md
    ├── architecture.md
    └── demo-script.md
```

---

## Contributing

1. Fork the repository
2. Make changes in a feature branch
3. Ensure `npm test` passes in `mcp-server/`
4. Ensure `terraform validate` passes for any modified modules
5. Open a PR — CI will run all checks automatically

---

## License

MIT
