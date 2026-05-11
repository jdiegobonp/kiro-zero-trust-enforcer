# Setup Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 18.0 | [nodejs.org](https://nodejs.org) |
| npm | >= 9.0 | bundled with Node.js |
| Terraform | >= 1.5.0 | [tfenv](https://github.com/tfutils/tfenv) recommended |
| OPA | >= 0.60 | `brew install opa` (optional — for local policy testing) |
| Kiro IDE | latest | [kiro.dev](https://kiro.dev) |
| AWS CLI | >= 2.0 | [aws.amazon.com/cli](https://aws.amazon.com/cli) |

## Local Setup

### 1. Clone and enter the project

```bash
git clone <your-repo-url>
cd kiro-zero-trust-enforcer
```

### 2. Build the MCP server

```bash
cd mcp-server
npm install
npm run build
cd ..
```

### 3. Install hook dependencies

```bash
cd .kiro/hooks
npm install
cd ../..
```

### 4. Start the MCP server

```bash
cd mcp-server
npm start
```

You should see:
```
Zero-trust MCP server running on port 3000
```

### 5. Verify the server is running

```bash
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","tools":["validate_iam_policy","check_network_posture",...]}
```

### 6. Test the policy enforcer

From the project root (with server running):

```bash
# Enforce mode — should detect violations and exit 1
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
echo "Exit code: $?"  # → 1

# Dry-run mode — should log violations but exit 0
POLICY_ENFORCER_DRY_RUN=true node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
echo "Exit code: $?"  # → 0

# Secure spec — should pass in both modes
node .kiro/hooks/policy-enforcer.js .kiro/specs/secure-example.yaml
echo "Exit code: $?"  # → 0
```

### 7. Run the TypeScript tests

```bash
cd mcp-server
npm test
```

### 8. Open in Kiro IDE

1. Open the project root in Kiro
2. Kiro will detect `.kiro/` directory and load hook configuration
3. Open `.kiro/specs/insecure-example.yaml`
4. Ask Kiro: "Generate Terraform infrastructure for this spec"
5. The `policy-enforcer.js` hook fires automatically, showing violations before codegen proceeds

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POLICY_ENFORCER_DRY_RUN` | `false` | Set to `true` to log violations without blocking |
| `MCP_SERVER_URL` | `http://localhost:3000` | Override MCP server URL |
| `PORT` | `3000` | MCP server listening port |

## AWS Setup for CI/CD (Optional)

The GitHub Actions workflows use OIDC for credential-free deployments — no access keys are ever stored in GitHub secrets.

### Create the OIDC provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### Create the deployment role

Create a role with `AssumeRoleWithWebIdentity` trust policy scoped to your repository:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::REPLACE_WITH_YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/kiro-zero-trust-enforcer:ref:refs/heads/main"
      }
    }
  }]
}
```

### Set GitHub repository variables

In your repo → Settings → Variables:
- `AWS_DEPLOY_ROLE_ARN` → the ARN of your deployment role

## Local OPA Testing (Optional)

```bash
# Install OPA
brew install opa

# Test IAM policy on insecure spec (expect violations)
opa eval \
  --data policies/opa/iam_least_privilege.rego \
  --input .kiro/specs/insecure-example.yaml \
  "data.iam_least_privilege.deny"

# Test on secure spec (expect empty result)
opa eval \
  --data policies/opa/iam_least_privilege.rego \
  --input .kiro/specs/secure-example.yaml \
  "data.iam_least_privilege.deny"

# Run OPA unit tests
opa test policies/opa/ -v
```

## Development Mode

For active development with auto-reload:

```bash
cd mcp-server
npm run dev   # starts nodemon with ts-node
```

Watch mode for tests:

```bash
cd mcp-server
npm run test:watch
```
