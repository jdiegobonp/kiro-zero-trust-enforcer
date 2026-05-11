# 10-Minute Demo Script

## Pre-Stage Setup (5 minutes before going on stage)

```bash
# Terminal 1 — MCP Server
cd mcp-server && npm run dev
# Verify: "Zero-trust MCP server running on port 3000"

# Terminal 2 — Project root
# Leave at project root, Kiro open with insecure-example.yaml in editor

# Browser — have these tabs ready:
# - GitHub PR showing a fake "insecure" PR (pre-create one against your repo)
# - GitHub Actions showing a failed run on the insecure spec
```

Font size: 18pt minimum. Dark theme. Hide notification banners.

---

## MINUTE 0:00–1:00 — Set the Scene

**Say:** "Imagine this: a developer on your team is building a payment API at 5pm on a Friday. They've written this architecture spec."

**Show:** `insecure-example.yaml` in Kiro editor. Scroll through it slowly.

**Ask the audience:** "How many security problems can you spot in 10 seconds? Go."

Pause 5 seconds. Let them look.

**Say:** "There are at least seven. Wildcard IAM actions, publicly accessible database, unencrypted storage, SSH open to the world, Postgres open to the world..."

---

## MINUTE 1:00–3:00 — The Old Way

**Say:** "In the old world, this spec passes code review. Maybe it gets caught by Security Hub three days after it deploys to production."

**Show:** Switch to browser, open GitHub PR with a green checkmark on the insecure spec. 

**Say:** "The PR passed. The CI pipeline is green. The diff looks fine to a reviewer who doesn't know to look for IAM wildcards. Three days later, your SOC team pages oncall at 2am because someone exfiltrated your payment data."

**Say:** "What if we could catch this at the moment of creation? Before a single line of Terraform is generated?"

---

## MINUTE 3:00–6:00 — Demo 1: The Block

**Action:** In Kiro, with `insecure-example.yaml` open, ask:
> "Generate Terraform infrastructure for this spec"

**Expected:** The policy enforcer hook fires. Watch Terminal 1 for JSON log lines appearing. Watch Kiro's output panel for the violation report.

**Narrate as violations appear:**

- "There it is — IAM-001. Wildcard action `*`. Critical."
- "IAM-002. Wildcard resource `*`. Also critical."
- "NET-001. RDS publicly accessible. Critical."
- "NET-002. Storage not encrypted. High."
- "NET-005. SSH open to 0.0.0.0/0. Critical."

**Say:** "Five critical violations. Codegen is blocked. The developer can't accidentally deploy this. And look at Terminal 1 — every validation call is logged as structured JSON. Timestamp, tool, duration, violation count, severity. Ready for CloudWatch, Datadog, your SIEM."

**Pause on the wildcard IAM blast radius.** Say: "Let me show you exactly what that wildcard means."

---

## MINUTE 6:00–8:00 — Demo 2: Blast Radius

**Action:** Switch to Terminal 2. Run:

```bash
curl -s -X POST http://localhost:3000/tools/calculate_blast_radius \
  -H "Content-Type: application/json" \
  -d '{
    "roleName": "payment-lambda",
    "actions": ["*"],
    "resources": ["*"]
  }' | python3 -m json.tool
```

**Talk through the output:**

- "EstimatedBlastRadius: CRITICAL. Score over 80."
- "can_create_admin_users. This Lambda can create new AWS admin users."
- "can_disable_audit_logging. This Lambda can delete your CloudTrail logs."
- "can_steal_all_secrets. Every secret in Secrets Manager."
- "847 AWS services affected."

**Say:** "This is a payment Lambda. It processes credit card transactions. It needs S3 write access and Secrets Manager for the database password. That's it. Not 847 services."

**Say:** "Let's see what the minimal policy actually looks like."

**Run:**
```bash
curl -s -X POST http://localhost:3000/tools/suggest_least_privilege \
  -H "Content-Type: application/json" \
  -d '{"currentActions": ["*"], "useCase": "lambda-s3-writer"}' | python3 -m json.tool
```

**Say:** "Three actions. Specific resource ARNs. Down from unlimited to exactly what it needs."

---

## MINUTE 8:00–9:30 — Demo 3: The Fix

**Action:** In Kiro, switch to `secure-example.yaml`.

**Say:** "This is the remediated spec. Scoped IAM actions, private RDS, encrypted storage, SG-to-SG rules instead of CIDR blocks, a VPC endpoint for S3."

**Action:** Ask Kiro:
> "Generate Terraform infrastructure for this spec"

**Expected:** The hook fires, finds zero violations, codegen proceeds cleanly.

**Say:** "Clean. Zero violations. And because we're using the Terraform modules in this project — secure-rds, secure-s3, minimal-iam — the generated code inherits all of these controls. Deletion protection. KMS rotation. Backup retention. They're not optional."

**Optional:** Switch to browser, show the GitHub Actions run on the secure spec — all green.

---

## MINUTE 9:30–10:00 — Close

**Say:** "Zero Trust from the first keystroke. Not from the first alert. Not from the first breach. From the moment a developer writes a spec."

**Say:** "The policy enforcer runs in Kiro. The same logic runs in CI. The Terraform modules make the secure path the easy path. And if you're onboarding a team and not ready to block yet—"

**Run:**
```bash
POLICY_ENFORCER_DRY_RUN=true node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```

**Say:** "Dry-run mode. Every violation is logged and visible. The developer sees it. Your SIEM sees it. But codegen isn't blocked yet. You turn enforcement on when your team is ready."

**Show QR code** linking to the repository.

**Say:** "The whole thing is open source. Kiro hooks, MCP server, OPA policies, Terraform modules, GitHub Actions — all in one repo. Link in the QR code."

---

## Backup Plan

### If MCP server is down or crashed

1. Switch to Terminal 1, restart: `cd mcp-server && npm start`
2. While it starts: "The MCP server is the policy brain. When it's unreachable, the enforcer fails closed — codegen is blocked by default. That's Zero Trust."
3. If it won't start: skip to showing the spec files directly and walking through violations manually using the OPA rules in `policies/opa/`.

### If Kiro is slow or the hook doesn't fire

Run the hook manually from Terminal 2:
```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```
Same output, same story. "I'm running the hook directly — this is exactly what Kiro runs under the hood."

### If curl commands fail

Pre-paste the commands in a text file and show the pre-recorded output. Keep `docs/assets/demo-output.json` with sample responses from each tool.

### If you lose internet (GitHub not loading)

Skip the browser demo. The local demo (hook + MCP server) is self-contained. "GitHub Actions would show this too, but the important part is what happens before the PR is even created."
