# De Spec a Producción Segura
## Automatiza Zero Trust en AWS con Kiro, MCP y Mínimo Privilegio

> Presentación de 45 minutos | AWS Community / Tech Talk
> Repositorio: `kiro-zero-trust-enforcer`

---

## Estructura de Tiempo

| Bloque | Tema | Tiempo |
|--------|------|--------|
| 0 | Intro + problema | 5 min |
| 1 | MCP: la pieza clave | 8 min |
| 2 | IAM de mínimo privilegio desde specs | 10 min |
| 3 | Kiro en el pipeline de CI/CD | 10 min |
| 4 | Zero Trust-as-Code: el flujo completo | 8 min |
| 5 | Demo en vivo + cierre | 4 min |

---

---

# BLOQUE 0 — EL PROBLEMA
## ⏱ 5 minutos

---

## Slide 1 — Título

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│      DE SPEC A PRODUCCIÓN SEGURA                                │
│                                                                 │
│   Automatiza Zero Trust en AWS                                  │
│   con Kiro, MCP y Mínimo Privilegio                             │
│                                                                 │
│   ─────────────────────────────────────────────                 │
│                                                                 │
│   Juan Diego Bonilla                                            │
│   @jdiegobonp                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- Abrir con calma. No apresurar.
- "Hoy vamos a construir en vivo el sistema que hace imposible que una política IAM insegura llegue a producción."

---

## Slide 2 — El dato que duele

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                       93%                                       │
│                                                                 │
│   de las organizaciones tiene al menos                          │
│   UNA identidad sobreprivilegiada en producción                 │
│                                                                 │
│   ─────────────────────────────────────────────                 │
│                                                                 │
│   Fuente: CrowdStrike Global Threat Report 2024                 │
│                                                                 │
│   El problema no es ignorancia.                                 │
│   Es que la seguridad llega DESPUÉS del código.                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- Pausa dramática en "93%". Dejar que el número aterrice.
- "¿Por qué? No porque los equipos sean negligentes. Sino porque el momento en que revisamos seguridad — el PR review, el security scan, la auditoría trimestral — ocurre DESPUÉS de que el código ya existe."
- "Hoy vamos a invertir ese orden."

---

## Slide 3 — El flujo actual (el problema)

```
┌─────────────────────────────────────────────────────────────────┐
│  FLUJO TÍPICO HOY                                               │
│                                                                 │
│  Arquitecto        Dev              Ops          Security       │
│     │               │                │               │         │
│     │ diseña spec   │                │               │         │
│     │ en Confluence │                │               │         │
│     │──────────────►│                │               │         │
│     │               │ escribe TF     │               │         │
│     │               │ (2 días)       │               │         │
│     │               │───────────────►│               │         │
│     │               │               │ PR review      │         │
│     │               │               │───────────────►│         │
│     │               │               │               │ ← AQUÍ  │
│     │               │               │               │   llega  │
│     │               │               │               │   la     │
│     │               │               │               │ seguridad│
│                                                                 │
│  El código inseguro viajó 3 pasos antes de que alguien         │
│  lo mirara con ojos de seguridad.                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- "En este flujo, `Action: *` puede vivir cómodamente durante horas o días."
- "Y cuando el security reviewer lo encuentra, el dev ya movió a otra tarea."

---

## Slide 4 — La propuesta: mover la seguridad al inicio

```
┌─────────────────────────────────────────────────────────────────┐
│  FLUJO PROPUESTO                                                │
│                                                                 │
│  Escribes spec YAML                                             │
│       │                                                         │
│       ▼ ← SEGURIDAD AQUÍ (antes de generar código)             │
│  Kiro hook valida contra MCP server                             │
│       │                                                         │
│       ├── BLOQUEADO si hay violaciones CRITICAL/HIGH            │
│       └── CONTINÚA si está limpio                               │
│                                                                 │
│       ▼                                                         │
│  Kiro genera Terraform                                          │
│       │                                                         │
│       ▼ ← SEGURIDAD DE NUEVO (en CI)                           │
│  GitHub Actions: OPA + MCP tests                                │
│       │                                                         │
│       ▼ ← SEGURIDAD POR TERCERA VEZ (en deploy)                │
│  Gate de producción: ambos workflows verdes + aprobación manual │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- "Tres capas. Ninguna capa confía en las otras. Eso es Zero Trust aplicado al pipeline."
- "La misma lógica de políticas corre en las tres. No hay forma de bypass."

---

---

# BLOQUE 1 — MCP: LA PIEZA CLAVE
## ⏱ 8 minutos

---

## Slide 5 — ¿Qué es MCP? (la versión sin marketing)

