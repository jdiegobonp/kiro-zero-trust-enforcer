# Demo Guide — kiro-zero-trust-enforcer

> Zero Trust from the first keystroke — not the first alert.

## Setup rápido

```bash
# Terminal 1 — MCP Server (dejar corriendo)
cd mcp-server && npm install && npm run build && npm start

# Verificar que el servidor está listo
curl -s http://localhost:3000/health
# → {"status":"ok","tools":["validate_iam_policy","check_network_posture",...]}

# Terminal 2 — raíz del proyecto
cd /ruta/a/kiro-zero-trust-enforcer
cd .kiro/hooks && npm install && cd ../..
```

---

## Escenario 1 — El bloqueo (modo enforce)

Simula a un dev que intenta generar infra a partir de un spec inseguro.

```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```

**Qué esperar:**
```
[policy-enforcer] Found 10 violation(s):

🚨 [CRITICAL] IAM-001 — payment-lambda-role
     Wildcard action "*" grants unrestricted permissions

🚨 [CRITICAL] NET-001 — payment-database
     RDS instance is publicly accessible — violates Zero Trust

🚨 [CRITICAL] NET-004 — payment-data-bucket
     S3 bucket has public ACL "public-read"
...
[policy-enforcer] BLOCKED: 7 CRITICAL/HIGH violation(s) must be resolved.
```

```bash
echo $?   # → 1  (Kiro bloquea la generación de código)
```

**Punto clave:** La validación corre en milisegundos, antes de que se genere una sola línea de Terraform.

---

## Escenario 2 — Modo dry-run (onboarding gradual)

El equipo aún no está listo para bloqueos. Se activa el modo observación.

```bash
POLICY_ENFORCER_DRY_RUN=true \
  node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```

**Qué esperar:**
```
[policy-enforcer] DRY-RUN mode enabled — violations will be logged but will NOT block execution.
[policy-enforcer] Found 10 violation(s):

🚨 [CRITICAL] IAM-001 — payment-lambda-role ...
⚠️  [HIGH]     NET-002 — payment-database ...
...

╔══════════════════════════════════════════════════════════════╗
║  DRY-RUN MODE ACTIVE — NOT BLOCKING                         ║
║  7 CRITICAL/HIGH violation(s)                               ║
║  Set POLICY_ENFORCER_DRY_RUN=false to enforce in production ║
╚══════════════════════════════════════════════════════════════╝
```

```bash
echo $?   # → 0  (el dev puede continuar, pero las violaciones quedan registradas)
```

**Punto clave:** El logging estructurado llega al MCP Server y puede consumirse con CloudWatch Logs o Datadog sin cambiar nada.

---

## Escenario 3 — Spec seguro (camino feliz)

El mismo flujo, pero con el spec corregido.

```bash
node .kiro/hooks/policy-enforcer.js .kiro/specs/secure-example.yaml
```

**Qué esperar:**
```
[policy-enforcer] Validating spec: secure-example.yaml
[policy-enforcer] ✓ All checks passed. Spec is zero-trust compliant.
```

```bash
echo $?   # → 0
```

---

## Escenario 4 — Blast radius: ¿cuánto daño puede hacer este rol?

Muestra el impacto real de un wildcard IAM en tiempo real.

```bash
curl -s -X POST http://localhost:3000/tools/calculate_blast_radius \
  -H "Content-Type: application/json" \
  -d '{
    "roleName": "payment-lambda",
    "actions": ["*"],
    "resources": ["*"]
  }' | python3 -m json.tool
```

**Qué esperar:**
```json
{
  "roleName": "payment-lambda",
  "estimatedBlastRadius": "CRITICAL",
  "affectedServices": [
    "can_create_admin_users",
    "can_exfiltrate_all_data",
    "can_disable_audit_logging",
    "can_modify_network_controls",
    "can_steal_all_secrets",
    "can_compromise_entire_org",
    "can_decrypt_all_data"
  ],
  "maxPrivilegeScore": 360,
  "recommendations": [
    "Split into purpose-scoped roles: one per Lambda function or service boundary",
    "Start with AWS managed policies (e.g., AmazonS3ReadOnlyAccess) then prune",
    "Use AWS IAM Access Analyzer to generate policies from CloudTrail activity"
  ]
}
```

