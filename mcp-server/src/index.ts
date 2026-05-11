import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ArchSpec } from './types';
import { validateIAMPolicy, ValidateIAMInputSchema } from './tools/validate-iam';
import { checkNetworkPosture, CheckNetworkInputSchema } from './tools/check-network';
import { calculateBlastRadius, BlastRadiusInputSchema } from './tools/blast-radius';
import { suggestLeastPrivilege, SuggestMinimalInputSchema } from './tools/suggest-minimal';
import { logToolCall } from './logger';

const PORT = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3000;

const app = express();
app.use(express.json());

// ── REST endpoints (called directly by policy-enforcer.js hook) ──────────────

app.post('/tools/validate_iam_policy', (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const result = validateIAMPolicy(req.body as ArchSpec);
    logToolCall('validate_iam_policy', result, start);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post('/tools/check_network_posture', (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const result = checkNetworkPosture(req.body as ArchSpec);
    logToolCall('check_network_posture', result, start);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post('/tools/calculate_blast_radius', (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const { roleName, actions, resources } = req.body as {
      roleName: string;
      actions: string[];
      resources: string[];
    };
    const result = calculateBlastRadius(roleName, actions, resources);
    logToolCall('calculate_blast_radius', result, start);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post('/tools/suggest_least_privilege', (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const { currentActions, useCase } = req.body as {
      currentActions: string[];
      useCase: string;
    };
    const result = suggestLeastPrivilege(currentActions, useCase);
    logToolCall('suggest_least_privilege', result, start);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    tools: [
      'validate_iam_policy',
      'check_network_posture',
      'calculate_blast_radius',
      'suggest_least_privilege',
    ],
  });
});

// ── MCP Streamable HTTP transport ─────────────────────────────────────────────

const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'zero-trust-enforcer', version: '1.0.0' },
    { capabilities: { logging: {} } }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySchema = any;

  server.tool(
    'validate_iam_policy',
    'Validates IAM policies in an architecture spec for zero-trust compliance',
    ValidateIAMInputSchema as AnySchema,
    async (args: AnySchema) => {
      const start = Date.now();
      const result = validateIAMPolicy(args['spec'] as ArchSpec);
      logToolCall('validate_iam_policy', result, start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'check_network_posture',
    'Validates network security posture for zero-trust compliance',
    CheckNetworkInputSchema as AnySchema,
    async (args: AnySchema) => {
      const start = Date.now();
      const result = checkNetworkPosture(args['spec'] as ArchSpec);
      logToolCall('check_network_posture', result, start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'calculate_blast_radius',
    'Calculates the blast radius if an IAM role is compromised',
    BlastRadiusInputSchema as AnySchema,
    async (args: AnySchema) => {
      const start = Date.now();
      const result = calculateBlastRadius(
        args['roleName'] as string,
        args['actions'] as string[],
        args['resources'] as string[]
      );
      logToolCall('calculate_blast_radius', result, start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'suggest_least_privilege',
    'Suggests minimal IAM permissions for a given use case',
    SuggestMinimalInputSchema as AnySchema,
    async (args: AnySchema) => {
      const start = Date.now();
      const result = suggestLeastPrivilege(
        args['currentActions'] as string[],
        args['useCase'] as string
      );
      logToolCall('suggest_least_privilege', result, start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  const addendumSchema = {
    specName: z.string().describe('Name of the architecture spec'),
    violations: z.array(z.object({
      ruleId: z.string(),
      severity: z.string(),
      resource: z.string(),
      message: z.string(),
      remediation: z.string(),
    })).describe('List of violations to document'),
  };

  server.tool(
    'generate_security_addendum',
    'Generates a Security Considerations markdown section for architecture specs',
    addendumSchema as AnySchema,
    async (args: AnySchema) => {
      const start = Date.now();
      const specName = args['specName'] as string;
      const violations = args['violations'] as Array<{
        ruleId: string; severity: string; resource: string; message: string; remediation: string;
      }>;

      const bySeverity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => ({
        severity: sev,
        items: violations.filter(v => v.severity === sev),
      })).filter(g => g.items.length > 0);

      const lines = [
        `## Security Considerations — ${specName}`,
        '',
        `> Generated by Zero-Trust Enforcer on ${new Date().toISOString()}`,
        '',
      ];

      if (violations.length === 0) {
        lines.push('All security checks passed. No violations found.');
      } else {
        for (const group of bySeverity) {
          lines.push(`### ${group.severity} Violations`);
          lines.push('');
          for (const v of group.items) {
            lines.push(`**[${v.ruleId}]** \`${v.resource}\``);
            lines.push(`- ${v.message}`);
            lines.push(`- **Remediation:** ${v.remediation}`);
            lines.push('');
          }
        }
      }

      process.stdout.write(JSON.stringify({
        timestamp: new Date().toISOString(),
        tool: 'generate_security_addendum',
        duration_ms: Date.now() - start,
        violation_count: violations.length,
        severity: violations[0]?.severity ?? 'NONE',
      }) + '\n');

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  return server;
}

app.post('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'];
  const sid = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  try {
    if (sid && transports.has(sid)) {
      const transport = transports.get(sid)!;
      await transport.handleRequest(req, res, req.body);
    } else if (!sid && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSid) => {
          transports.set(newSid, transport);
        },
      });
      transport.onclose = () => {
        const tSid = transport.sessionId;
        if (tSid) transports.delete(tSid);
      };
      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else {
      res.status(400).json({ error: 'No valid MCP session. Send an initialize request first.' });
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'];
  const sid = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  if (!sid || !transports.has(sid)) {
    res.status(400).send('Invalid or missing MCP session ID');
    return;
  }
  await transports.get(sid)!.handleRequest(req, res);
});

app.delete('/mcp', async (req: Request, res: Response) => {
  const sessionId = req.headers['mcp-session-id'];
  const sid = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  if (!sid || !transports.has(sid)) {
    res.status(400).send('Invalid or missing MCP session ID');
    return;
  }
  await transports.get(sid)!.handleRequest(req, res);
});

// ── Server startup ────────────────────────────────────────────────────────────

const httpServer = app.listen(PORT, () => {
  process.stderr.write(`Zero-trust MCP server running on port ${PORT}\n`);
});

process.on('SIGINT', async () => {
  httpServer.close();
  for (const [sid, transport] of transports) {
    await transport.close();
    transports.delete(sid);
  }
  process.exit(0);
});

export { app };