```
┌─────────────────────────────────────────────────────────────────┐
│  Model Context Protocol                                         │
│                                                                 │
│  Un protocolo estándar para que modelos de IA                   │
│  invoquen herramientas externas de forma estructurada.          │
│                                                                 │
│  ─────────────────────────────────────────────────             │
│                                                                 │
│  SIN MCP:                                                       │
│  Claude ────► "Creo que la política debería ser..."            │
│               (basado en patrones de entrenamiento)             │
│                                                                 │
│  CON MCP:                                                       │
│  Claude ────► llama validate_iam_policy(tu_spec)               │
│               ◄──── { violations: [...], valid: false }         │
│               "Tu spec tiene IAM-001: wildcard action"          │
│               (basado en el estado REAL de tu infra)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- "MCP es el puente entre el razonamiento del modelo y el estado real de tu infraestructura."
- "Sin MCP, el AI solo puede darte consejos genéricos. Con MCP, puede analizar TU spec, TUS recursos, TUS políticas."

---

## Slide 6 — Las dos superficies del servidor MCP

```
┌─────────────────────────────────────────────────────────────────┐
│  mcp-server/ (TypeScript + Express, puerto 3000)                │
│                                                                 │
│  Superficie 1: REST API                                         │
│  ┌──────────────────────────────────────────────┐              │
│  │ POST /tools/validate_iam_policy              │              │
│  │ POST /tools/check_network_posture            │  ◄── Hook    │
│  │ POST /tools/calculate_blast_radius           │  ◄── curl    │
│  │ POST /tools/suggest_least_privilege          │              │
│  │ GET  /health                                 │              │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
│  Superficie 2: MCP Streamable HTTP                              │
│  ┌──────────────────────────────────────────────┐              │
│  │ POST /mcp  (Initialize + tool calls)         │  ◄── Kiro   │
│  │ GET  /mcp  (SSE stream)                      │  ◄── Claude  │
│  │ DELETE /mcp (session cleanup)                │      Desktop │
│  └──────────────────────────────────────────────┘              │
│                                                                 │
│  Las mismas 4 herramientas. Dos formas de consumirlas.          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- "Esto es lo elegante: escribimos la lógica UNA VEZ en TypeScript."
- "El mismo `validateIAMPolicy()` lo llama el hook de Kiro via REST, y lo llama Claude Desktop via MCP."
- "No hay duplicación de lógica. No hay divergencia."

---

## Slide 7 — Las 4 herramientas MCP

```typescript
// mcp-server/src/index.ts — las 4 tools expuestas

server.tool('validate_iam_policy',
  'Valida políticas IAM en un spec de arquitectura',
  ValidateIAMInputSchema,
  async (args) => validateIAMPolicy(args.spec)
);

server.tool('check_network_posture',
  'Valida postura de red para Zero Trust',
  CheckNetworkInputSchema,
  async (args) => checkNetworkPosture(args.spec)
);

server.tool('calculate_blast_radius',
  'Calcula el blast radius si un rol IAM es comprometido',
  BlastRadiusInputSchema,
  async (args) => calculateBlastRadius(args.roleName, args.actions, args.resources)
);

server.tool('suggest_least_privilege',
  'Sugiere permisos mínimos para un caso de uso',
  SuggestMinimalInputSchema,
  async (args) => suggestLeastPrivilege(args.currentActions, args.useCase)
);
```

**Notas del presentador:**
- "Cada tool es una función TypeScript pura: recibe un spec, retorna un resultado."
- "El servidor las registra en ambas superficies automáticamente."
- "Cada llamada emite un JSON estructurado a stdout — compatible con CloudWatch Logs Insights, Datadog, cualquier log aggregator."

---

## Slide 8 — Por qué MCP es la pieza clave (no un HTTP genérico)

```
┌─────────────────────────────────────────────────────────────────┐
│  ¿Por qué MCP y no solo llamar REST directo?                    │
│                                                                 │
│  1. CONTEXTO COMPARTIDO                                         │
│     Kiro conoce el estado de tu workspace, el spec abierto,    │
│     el historial de cambios. MCP transmite ese contexto         │
│     al servidor con cada llamada.                               │
│                                                                 │
│  2. UN SERVIDOR, TRES CONSUMIDORES                              │
│     ┌─────────────────────────────────────────────────┐        │
│     │ Kiro Hook  ──────►  /tools/* (REST)             │        │
│     │ Claude Desktop ──►  /mcp (Streamable HTTP)      │        │
│     │ curl / CI  ──────►  /tools/* (REST)             │        │
│     └─────────────────────────────────────────────────┘        │
│                                                                 │
│  3. SCHEMA VALIDATION AUTOMÁTICA                                │
│     El SDK de MCP valida los argumentos antes de invocar.       │
│     El servidor nunca recibe datos malformados.                  │
│                                                                 │
│  4. SESIONES STATEFUL                                           │
│     Claude Desktop mantiene sesión → el servidor puede          │
│     acumular contexto de la conversación completa.              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- "MCP no es solo 'REST con un nombre fancy'. Es un protocolo diseñado para que el modelo entienda las capacidades disponibles, no solo los endpoints."
- "Kiro ve las 4 tools como capacidades nativas, como si fueran parte del IDE."

---

---

# BLOQUE 2 — IAM DE MÍNIMO PRIVILEGIO DESDE SPECS
## ⏱ 10 minutos

---

## Slide 9 — El formato de spec: tu arquitectura como código declarativo

```yaml
# .kiro/specs/secure-payment-api.yaml