**Punto clave para la audiencia:** "Esta Lambda procesa pagos. Solo necesita escribir en S3 y leer un secret. No 847 servicios de AWS."

---

## Escenario 5 — Least privilege: ¿qué permisos mínimos necesita?

```bash
curl -s -X POST http://localhost:3000/tools/suggest_least_privilege \
  -H "Content-Type: application/json" \
  -d '{
    "currentActions": ["*"],
    "useCase": "lambda-s3-writer"
  }' | python3 -m json.tool
```

**Qué esperar:**
```json
{
  "useCase": "lambda-s3-writer",
  "suggestedActions": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
  "suggestedResources": [
    "arn:aws:s3:::REPLACE_WITH_BUCKET_NAME",
    "arn:aws:s3:::REPLACE_WITH_BUCKET_NAME/*"
  ],
  "rationale": "Reduced from 1 actions to 3 (0% reduction). Preset \"lambda-s3-writer\" provides the minimum permissions needed..."
}
```

Presets disponibles: `lambda-s3-writer`, `lambda-rds-reader`, `lambda-secrets`, `api-gateway-invoker`, `cloudwatch-logger`

---

## Escenario 6 — Fail-closed: el servidor cae

Demuestra que el sistema es seguro por defecto, incluso ante fallos.

```bash
# Detener el servidor MCP
kill $(lsof -ti:3000)

# Intentar validar (modo enforce)
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```

**Qué esperar:**
```
[policy-enforcer] FATAL: MCP server unreachable — failing closed (Zero Trust default).
  Error: fetch failed
  Start the server: cd mcp-server && npm start
```

```bash
echo $?   # → 1  (bloquea aunque el servidor esté caído)
```

```bash
# En dry-run, el fallo del servidor no bloquea
POLICY_ENFORCER_DRY_RUN=true \
  node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
echo $?   # → 0
```

---

## Escenario 7 — Logging estructurado (para el equipo de operaciones)

Cada llamada al servidor emite JSON a stdout, listo para cualquier log aggregator.

```bash
# Reiniciar el servidor y observar los logs
cd mcp-server && node dist/index.js 2>/dev/null &

# Desde otra terminal, ejecutar una validación
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
```

**Logs que emite el servidor (stdout):**
```json
{"timestamp":"2026-05-09T22:00:00Z","tool":"validate_iam_policy","duration_ms":3,"violation_count":2,"severity":"CRITICAL"}
{"timestamp":"2026-05-09T22:00:00Z","tool":"check_network_posture","duration_ms":2,"violation_count":5,"severity":"CRITICAL"}
```

Estos logs son compatibles con:
- `aws logs filter-log-events --filter-pattern '{$.severity = "CRITICAL"}'`
- Datadog: `source:mcp-server @severity:CRITICAL`
- Cualquier herramienta que consuma JSON por línea

---

## GitHub Actions

Los workflows replican la misma lógica en CI:

| Workflow | Trigger | Qué hace |
|---|---|---|
| `spec-validation.yml` | Push a `.kiro/specs/` | Corre los 3 escenarios del hook + 35 tests |
| `plan-security.yml` | Push a `terraform/` | OPA check + `terraform validate` en los 3 módulos |
| `deploy-prod.yml` | Push a `main` | Gate: ambos verdes + aprobación manual + OIDC deploy |

```bash
# Ver el resultado de los tests localmente
cd mcp-server && npm test
```

---

## Resumen de exit codes

| Situación | Exit Code |
|---|---|
| Sin violaciones | `0` |
| Violaciones CRITICAL/HIGH (enforce) | `1` |
| Cualquier violación (dry-run) | `0` |
| Servidor MCP caído (enforce) | `1` |
| Servidor MCP caído (dry-run) | `0` |

---

## Variables de entorno

| Variable | Default | Efecto |
|---|---|---|
| `POLICY_ENFORCER_DRY_RUN` | `false` | `true` = registra pero nunca bloquea |
| `MCP_SERVER_URL` | `http://localhost:3000` | Apuntar a otro servidor MCP |
| `PORT` | `3000` | Puerto del servidor MCP |
