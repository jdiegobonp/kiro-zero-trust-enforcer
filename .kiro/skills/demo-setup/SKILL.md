---
name: demo-setup
description: |
  Use this skill when the user says "set up the demo", "start the MCP server", "prepare the environment",
  "demo-setup", or "/demo-setup". Builds the MCP server, starts it in the background, waits for it to
  become healthy, and installs the hook dependencies. Run this before any other zero-trust skill.
---

# demo-setup — Prepare the Zero Trust Enforcer Environment

Set up the demo environment by building and starting the MCP server, then installing hook dependencies.

## Steps

### Step 1 — Build the MCP server

Run from the project root:

```bash
cd mcp-server && npm install && npm run build
```

Wait for the command to complete. If it exits non-zero:
- Show the full error output
- If it's a TypeScript error, suggest `npm install` may be needed
- Stop here and report the failure clearly

### Step 2 — Start the server in the background

```bash
node mcp-server/dist/index.js >> /tmp/mcp-server.log 2>&1 &
echo $! > .kiro/.demo-pid
```

This writes the PID to `.kiro/.demo-pid` so `resilience-check` can stop and restart it later.

### Step 3 — Wait for the server to be healthy

Poll the health endpoint using Python (not curl) every 500ms for up to 30 seconds:

```bash
python3 -c "
import urllib.request, json, time, sys

for attempt in range(60):
    try:
        with urllib.request.urlopen('http://localhost:3000/health', timeout=2) as r:
            data = json.loads(r.read())
            if data.get('status') == 'ok':
                print('healthy:', json.dumps(data))
                sys.exit(0)
    except Exception:
        pass
    time.sleep(0.5)

print('ERROR: Server did not become healthy after 30s', file=sys.stderr)
sys.exit(1)
"
```

If this exits 1:
- Show contents of `/tmp/mcp-server.log` to surface the startup error
- Stop and report failure

### Step 4 — Install hook dependencies

```bash
cd .kiro/hooks && npm install
```

### Step 5 — Report success

Print a summary:
```
MCP server ready
  URL:   http://localhost:3000
  PID:   <pid from .kiro/.demo-pid>
  Tools: validate_iam_policy, check_network_posture, calculate_blast_radius, suggest_least_privilege
  Hook:  .kiro/hooks/policy-enforcer.js (ready)

Run /validate-spec to test a spec, or /run-demo for the full walkthrough.
```

## Notes

- If the server is already running (port 3000 in use), check if it's healthy first. If healthy, skip steps 1–3 and report "Server already running".
- The log file `/tmp/mcp-server.log` accumulates output from the background process. Show it on failure.
- `.kiro/.demo-pid` should be in `.gitignore` — check and suggest adding it if missing.