name: secure-payment-api
version: "1.0"
description: "API de pagos — cumple con políticas Zero Trust"

resources:
  - type: aws_iam_role
    id: payment-lambda-role
    config:
      role_name: payment-lambda-exec
      statements:
        - effect: Allow
          actions:
            - s3:GetObject
            - s3:PutObject
            - logs:CreateLogGroup
            - logs:CreateLogStream
            - logs:PutLogEvents
          resources:
            - "arn:aws:s3:::payment-data-bucket-123456789/*"
            - "arn:aws:logs:us-east-1:123456789:log-group:/aws/lambda/payment-*"
```

**Notas del presentador:**
- "El spec es YAML humano-legible. No es Terraform todavía."
- "Un arquitecto puede escribir esto sin saber HCL."
- "La idea: describir QUÉ necesita el sistema, no CÓMO implementarlo."
- "Kiro convierte este spec en Terraform. Pero primero lo valida."

---

## Slide 10 — El spec inseguro: lo que NUNCA debería llegar a Terraform

```yaml
# .kiro/specs/insecure-payment-api.yaml — intencional, para la demo

resources:
  - type: aws_iam_role
    id: payment-lambda-role
    config:
      statements:
        - effect: Allow
          actions:
            - "*"          # ← IAM-001: CRITICAL
          resources:
            - "*"          # ← IAM-002: CRITICAL

  - type: aws_db_instance
    id: payment-database
    config:
      publicly_accessible: true    # ← NET-001: CRITICAL
      storage_encrypted: false     # ← NET-002: HIGH
      backup_retention_period: 1   # ← NET-003: MEDIUM

  - type: aws_s3_bucket
    id: payment-data-bucket
    config:
      acl: public-read             # ← NET-004: CRITICAL

  - type: aws_security_group
    id: payment-sg
    config:
      ingress:
        - cidr: "0.0.0.0/0"
          port: 22                 # ← NET-005: CRITICAL
        - cidr: "0.0.0.0/0"
          port: 5432               # ← NET-005: CRITICAL
```

**Notas del presentador:**
- "Este es el spec que el hook bloqueará. 10 violaciones en 20 líneas."
- "¿Cuántos de ustedes han visto esto en producción? (pausa)"
- "El Action: * en un Lambda de pagos. En producción. Funcionando."

---

## Slide 11 — Las reglas IAM: lógica que corre en el servidor

```typescript
// mcp-server/src/tools/validate-iam.ts

export function validateIAMPolicy(spec: ArchSpec): ValidationResult {
  const violations: Violation[] = [];

  for (const resource of spec.resources) {
    if (resource.type !== 'aws_iam_role') continue;

    for (const stmt of getStatements(resource.config)) {
      if (stmt.effect === 'Deny') continue;

      const actions = toStringArray(stmt.actions);

      // IAM-001: wildcard action → CRITICAL
      for (const action of actions) {
        if (/^(\*|[a-zA-Z0-9-]+:\*)$/.test(action)) {
          violations.push({
            ruleId: 'IAM-001',
            severity: 'CRITICAL',
            resource: resource.id,
            message: `Wildcard action "${action}" — sin restricción de permisos`,
            remediation: 'Reemplaza con las acciones específicas que el servicio necesita',
          });
        }
      }

      // IAM-002: wildcard resource → CRITICAL
      // IAM-003: más de 15 acciones → HIGH
      // IAM-004: acciones admin sin MFA → CRITICAL
    }
  }

  return { valid: violations.length === 0, violations, checkedAt: new Date().toISOString() };
}
```

**Notas del presentador:**
- "Función pura. Entra un spec, sale un resultado. Sin efectos secundarios, sin estado."
- "Esto es clave para testabilidad: `npm test` corre 40+ casos en 200ms."
- "Cada regla tiene un ruleId, severidad, recurso afectado, mensaje, y remediación."

---

## Slide 12 — Las 5 reglas IAM + las 8 reglas de red

```
┌─────────────────────────────────────────────────────────────────┐
│  REGLAS IAM (validate_iam_policy)                               │
│                                                                 │
│  IAM-001  CRITICAL  Wildcard action (* o service:*)             │
│  IAM-002  CRITICAL  Wildcard resource (*)                       │
│  IAM-003  HIGH      Más de 15 acciones por statement            │
│  IAM-004  CRITICAL  Acciones admin sin condición MFA            │
│  IAM-005  MEDIUM    Nombre de rol > 64 caracteres               │
│                                                                 │
│  REGLAS DE RED (check_network_posture)                          │
│                                                                 │
│  NET-001  CRITICAL  RDS publicly_accessible = true             │
│  NET-002  HIGH      RDS sin encriptación de storage             │
│  NET-003  MEDIUM    RDS backup < 7 días                         │
│  NET-004  CRITICAL  S3 ACL public-read o public-read-write      │
│  NET-005  CRITICAL  SG expone puerto peligroso a 0.0.0.0/0     │
│           (22, 23, 3306, 5432, 1433, 6379, 27017...)           │
│  NET-006  HIGH      SG expone otro puerto a 0.0.0.0/0          │
│  NET-007  MEDIUM    Puerto 80/443 sin ALB en el spec            │
│  NET-008  MEDIUM    S3 sin VPC endpoint                         │
│                                                                 │
│  CRITICAL/HIGH → bloquea en enforce mode                        │
│  MEDIUM/LOW    → solo log                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Slide 13 — suggest_least_privilege: del wildcard al mínimo

