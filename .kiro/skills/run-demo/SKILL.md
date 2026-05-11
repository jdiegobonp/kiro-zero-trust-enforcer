---
name: run-demo
description: |
  Use this skill when the user says "run the full demo", "start the demo", "run all scenarios",
  "/run-demo", or "walk me through the zero trust demo". Orchestrates all 7 demo scenarios
  from DEMO.md in sequence with interactive checkpoints between each one, then prints a final
  summary with PASS/FAIL status and elapsed time for every scenario.
---

# run-demo — Full Zero Trust Enforcer Demo (7 Scenarios)

Run all 7 demo scenarios in sequence with audience checkpoints between each one.

## Before Starting

Record the start time. Keep a results table that you'll fill in as each scenario completes:
```
Scenario 1 (Enforce mode)         → [pending]
Scenario 2 (Dry-run mode)         → [pending]
Scenario 3 (Secure spec)          → [pending]
Scenario 4 (Blast radius)         → [pending]
Scenario 5 (Least privilege)      → [pending]
Scenario 6 (Fail-closed)          → [pending]
Scenario 7 (Structured logging)   → [pending]
```

## Steps

---

### Setup — Start the environment

Run the `demo-setup` skill steps:
1. Build MCP server (`cd mcp-server && npm install && npm run build`)
2. Start server in background, write PID to `.kiro/.demo-pid`
3. Wait for health check
4. Install hook deps (`cd .kiro/hooks && npm install`)

If setup fails, stop here with a clear error. Do not continue.

Print:
```
Zero Trust Enforcer — Live Demo
Started: <ISO timestamp>
MCP Server: http://localhost:3000
════════════════════════════════════════════
```

---

### [CHECKPOINT 1] Escenario 1 — Enforce Mode: el bloqueo

Tell the user:
```
Escenario 1: Enforce mode — a developer tries to generate infrastructure from an insecure spec.
Press Enter when ready...
```

Wait for the user to press Enter (i.e., send any message to continue).

Run:
```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```

Capture and display the full output verbatim, then show:
```
Exit code: 1 — Kiro BLOCKED code generation.

Key point: Validation runs in milliseconds, before a single line of Terraform is generated.
```

Record Scenario 1 as PASS if exit code = 1, FAIL otherwise.

---

### [CHECKPOINT 2] Escenario 2 — Dry-Run Mode: onboarding gradual

```
Escenario 2: Dry-run mode — the team isn't ready for hard blocks yet.
Press Enter when ready...
```

Run:
```bash
POLICY_ENFORCER_DRY_RUN=true node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```

Display full output verbatim, then show:
```
Exit code: 0 — developer can continue, but violations are logged.

Key point: Structured JSON logs go to the MCP server stdout, ready for CloudWatch or Datadog
           without any configuration changes.
```

Record Scenario 2 as PASS if exit code = 0, FAIL otherwise.

---

### [CHECKPOINT 3] Escenario 3 — Secure Spec: el camino feliz

```
Escenario 3: The same pipeline with the corrected spec — the happy path.
Press Enter when ready...
```

Run:
```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/secure-example.yaml
```

Display output, then show:
```
Exit code: 0 — spec is zero-trust compliant.

Key point: The dev experience is identical — the difference is in the spec, not the tooling.
```

Record Scenario 3 as PASS if exit code = 0, FAIL otherwise.

---

### [CHECKPOINT 4] Escenario 4 — Blast Radius: ¿cuánto daño puede hacer este rol?

```
Escenario 4: Real-time blast radius analysis — how much damage can a compromised role do?
Press Enter when ready...
```

Parse `.kiro/specs/insecure-example.yaml`, extract the `payment-lambda-role` IAM role, then call:

```bash
python3 -c "
import urllib.request, json

payload = {
    'roleName': 'payment-lambda-role',
    'actions': ['*'],
    'resources': ['*']
}
req = urllib.request.Request(
    'http://localhost:3000/tools/calculate_blast_radius',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req) as r:
    print(json.dumps(json.loads(r.read()), indent=2))
"
```

Display the JSON response, then add:
```
Key point: This Lambda processes payments. It only needs to write to S3 and read one secret.
           Not 847 AWS services.
```

