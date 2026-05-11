---
name: resilience-check
description: |
  Use this skill when the user says "test fail-closed", "resilience check", "what happens if the server goes down",
  "verify fail-closed behavior", "/resilience-check", or when demonstrating Zero Trust default-deny behavior.
  Stops the MCP server, asserts the hook fails closed, then restarts and verifies recovery.
  This is a destructive test — always confirm before proceeding.
---

# resilience-check — Verify Fail-Closed Security Behavior

Prove that the system is secure by default even when the MCP server is unavailable.

## Steps

### Step 1 — Confirm before proceeding

Ask the user:
```
This test will stop the MCP server temporarily to verify fail-closed behavior.
The server will be restarted automatically at the end.
Continue? (y/N)
```

If the user says no (or anything other than y/yes), stop here.

### Step 2 — Verify the server is currently running

```bash
python3 -c "
import urllib.request, sys
try:
    urllib.request.urlopen('http://localhost:3000/health', timeout=3)
    print('Server is healthy — proceeding to stop it.')
except Exception:
    print('Server is already not running.', file=sys.stderr)
    sys.exit(1)
"
```

If the server is already not running, report this and skip to Step 5 (run the assertions directly).

### Step 3 — Stop the MCP server

```bash
# Try PID file first
if [ -f .kiro/.demo-pid ]; then
  PID=$(cat .kiro/.demo-pid)
  kill "$PID" 2>/dev/null && echo "Stopped PID $PID"
fi

# Fallback: kill by port
REMAINING=$(lsof -ti:3000 2>/dev/null)
if [ -n "$REMAINING" ]; then
  echo "$REMAINING" | xargs kill 2>/dev/null
fi

# Verify port is now free
sleep 0.5
lsof -ti:3000 && echo "WARNING: Port 3000 still in use" || echo "Port 3000 is free"
```

### Step 4 — Run the assertions

**Assertion A — Enforce mode fails closed (exit 1):**
```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
ASSERT_A_EXIT=$?
```
Expected: exit code = 1 (server unreachable → fails closed)

**Assertion B — Dry-run mode does NOT fail closed (exit 0):**
```bash
POLICY_ENFORCER_DRY_RUN=true node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
ASSERT_B_EXIT=$?
```
Expected: exit code = 0 (dry-run exempts server failures)

### Step 5 — Restart the server

```bash
node mcp-server/dist/index.js >> /tmp/mcp-server.log 2>&1 &
echo $! > .kiro/.demo-pid

python3 -c "
import urllib.request, time, sys
for _ in range(20):
    try:
        urllib.request.urlopen('http://localhost:3000/health', timeout=2)
        print('Server restarted successfully')
        sys.exit(0)
    except Exception:
        time.sleep(0.5)
print('ERROR: Server did not restart', file=sys.stderr)
sys.exit(1)
"
```

**Assertion C — Enforce mode works again after restart (exit 0 on secure spec):**
```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/secure-example.yaml
ASSERT_C_EXIT=$?
```
Expected: exit code = 0 (server back, secure spec passes)

### Step 6 — Print results table

```
Resilience Check Results
════════════════════════════════════════════════════════════
Assertion A  enforce mode, server DOWN   → exit 1   PASS ✓
             (expected: 1, got: <actual>)
Assertion B  dry-run mode, server DOWN   → exit 0   PASS ✓
             (expected: 0, got: <actual>)
Assertion C  enforce mode, server UP     → exit 0   PASS ✓
             (expected: 0, got: <actual>)
════════════════════════════════════════════════════════════
Result: ALL ASSERTIONS PASSED — fail-closed behavior confirmed.
```

If any assertion fails, show:
```
FAIL ✗  Assertion A: expected exit 1, got 0
        This means the system did NOT fail closed when the server was unreachable.
        Check policy-enforcer.js lines 95–113 (error handling branch).
```

## Notes

- The key message for the audience: "Zero Trust means secure by default — even infrastructure failures
  cannot create an opening. The system denies by default, not permits by default."
- Assertion A is the critical one: it proves fail-closed. Assertions B and C verify the system
  recovers correctly and that dry-run mode still permits unblocked workflows.
- If the server binary doesn't exist (not built), step 5 will fail. Tell the user to run `/demo-setup`.
- Total expected duration: ~5–10 seconds.