```bash
# Desde Claude Desktop (via MCP) o curl:

curl -s -X POST http://localhost:3000/tools/suggest_least_privilege \
  -H "Content-Type: application/json" \
  -d '{
    "currentActions": ["*"],
    "useCase": "lambda-s3-writer"
  }'
```

```json
{
  "useCase": "lambda-s3-writer",
  "suggestedActions": [
    "s3:PutObject",
    "s3:GetObject",
    "s3:DeleteObject",
    "logs:CreateLogGroup",
    "logs:CreateLogStream",
    "logs:PutLogEvents"
  ],
  "suggestedResources": [
    "arn:aws:s3:::BUCKET_NAME/*",
    "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/lambda/*"
  ],
  "rationale": "Lambda que escribe a S3 solo necesita PutObject/GetObject/DeleteObject en el bucket específico. Los permisos de logs son necesarios para CloudWatch."
}
```

**Notas del presentador:**
- "Esto es lo que normalmente requeriría un senior de seguridad sentado contigo."
- "La herramienta tiene presets para los casos más comunes: lambda-s3-writer, lambda-rds-reader, lambda-secrets, api-gateway-invoker, cloudwatch-logger."
- "El output es copy-paste directo a tu spec."

---

## Slide 14 — calculate_blast_radius: entender el riesgo real

```bash
curl -s -X POST http://localhost:3000/tools/calculate_blast_radius \
  -H "Content-Type: application/json" \
  -d '{
    "roleName": "payment-lambda-execution-role",
    "actions": ["*"],
    "resources": ["*"]
  }'
```

```json
{
  "roleName": "payment-lambda-execution-role",
  "estimatedBlastRadius": "CRITICAL",
  "affectedServices": [
    "S3", "RDS", "EC2", "IAM", "Lambda",
    "CloudFormation", "SSM", "Secrets Manager",
    "... todos los servicios AWS"
  ],
  "maxPrivilegeScore": 100,
  "recommendations": [
    "Scope to specific S3 bucket ARN",
    "Replace wildcard with explicit action list",
    "Add resource-based conditions"
  ]
}
```

**Notas del presentador:**
- "Blast radius: si este rol es comprometido, ¿qué puede hacer el atacante?"
- "Un Lambda de pagos con Action: * tiene acceso a TODA la cuenta."
- "Esta visualización es lo que convence a los stakeholders. No el ruleId, el impacto."

---

---

# BLOQUE 3 — KIRO EN EL PIPELINE DE CI/CD
## ⏱ 10 minutos

---

## Slide 15 — El hook: primera línea de defensa

```
┌─────────────────────────────────────────────────────────────────┐
│  .kiro/hooks/policy-enforcer.js                                 │
│                                                                 │
│  Kiro llama al hook ANTES de generar Terraform.                 │
│                                                                 │
│  Flujo del hook:                                                │
│                                                                 │
│  1. Lee el spec YAML del path recibido como argumento           │
│  2. Llama validate_iam_policy y check_network_posture           │
│     EN PARALELO (Promise.all)                                   │
│  3. Consolida violaciones                                       │
│  4. Si hay CRITICAL/HIGH → exit(1) → Kiro no genera código     │
│  5. Si todo OK → exit(0) → Kiro procede con codegen            │
│                                                                 │
│  Diseño fail-closed:                                            │
│  Si el MCP server no responde → exit(1)                         │
│  (Zero Trust: deny by default)                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- "Fail-closed es una decisión de diseño deliberada."
- "Si el servidor de políticas está caído, lo seguro es BLOQUEAR, no permitir."
- "Un outage en la capa de seguridad debe surfacear inmediatamente, no silenciosamente dejar pasar specs inseguros."

---

## Slide 16 — El hook: código real

```javascript
// .kiro/hooks/policy-enforcer.js — llamadas en paralelo