Record Scenario 4 as PASS if the response contains `"estimatedBlastRadius": "CRITICAL"`, FAIL otherwise.

---

### [CHECKPOINT 5] Escenario 5 — Least Privilege: ¿qué permisos mínimos necesita?

```
Escenario 5: What's the minimum permission set for this Lambda?
Press Enter when ready...
```

Call:
```bash
python3 -c "
import urllib.request, json

payload = {
    'currentActions': ['*'],
    'useCase': 'lambda-s3-writer'
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

Display the JSON, then add:
```
Key point: From "*" (1 wildcard = 847 services) to 3 specific actions.
           Available presets: lambda-s3-writer, lambda-rds-reader, lambda-secrets,
           api-gateway-invoker, cloudwatch-logger.

Note: The spec was NOT modified. Run /suggest-permissions --role payment-lambda-role to apply.
```

Record Scenario 5 as PASS if the response contains `suggestedActions`, FAIL otherwise.

---

### [CHECKPOINT 6] Escenario 6 — Fail-Closed: el servidor cae

```
Escenario 6: What happens when the MCP server goes down?
Press Enter when ready...
```

Execute the resilience check (stopping and restarting the server):

1. Stop the server (kill by PID or port)
2. Run enforce mode on insecure spec → assert exit 1
3. Run dry-run mode on insecure spec → assert exit 0
4. Restart server and wait for health
5. Verify secure spec still passes (exit 0)

Show:
```
Assertion A (enforce, server DOWN)  → exit 1   PASS ✓
Assertion B (dry-run, server DOWN)  → exit 0   PASS ✓
Assertion C (enforce, server UP)    → exit 0   PASS ✓

Key point: Zero Trust means secure by default. Infrastructure failures cannot create an opening.
```

Record Scenario 6 as PASS only if all 3 assertions pass.

---

### [CHECKPOINT 7] Escenario 7 — Structured Logging: para el equipo de operaciones

```
Escenario 7: Every MCP tool call emits structured JSON — ready for any log aggregator.
Press Enter when ready...
```

Run a validation to generate log lines, then show the last 10 lines from the server log:
```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml 2>/dev/null
tail -10 /tmp/mcp-server.log
```

Display the JSON log lines, then show:
```
These logs are compatible with:
  • aws logs filter-log-events --filter-pattern '{$.severity = "CRITICAL"}'
  • Datadog: source:mcp-server @severity:CRITICAL
  • Any tool that consumes newline-delimited JSON (ndjson)

Key point: Zero operational overhead — plug into your existing observability stack.
```

Record Scenario 7 as PASS if JSON log lines appear in the output.

---

### Final Summary

Calculate total elapsed time. Print:

```
Zero Trust Enforcer — Demo Complete
════════════════════════════════════════════════════════════════
Scenario 1  Enforce mode (insecure spec → exit 1)     PASS ✓
Scenario 2  Dry-run mode (insecure spec → exit 0)     PASS ✓
Scenario 3  Secure spec (exit 0)                      PASS ✓
Scenario 4  Blast radius (CRITICAL, score 360)        PASS ✓
Scenario 5  Least privilege (wildcard → 3 actions)    PASS ✓
Scenario 6  Fail-closed (3/3 assertions passed)       PASS ✓
Scenario 7  Structured logging (JSON to stdout)       PASS ✓
════════════════════════════════════════════════════════════════
Result: 7/7 scenarios passed
Elapsed: <total time>

Next steps:
  /suggest-permissions --role payment-lambda-role   apply least privilege to the insecure spec
  /validate-spec .kiro/specs/secure-example.yaml    re-validate after edits
```

If any scenario FAILED, list them with the actual vs expected result and suggest the fix.

## Notes

- Total expected duration (excluding audience Q&A): 2–4 minutes.
- Each checkpoint pauses naturally — the Kiro agent waits for the user to respond before running
  the next scenario. There is no need for any special wait mechanism.
- Scenario 6 (resilience-check) is the only destructive step. The server is always restarted
  before Scenario 7 runs.
- Do NOT apply spec patches during run-demo. Scenario 5 is informational only.
