---
name: blast-radius-report
description: |
  Use this skill when the user says "calculate blast radius", "how dangerous is this role",
  "what damage could this IAM role do", "blast radius", "/blast-radius-report", or right-clicks
  an aws_iam_role resource in a spec and selects security analysis. Analyzes every IAM role in
  a spec and scores the potential damage if each role were compromised.
---

# blast-radius-report — IAM Role Compromise Impact Analysis

For every `aws_iam_role` resource in a spec, calculate and display the blast radius score.

## Arguments

- `<spec>` (optional) — path to a YAML spec. Defaults to active editor file or prompts from `.kiro/specs/`.

## Steps

### Step 1 — Resolve and parse the spec

Use the same resolution logic as `validate-spec`:
1. Use the provided argument path
2. Fall back to the active editor file (if `.yaml` under `.kiro/specs/`)
3. Otherwise list `.kiro/specs/` and ask the user to choose

Parse the YAML and extract all resources where `type: aws_iam_role`.

For each IAM role, collect:
- `roleName` = resource `id` field
- `actions` = all action strings from `config.statements[*].actions` (flatten, deduplicate)
- `resources` = all resource strings from `config.statements[*].resources` (flatten, deduplicate)

### Step 2 — Check MCP server health

```bash
python3 -c "
import urllib.request, sys
try:
    urllib.request.urlopen('http://localhost:3000/health', timeout=3)
except Exception as e:
    print('MCP server not reachable:', e, file=sys.stderr)
    sys.exit(1)
"
```

If unreachable, tell the user to run `/demo-setup` first and stop.

### Step 3 — Call calculate_blast_radius for each role

For each extracted role, call the REST endpoint using Python:

```bash
python3 -c "
import urllib.request, json

roles = <list of {roleName, actions, resources} dicts>

results = []
for role in roles:
    req = urllib.request.Request(
        'http://localhost:3000/tools/calculate_blast_radius',
        data=json.dumps(role).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req) as r:
        results.append(json.loads(r.read()))

print(json.dumps(results, indent=2))
"
```

Sort results by `maxPrivilegeScore` descending.

### Step 4 — Render the report

Print a ranked report for each role:

```
Blast Radius Analysis — <spec filename>
════════════════════════════════════════

#1  CRITICAL  payment-lambda-role          Score: 360
    ├─ can_create_admin_users
    ├─ can_exfiltrate_all_data
    ├─ can_disable_audit_logging
    ├─ can_modify_network_controls
    ├─ can_steal_all_secrets
    ├─ can_compromise_entire_org
    └─ can_decrypt_all_data
    Recommendations:
      • Split into purpose-scoped roles: one per Lambda function or service boundary
      • Start with AWS managed policies (e.g., AmazonS3ReadOnlyAccess) then prune
      • Use AWS IAM Access Analyzer to generate policies from CloudTrail activity

#2  LOW  some-other-role                   Score: 12
    └─ (no high-risk capabilities detected)

Summary: 1 CRITICAL · 0 HIGH · 0 MEDIUM · 1 LOW
```

For each severity label, use these indicators:
- CRITICAL → `CRITICAL` (or highlight in red if the terminal supports it)
- HIGH → `HIGH`
- MEDIUM → `MEDIUM`
- LOW → `LOW`

### Step 5 — Offer remediation

For every role with `estimatedBlastRadius: CRITICAL` or `HIGH`:

```
payment-lambda-role is CRITICAL.
→ Run /suggest-permissions --role payment-lambda-role to generate a least-privilege replacement.
```

If the user confirms, invoke the `suggest-permissions` skill with the role name as the `--role` argument.

## Notes

- If the spec has no `aws_iam_role` resources, say so clearly and stop.
- The `affectedServices` field from the API contains named capability strings (e.g., `can_exfiltrate_all_data`),
  not AWS service names. Display them as-is; they are self-explanatory.
- `maxPrivilegeScore` of 360 means full wildcard (`*` action + `*` resource with 1.5× multiplier).
  Explain this to the audience: "This Lambda can touch 847 AWS services — it only needs 3 S3 actions."