const [iamRes, netRes] = await Promise.all([
  fetch(`${MCP_SERVER_URL}/tools/validate_iam_policy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
    signal: AbortSignal.timeout(10_000),  // timeout de 10s
  }),
  fetch(`${MCP_SERVER_URL}/tools/check_network_posture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
    signal: AbortSignal.timeout(10_000),
  }),
]);

// Fail-closed si el servidor no responde
if (err.message.includes('ECONNREFUSED')) {
  warn('FATAL: MCP server unreachable — failing closed (Zero Trust default).');
  process.exit(1);  // No process.exit(0)
}

// Bloquea solo CRITICAL y HIGH
const blocking = allViolations.filter(v =>
  v.severity === 'CRITICAL' || v.severity === 'HIGH'
);
if (blocking.length > 0) {
  process.exit(1);  // Kiro no genera código
}
```

---

## Slide 17 — Dry-run mode: onboarding gradual

```bash
# Modo enforce (producción): bloquea en CRITICAL/HIGH
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
# → exit 1, Kiro bloqueado

# Modo dry-run (onboarding): muestra violaciones pero no bloquea
POLICY_ENFORCER_DRY_RUN=true \
  node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml
# → exit 0, Kiro continúa + banner de advertencia
```

```
╔══════════════════════════════════════════════════════════════╗
║  DRY-RUN MODE ACTIVE — NOT BLOCKING                         ║
║  6 CRITICAL/HIGH violation(s)                               ║
║  Set POLICY_ENFORCER_DRY_RUN=false para enforce mode        ║
╚══════════════════════════════════════════════════════════════╝
```

**Notas del presentador:**
- "Dry-run existe para equipos que están adoptando este workflow."
- "Semana 1: dry-run, ven las violaciones pero pueden seguir."
- "Semana 2: enforce mode. El pipeline no perdona."
- "Es la diferencia entre un crash course y un apagón."

---

## Slide 18 — Los 3 workflows de GitHub Actions

```yaml
# .github/workflows/

spec-validation.yml   → push/PR que toca specs o mcp-server
  - npm run build + vitest
  - Inicia MCP server
  - Prueba enforce mode con spec inseguro → exit 1 esperado
  - Prueba dry-run mode con spec inseguro → exit 0 esperado
  - Prueba spec seguro → exit 0 esperado

plan-security.yml     → push/PR que toca terraform o policies/opa
  - opa check policies/opa/ --v1-compatible
  - opa eval con spec inseguro → valida que deny no está vacío
  - terraform validate en los 3 módulos

deploy-prod.yml       → manual workflow_dispatch (o push a main)
  - Gate: spec-validation VERDE en este commit
  - Gate: plan-security VERDE en este commit
  - Environment: production (requiere aprobación manual)
  - OIDC → AWS role (sin claves hardcodeadas)
  - terraform apply
```

**Notas del presentador:**
- "Son tres workflows que se conocen entre sí."
- "deploy-prod no corre hasta que los otros dos pasaron en el MISMO commit SHA."
- "No en el branch en general. En el SHA exacto que se está desplegando."

---

## Slide 19 — El gate de producción: verificación por SHA

```bash
# deploy-prod.yml — verifica que spec-validation pasó en ESTE commit

RESULT=$(gh run list \
  --workflow=spec-validation.yml \
  --branch "${{ github.ref_name }}" \
  --limit 10 \
  --json conclusion,headSha,status)

# Busca el run para el SHA exacto del commit actual
for run in $RESULT:
  if run.headSha == "${{ github.sha }}":
    if run.conclusion == "success":
      echo "PASS: spec-validation aprobó este commit"
      exit 0
    else:
      echo "BLOCKED: spec-validation falló en este commit"
      exit 1
```

**Notas del presentador:**
- "La verificación por SHA es crítica. No alcanza con que el workflow haya pasado 'en el branch'."
- "Si cambias una línea en el spec después del último run exitoso y pusheas directo, el gate te bloquea."
- "Tiene que haber un run exitoso para ESE commit. Punto."

---

## Slide 20 — OIDC: sin claves hardcodeadas

```
┌─────────────────────────────────────────────────────────────────┐
│  ANTES (el problema):                                           │
│                                                                 │
│  GitHub Secrets:                                                │
│    AWS_ACCESS_KEY_ID = AKIA...      ← credencial de larga vida  │
│    AWS_SECRET_ACCESS_KEY = ...      ← rotación manual           │
│                                                                 │
│  AHORA (Zero Trust):                                            │
│                                                                 │
│  GitHub Actions genera un token JWT firmado por GitHub          │
│       ↓                                                         │
│  AWS STS valida el token                                        │
│       ↓                                                         │
│  AWS devuelve credenciales temporales (15 min máximo)           │
│  scoped al role específico del repo                             │
│                                                                 │
│  permissions:                                                   │
│    id-token: write   ← único permiso necesario                  │
│    contents: read                                               │
│                                                                 │
│  role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}                │
│                                                                 │
│  Sin AWS_ACCESS_KEY_ID. Sin AWS_SECRET_ACCESS_KEY.              │
│  Sin rotación manual. Sin riesgo de leak.                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

