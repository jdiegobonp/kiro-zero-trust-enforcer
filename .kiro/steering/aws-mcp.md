---
inclusion: always
---

# AWS MCP Server — Runtime Companion

The local zero-trust MCP server on port 3000 validates **specs before codegen** (static rules on `ArchSpec` YAML).
The **AWS MCP Server** (GA, 2026) validates **live AWS state** via IAM/SigV4-authenticated calls.

Use both. They are layered, not redundant.

## Endpoint and Setup

- **Endpoint:** `https://aws-mcp.us-east-1.api.aws/mcp` (also `eu-central-1`)
- **Proxy:** [`mcp-proxy-for-aws`](https://github.com/aws/mcp-proxy-for-aws) — bridges IAM/SigV4 ↔ OAuth 2.1 for MCP clients.
- **Auth:** existing IAM credentials (AWS CLI profile, env vars, or SSO). No new keys.
- **Pricing:** server is free; pay only for AWS resources created or queried.

Install for Kiro. This project targets Kiro IDE only. Add the server to Kiro's MCP config — `.kiro/settings/mcp.json` for the workspace or `~/.kiro/settings/mcp.json` for the user. Create the file if it does not exist:

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

Reload the Kiro window after saving. `claude mcp add-json` is Claude Code CLI syntax and **does not apply** here.

## When to Call Which Server

| Phase | Server | Why |
|---|---|---|
| Spec edit in Kiro | local (`localhost:3000`) | deterministic, offline, sub-100ms |
| Pre-`terraform apply` | local + AWS MCP `call_aws` → `iam:SimulatePrincipalPolicy` | catches drift between spec and account baseline |
| Post-deploy audit | AWS MCP `call_aws` → `ec2:DescribeSecurityGroups`, `s3:GetBucketPolicy`, `iam:GetAccountAuthorizationDetails` | live verification of zero-trust posture |
| IAM advice grounding | AWS MCP `search_documentation` / `read_documentation` | suggestions cite current AWS docs, not stale presets |
| Blast-radius what-if | AWS MCP `run_script` (sandboxed Python, no network) | computes against real account topology with inherited IAM, no external egress |

## Tools Exposed by AWS MCP

- `call_aws` — any of the 15k+ AWS API operations via existing IAM
- `search_documentation` / `read_documentation` — current AWS docs at query time
- `run_script` — sandboxed Python, IAM inherited, **no network**
- Skills — curated guidance from AWS service teams

## Hard Rules

- **Never** request `call_aws` actions outside the allowlist defined in the IAM role used by the proxy. Default deny.
- AWS MCP results are **read-only signals** for the enforcer. They never override local MCP `CRITICAL` blocks — they only **add** violations.
- If AWS MCP is unreachable, treat it like the local MCP: **fail closed in enforce mode**, log in dry-run.
- Do not embed AWS account IDs, ARNs, or session credentials in steering, skills, or specs.

## Pointers

- Integration architecture: `docs/aws-mcp-integration.md`
- Skill `aws-account-audit` — runs a curated set of `call_aws` checks against a deployed account
- Blog: <https://aws.amazon.com/blogs/aws/the-aws-mcp-server-is-now-generally-available/>
- User guide: <https://docs.aws.amazon.com/agent-toolkit/latest/userguide/mcp-server.html>
