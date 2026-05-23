---
name: validate-spec
description: |
  Use this skill when the user says "validate this spec", "check security", "run the policy enforcer",
  "/validate-spec", or references a .yaml spec file in the context of security validation.
  Accepts an optional spec path and an optional --dry-run flag.
  Examples: "/validate-spec", "/validate-spec insecure-example.yaml", "/validate-spec --dry-run"
---

# validate-spec — Run Zero Trust Policy Enforcement on a Spec

Validate an architecture spec against the zero-trust policy rules via the MCP server.

## Arguments

- `<spec>` (optional) — path to a Kiro spec folder (`.kiro/specs/<name>/`) or a direct `.yaml` file. If omitted, lists available specs.
- `--dry-run` (optional flag) — log violations but do not block; always exits 0.

## Steps

### Step 1 — Resolve the spec path

1. If a path was provided as an argument, use it directly (folder or yaml file).
2. Otherwise, check if the currently active file in the editor lives under `.kiro/specs/` — if so, derive its spec folder and use that.
3. Otherwise, list all spec folders:

   ```bash
   find .kiro/specs -mindepth 1 -maxdepth 1 -type d
   ```

   Also include any standalone `.yaml` files at the root of `.kiro/specs/`:

   ```bash
   find .kiro/specs -maxdepth 1 -name "*.yaml" -o -name "*.yml"
   ```

   Present the combined list by name and ask the user to choose.

The hook accepts both folders and yaml files — pass whatever was resolved.

Verify the path exists before continuing.

### Step 2 — Check the MCP server

```bash
python3 -c "
import urllib.request, sys
try:
    urllib.request.urlopen('http://localhost:3000/health', timeout=3)
    sys.exit(0)
except Exception as e:
    print('MCP server not reachable:', e, file=sys.stderr)
    sys.exit(1)
"
```

If this fails, tell the user: "MCP server is not running. Run `/demo-setup` first." and stop.

### Step 3 — Run the policy enforcer

If `--dry-run` was requested:
```bash
POLICY_ENFORCER_DRY_RUN=true node .kiro/hooks/policy-enforcer.js <resolved-spec-path>
DRY_RUN_EXIT=$?
```

Otherwise (enforce mode):
```bash
node .kiro/hooks/policy-enforcer.js <resolved-spec-path>
ENFORCE_EXIT=$?
```

Capture the full stdout and stderr output.

### Step 4 — Present the results

**Case A: No violations (exit 0, no violation lines in output)**
```
✓ Spec is zero-trust compliant — no violations found.
  Spec:  <spec filename>
  Mode:  enforce
  Checked at: <timestamp>
```

**Case B: Dry-run mode with violations (exit 0, dry-run banner present)**

Show a grouped violation table:
```
DRY-RUN — violations detected (NOT blocking)

CRITICAL (x violations)
  IAM-001  payment-lambda-role   Wildcard action "*" grants unrestricted permissions
                                 Remediation: Replace "*" with specific actions

HIGH (x violations)
  NET-002  payment-database      RDS storage_encrypted is false
                                 Remediation: Set storage_encrypted: true

[DRY-RUN banner shown above]
Exit code: 0 — execution was NOT blocked
```

**Case C: Enforce mode with blocking violations (exit 1)**

Show violations grouped by severity as errors:
```
BLOCKED — 7 CRITICAL/HIGH violation(s)

CRITICAL
  IAM-001  payment-lambda-role   Wildcard action "*" grants unrestricted permissions
           Remediation: Replace "*" with specific actions (e.g., s3:PutObject)
  NET-001  payment-database      RDS instance is publicly accessible
           Remediation: Set publicly_accessible: false
...

Exit code: 1 — spec was blocked. Fix violations and re-run.
```

### Step 5 — Offer next actions

After displaying results, offer:
- If violations found: "Run `/suggest-permissions` to auto-generate least-privilege alternatives"
- If violations found: "Run `/validate-spec --dry-run` to observe without blocking"
- If compliant: "Generate a Security Addendum for this spec?"
  - If yes: call `POST http://localhost:3000` via MCP with the `generate_security_addendum` tool,
    passing the spec name and the violations list (empty if compliant)

## Notes

- Always show the spec filename and validation mode in the output so it's unambiguous.
- The hook prints violations to stdout; exit code is the decision signal.
- MEDIUM and LOW violations are informational — they appear in the output but do NOT cause exit 1.