---

# BLOQUE 4 — ZERO TRUST-AS-CODE: EL FLUJO COMPLETO
## ⏱ 8 minutos

---

## Slide 21 — OPA: la tercera capa (en CI)

```rego
# policies/opa/iam_least_privilege.rego

package iam_least_privilege
import rego.v1

# §IAM-001: Wildcard action — unrestricted permissions
deny contains msg if {
    resource := input.resources[_]
    resource.type in {"aws_iam_role", "aws_iam_policy"}
    stmt := resource.config.statements[_]
    stmt.effect == "Allow"
    action := stmt.actions[_]
    regex.match(`^(\*|[a-zA-Z0-9\-]+:\*)$`, action)
    msg := sprintf(
        "[§IAM-001] CRITICAL: '%v' usa wildcard IAM action '%v'",
        [resource.id, action]
    )
}
```

**Notas del presentador:**
- "OPA consume el mismo formato YAML que el MCP server."
- "Las mismas reglas, en dos lenguajes distintos, verificando el mismo spec."
- "¿Por qué duplicar? Porque OPA corre en CI sin levantar ningún servidor."
- "Y porque si los dos tienen la misma regla, cualquier violación es capturada en al menos una capa."

---

## Slide 22 — Los Terraform modules: seguridad como código real

```hcl
# terraform/modules/secure-rds/main.tf

resource "aws_db_instance" "this" {
  engine                 = var.engine
  instance_class         = var.instance_class
  
  # Zero Trust: cifrado obligatorio
  storage_encrypted      = true
  kms_key_id             = var.kms_key_id
  
  # Zero Trust: no acceso público
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  
  # Resiliencia
  backup_retention_period = var.backup_retention_period  # min 7
  multi_az               = var.multi_az
  deletion_protection    = true
  
  # Red: solo desde el SG del Lambda
  vpc_security_group_ids = [aws_security_group.rds.id]
}

resource "aws_security_group" "rds" {
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.lambda_sg_id]  # SG-to-SG, nunca CIDR
  }
  egress = []  # RDS no necesita salida
}
```

**Notas del presentador:**
- "Cada módulo implementa exactamente las políticas que OPA y el MCP server imponen."
- "Si el spec pasa la validación, el Terraform generado por Kiro usa estos módulos."
- "El ciclo se cierra: spec → validación → Terraform → deploy."

---

## Slide 23 — El flujo completo (arquitectura de defensa en profundidad)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Dev escribe spec YAML                                          │
│       │                                                         │
│       ▼                                                         │
│  [CAPA 1] Kiro Hook — ANTES de codegen                         │
│  policy-enforcer.js → MCP REST API                             │
│  Violaciones CRITICAL/HIGH → exit 1 → Kiro bloqueado           │
│       │ (solo pasa specs limpios)                               │
│       ▼                                                         │
│  Kiro genera Terraform usando módulos seguros                   │
│       │                                                         │
│       ▼                                                         │
│  git push                                                       │
│       │                                                         │
│       ▼                                                         │
│  [CAPA 2] GitHub Actions — spec-validation.yml                  │
│  Build + tests + MCP server + hook en ambos modos              │
│       │                                                         │
│  [CAPA 2] GitHub Actions — plan-security.yml                   │
│  OPA check + OPA eval + terraform validate                      │
│       │ (ambos deben ser verdes en el SHA exacto)               │
│       ▼                                                         │
│  [CAPA 3] deploy-prod.yml                                       │
│  Gate: verifica SHA de ambos workflows                          │
│  Aprobación manual del environment "production"                 │
│  OIDC → credenciales temporales AWS                             │
│  terraform apply                                                │
│       │                                                         │
│       ▼                                                         │
│  Infraestructura segura en AWS                                  │
│                                                                 │
│  Ninguna capa confía en las demás. Zero Trust.                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Slide 24 — ¿Por qué tres capas y no una?

