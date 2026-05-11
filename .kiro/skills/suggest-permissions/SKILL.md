---
name: suggest-permissions
description: |
  Use this skill when the user says "suggest permissions", "what permissions does this need",
  "apply least privilege", "fix this IAM role", "/suggest-permissions", or when blast-radius-report
  offers a remediation action. Generates a minimal IAM permission set for a given use case and
  optionally patches the spec in-place, then re-validates to confirm the fix.
---

# suggest-permissions — Least Privilege IAM Permission Generator

Generate minimal IAM permissions for a use case and optionally patch the spec.

## Arguments

- `<useCase>` (optional) — one of the built-in presets. If omitted, present a menu.
- `--role <roleName>` (optional) — name of the IAM role resource ID in the spec to fix.
  If omitted, use the first CRITICAL role found, or ask the user.
- `<spec>` (optional) — path to the spec. Defaults to active editor file or `.kiro/specs/`.

## Available Presets

| Use Case | Suggested Actions |
|---|---|
| `lambda-s3-writer` | s3:PutObject, s3:GetObject, s3:DeleteObject |
| `lambda-rds-reader` | rds-db:connect |
| `lambda-secrets` | secretsmanager:GetSecretValue |
| `api-gateway-invoker` | lambda:InvokeFunction |
| `cloudwatch-logger` | logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents |

## Steps

### Step 1 — Resolve arguments

If no `useCase` provided, present the menu:
```
Which use case describes this Lambda?
  1. lambda-s3-writer    — reads and writes objects to a specific S3 bucket
  2. lambda-rds-reader   — connects to an RDS database as a specific DB user
  3. lambda-secrets      — retrieves a specific secret from Secrets Manager
  4. api-gateway-invoker — invokes a specific Lambda function
  5. cloudwatch-logger   — writes logs to CloudWatch Logs

Enter 1–5:
```

If `--role` was provided, read the spec to find that role's current `actions` and `resources`.
If no `--role`, read the spec and find the first role with any blocking IAM violation (CRITICAL/HIGH).

### Step 2 — Check MCP server health

Same health check as other skills. Stop with "Run `/demo-setup` first" if unreachable.

### Step 3 — Call suggest_least_privilege

Read the current actions from the role in the spec (or use `["*"]` if the role has wildcard).

```bash
python3 -c "
import urllib.request, json

payload = {
    'currentActions': <list of current actions>,
    'useCase': '<useCase>'
}
req = urllib.request.Request(
    'http://localhost:3000/tools/suggest_least_privilege',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req) as r:
    print(json.dumps(json.loads(r.read()), indent=2))
"
```

### Step 4 — Show the diff

Present the before/after change clearly:

```
Least Privilege Suggestion for: payment-lambda-role
Use case: lambda-s3-writer

  Before actions:  ["*"]
  After actions:   ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]

  Before resources: ["*"]
  After resources:  [
    "arn:aws:s3:::REPLACE_WITH_BUCKET_NAME",
    "arn:aws:s3:::REPLACE_WITH_BUCKET_NAME/*"
  ]

  Rationale: Reduced from wildcard to 3 purpose-specific actions.
             Replace REPLACE_WITH_BUCKET_NAME with your actual bucket name.

Apply this change to the spec? (y/N)
```

### Step 5 — Patch the spec (if user confirms)

If the user says yes:

1. Edit the spec YAML file directly using your file editing tools.
2. Find the role resource block identified by `id: <roleName>`.
3. Replace the `statements` section:
   - Change `actions` to the suggested actions list
   - Change `resources` to the suggested resources list
4. Save the file.

Show what was changed:
```
Patched .kiro/specs/<spec>.yaml:
  Role: payment-lambda-role
  actions: ["*"] → ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
  resources: ["*"] → ["arn:aws:s3:::REPLACE_WITH_BUCKET_NAME", ...]
```

### Step 6 — Re-validate (after patch)

Automatically run the policy enforcer in enforce mode on the patched spec:

```bash
node .kiro/hooks/policy-enforcer.js <spec-path>
```

- If exit 0: "Fix confirmed — spec is now zero-trust compliant for this role."
- If exit 1 (other violations remain): show remaining violations. Offer to fix the next one.

## Notes

- Resources containing `REPLACE_WITH_BUCKET_NAME` or similar placeholders are intentional.
  Remind the user to substitute real ARNs before deploying.
- If the user says "no" to patching, the skill ends after Step 4. The diff is informational only.
- Do NOT apply the patch silently. Always ask first and show the exact change.
- If the role has multiple statements with different purposes, note that you're replacing all of them
  and that the user may need to split into multiple statements for different targets.