```
┌─────────────────────────────────────────────────────────────────┐
│  BYPASS SCENARIOS y por qué fallan                              │
│                                                                 │
│  Intento 1: "Bypaseo el hook de Kiro"                          │
│  → La spec aún pasa por OPA en CI (plan-security.yml)          │
│  → La spec aún debe pasar spec-validation.yml                   │
│  → deploy-prod verifica ambos. Bloqueado.                       │
│                                                                 │
│  Intento 2: "Pusheo directo a main sin PR"                     │
│  → deploy-prod verifica que spec-validation pasó               │
│    en ESE commit SHA específico                                 │
│  → Si no hay run exitoso para ese SHA → Bloqueado.             │
│                                                                 │
│  Intento 3: "Apago el MCP server"                              │
│  → El hook falla closed (exit 1, no exit 0)                    │
│  → Kiro no genera código                                        │
│  → CI tampoco puede levantar el server → spec-validation falla  │
│                                                                 │
│  Intento 4: "Modifico los Rego files para quitar reglas"       │
│  → El MCP server TypeScript sigue corriendo la misma lógica    │
│  → spec-validation aún valida contra el MCP server             │
│  → Necesitas comprometer AMBOS sistemas                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Notas del presentador:**
- "Esto es defensa en profundidad, no seguridad por oscuridad."
- "No estamos escondiendo nada. Estamos haciendo que cualquier bypass requiera comprometer múltiples sistemas independientes."

---

## Slide 25 — Zero Trust-as-Code: los 4 principios aplicados

```
┌─────────────────────────────────────────────────────────────────┐
│  Zero Trust Principio → Implementación en este repo             │
│                                                                 │
│  "Never trust, always verify"                                   │
│  → Cada capa valida el spec independientemente                  │
│  → El MCP server no confía en que el hook ya validó             │
│  → OPA no confía en el MCP server                               │
│                                                                 │
│  "Assume breach"                                                │
│  → Fail-closed cuando el servidor de políticas no responde      │
│  → Blast radius calculado para cada rol IAM                     │
│                                                                 │
│  "Least privilege access"                                       │
│  → IAM-001/002: ningún wildcard pasa la validación              │
│  → suggest_least_privilege: del * a permisos explícitos         │
│  → OIDC: credenciales temporales, no permanentes                │
│                                                                 │
│  "Verify explicitly"                                            │
│  → Verificación por SHA exacto antes de deploy                  │
│  → Aprobación manual del environment production                 │
│  → Logs estructurados en cada invocación de tool               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

---

# BLOQUE 5 — DEMO EN VIVO + CIERRE
## ⏱ 4 minutos

---

## Slide 26 — Script de demo en vivo (2-3 minutos)

```bash
# Terminal 1: levantar el MCP server
cd mcp-server && npm start
# → Zero-trust MCP server running on port 3000

# Terminal 2: validar el spec inseguro
node .kiro/hooks/policy-enforcer.js .kiro/specs/insecure-example.yaml

# Output esperado:
# [policy-enforcer] Validating spec: insecure-example.yaml
# 🚨 [CRITICAL] IAM-001 — payment-lambda-role
#      Wildcard action "*" grants unrestricted permissions
#      Remediation: Replace wildcard with specific actions
#
# 🚨 [CRITICAL] IAM-002 — payment-lambda-role
#      Wildcard resource "*" grants access to all AWS resources
#
# 🚨 [CRITICAL] NET-001 — payment-database
#      RDS instance is publicly accessible
#
# ... 7 violaciones más ...
#
# BLOCKED: 8 CRITICAL/HIGH violation(s) must be resolved.
# exit code: 1

# Validar el spec seguro
node .kiro/hooks/policy-enforcer.js .kiro/specs/secure-example.yaml
# → ✓ All checks passed. Spec is zero-trust compliant.
# exit code: 0
```

**Notas del presentador:**
- "Si hay tiempo, mostrar también el `calculate_blast_radius` en curl."
- "El contraste entre los dos specs es el money shot de la demo."

---

## Slide 27 — Cómo adoptar esto en tu equipo (pasos concretos)

```
┌─────────────────────────────────────────────────────────────────┐
│  SEMANA 1 — Instala y observa                                   │
│                                                                 │
│  git clone kiro-zero-trust-enforcer                             │
│  cd mcp-server && npm install && npm start                      │
│  POLICY_ENFORCER_DRY_RUN=true \                                 │
│    node .kiro/hooks/policy-enforcer.js tus-specs/*.yaml         │
│                                                                 │
│  → Ves cuántas violaciones tienes sin bloquear nada             │
│                                                                 │
│  SEMANA 2 — Agrega las reglas que aplican a tu contexto        │
│                                                                 │
│  1. Nueva regla en mcp-server/src/tools/validate-iam.ts         │
│  2. Misma regla en policies/opa/ (con §RULE-ID comment)        │
│  3. npm test + opa test policies/opa/ -v                        │
│                                                                 │
│  SEMANA 3 — Enforce mode en nuevos proyectos                    │
│                                                                 │
│  POLICY_ENFORCER_DRY_RUN=false (el default)                    │
│  Conecta los GitHub Actions workflows                           │
│  Configura OIDC para el deploy role                             │
│                                                                 │
│  SEMANA 4 — Retroapplica a proyectos existentes                 │
│                                                                 │
│  Usa blast-radius para priorizar por impacto                    │
│  Los más críticos primero                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Slide 28 — Takeaways

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1.  MCP convierte a Kiro en un agente que entiende             │
│      TU infraestructura, no solo patrones genéricos.            │
│                                                                 │
│  2.  Las políticas IAM de mínimo privilegio se generan          │
│      desde el spec, no después del código.                      │
│                                                                 │
│  3.  Tres capas independientes: hook + CI + gate de deploy.     │
│      Ninguna confía en las otras. Eso es Zero Trust.            │
│                                                                 │
│  4.  La misma lógica de políticas corre en todas las capas.     │
│      TypeScript en dev, OPA en CI.                              │
│      Una regla nueva → se actualiza en ambos.                   │
│                                                                 │
│  5.  Fail-closed por diseño. Un server de políticas caído       │
│      bloquea, no permite. Deny by default.                      │
│                                                                 │
│  6.  Zero Trust-as-Code: la seguridad es una propiedad          │
│      del pipeline, no una tarea separada.                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Slide 29 — Recursos y repo

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Repositorio completo:                                          │
│  github.com/jdiegobonp/kiro-zero-trust-enforcer                 │
│                                                                 │
│  ─────────────────────────────────────────────────             │
│                                                                 │
│  Lectura adicional:                                             │
│  • MCP Spec: modelcontextprotocol.io                            │
│  • Kiro docs: kiro.dev                                          │
│  • OPA Rego: openpolicyagent.org                                │
│  • AWS OIDC: docs.aws.amazon.com/iam/oidc                       │
│                                                                 │
│  ─────────────────────────────────────────────────             │
│                                                                 │
│  Juan Diego Bonilla                                             │
│  @jdiegobonp — jdiegobonp@gmail.com                             │
│                                                                 │
│  ¿Preguntas?                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

---

# APÉNDICE: NOTAS DEL PRESENTADOR

## Preguntas frecuentes anticipadas

**P: ¿El MCP server tiene que estar corriendo localmente?**
R: Para el hook de Kiro sí. Para CI, el workflow de GitHub Actions lo levanta como servicio en cada run. Para Claude Desktop, puede correr en cualquier host accesible. El URL se configura con `MCP_SERVER_URL`.

**P: ¿Qué pasa si tenemos 50 specs y el hook tarda mucho?**
R: Las dos llamadas al MCP server son paralelas (Promise.all). Cada validación toma 10-50ms porque es lógica pura en memoria, sin llamadas a AWS. A 50 specs, el bottleneck es la lectura de YAML, no la validación.

**P: ¿Por qué TypeScript + OPA y no solo OPA?**
R: TypeScript corre en tiempo real en Kiro (feedback inmediato para el dev). OPA corre en CI con el CLI de opa (sin levantar servidor, compatible con cualquier runner). Sirven contextos distintos. Ver `docs/architecture.md` sección "Why OPA over custom scripts".

**P: ¿Puedo integrar esto con Checkov o tfsec?**
R: Sí, son complementarios. Checkov/tfsec analizan el Terraform generado. Este sistema analiza el spec ANTES de generar Terraform. La ventaja: detectas problemas antes de que el código exista.

**P: ¿Qué tan difícil es agregar una nueva regla?**
R: Tres pasos: (1) push a validate-iam.ts o check-network.ts, (2) regla equivalente en Rego con `# §RULE-ID`, (3) test case en vitest y `opa test`. Ver `docs/architecture.md` sección "Adding Policy Rules".

---

## Timing detallado

| Slide | Contenido | Tiempo estimado |
|-------|-----------|-----------------|
| 1 | Título | 30s |
| 2 | El dato: 93% | 1m |
| 3 | Flujo actual (el problema) | 1m 30s |
| 4 | La propuesta | 2m |
| 5 | Qué es MCP | 2m |
| 6 | Dos superficies del servidor | 1m 30s |
| 7 | Las 4 herramientas MCP | 2m |
| 8 | Por qué MCP vs REST genérico | 2m 30s |
| 9 | El formato de spec | 1m 30s |
| 10 | El spec inseguro | 2m |
| 11 | Reglas IAM: el código | 2m |
| 12 | Tabla de reglas IAM + red | 1m 30s |
| 13 | suggest_least_privilege | 2m |
| 14 | calculate_blast_radius | 2m |
| 15 | El hook: concepto | 2m |
| 16 | El hook: código real | 2m |
| 17 | Dry-run mode | 1m 30s |
| 18 | Los 3 workflows de Actions | 2m |
| 19 | Gate por SHA | 2m |
| 20 | OIDC | 1m 30s |
| 21 | OPA | 2m |
| 22 | Terraform modules | 1m 30s |
| 23 | Flujo completo | 2m |
| 24 | ¿Por qué 3 capas? | 2m |
| 25 | Zero Trust principios | 2m |
| 26 | Demo en vivo | 3m |
| 27 | Cómo adoptar | 1m 30s |
| 28 | Takeaways | 1m |
| 29 | Recursos + cierre | 30s |
| — | Buffer / Q&A | 3m |
| **Total** | | **~47 min** |
