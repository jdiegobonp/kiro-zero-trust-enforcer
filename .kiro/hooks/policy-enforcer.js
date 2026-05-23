#!/usr/bin/env node
/**
 * Kiro post-spec hook: validates architecture spec against zero-trust policies.
 *
 * Usage:
 *   node policy-enforcer.js <path-to-spec.yaml>       — single YAML file
 *   node policy-enforcer.js <path-to-spec-folder/>    — Kiro spec folder (reads spec.yaml inside)
 *
 * Environment variables:
 *   POLICY_ENFORCER_DRY_RUN=true  — log violations but never exit 1
 *   MCP_SERVER_URL                — defaults to http://localhost:3000
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const DRY_RUN = process.env.POLICY_ENFORCER_DRY_RUN === 'true';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'http://localhost:3000';
const specPath = process.argv[2];

function exit(code) {
  process.exit(DRY_RUN ? 0 : code);
}

function log(msg) {
  process.stdout.write(`[policy-enforcer] ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`[policy-enforcer] ${msg}\n`);
}

function formatViolation(v) {
  const icon = v.severity === 'CRITICAL' ? '🚨' : v.severity === 'HIGH' ? '⚠️ ' : 'ℹ️ ';
  return [
    `${icon} [${v.severity}] ${v.ruleId} — ${v.resource}`,
    `     ${v.message}`,
    `     Remediation: ${v.remediation}`,
  ].join('\n');
}

function resolveSpecPath(inputPath) {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return path.join(resolved, 'spec.yaml');
  }
  return resolved;
}

async function main() {
  if (!specPath) {
    warn('ERROR: No spec path provided.');
    warn('  Usage: node policy-enforcer.js <spec.yaml>');
    warn('         node policy-enforcer.js <spec-folder/>');
    exit(1);
    return;
  }

  // Resolve folder → spec.yaml if needed
  let resolvedPath;
  try {
    resolvedPath = resolveSpecPath(specPath);
  } catch (err) {
    warn(`ERROR: Path not found "${specPath}": ${err.message}`);
    exit(1);
    return;
  }

  // Read and parse spec YAML
  let spec;
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    spec = yaml.load(raw);
  } catch (err) {
    warn(`ERROR: Failed to read spec at "${resolvedPath}": ${err.message}`);
    if (DRY_RUN) {
      warn('[DRY-RUN] Would fail-closed in enforce mode. Continuing due to dry-run.');
      process.exit(0);
    }
    process.exit(1);
    return;
  }

  if (DRY_RUN) {
    log('DRY-RUN mode enabled — violations will be logged but will NOT block execution.');
  }

  const specLabel = path.basename(path.dirname(resolvedPath)) + '/spec.yaml';
  log(`Validating spec: ${specLabel}`);

  // Call both MCP REST endpoints in parallel
  let iamResult, networkResult;
  try {
    const [iamRes, netRes] = await Promise.all([
      fetch(`${MCP_SERVER_URL}/tools/validate_iam_policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`${MCP_SERVER_URL}/tools/check_network_posture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
        signal: AbortSignal.timeout(10_000),
      }),
    ]);

    if (!iamRes.ok || !netRes.ok) {
      throw new Error(`MCP server returned an error: IAM=${iamRes.status}, Network=${netRes.status}`);
    }

    iamResult = await iamRes.json();
    networkResult = await netRes.json();
  } catch (err) {
    if (err.name === 'TimeoutError' || err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
      if (DRY_RUN) {
        warn('WARNING: MCP server unreachable — would fail-closed in enforce mode.');
        warn(`  Error: ${err.message}`);
        warn('  Continuing due to dry-run mode. Start the server: cd mcp-server && npm start');
        process.exit(0);
        return;
      }
      warn('FATAL: MCP server unreachable — failing closed (Zero Trust default).');
      warn(`  Error: ${err.message}`);
      warn('  Start the server: cd mcp-server && npm start');
      process.exit(1);
      return;
    }
    warn(`ERROR: Unexpected error calling MCP server: ${err.message}`);
    exit(1);
    return;
  }

  // Collect and deduplicate violations
  const allViolations = [
    ...(iamResult.violations ?? []),
    ...(networkResult.violations ?? []),
  ];

  const blocking = allViolations.filter(v =>
    v.severity === 'CRITICAL' || v.severity === 'HIGH'
  );

  // Print violation report
  if (allViolations.length === 0) {
    log('✓ All checks passed. Spec is zero-trust compliant.');
  } else {
    log(`Found ${allViolations.length} violation(s):`);
    log('');
    for (const v of allViolations) {
      log(formatViolation(v));
      log('');
    }
  }

  // Apply dry-run or enforce mode
  if (DRY_RUN) {
    if (blocking.length > 0) {
      warn('');
      warn('╔══════════════════════════════════════════════════════════════╗');
      warn('║  DRY-RUN MODE ACTIVE — NOT BLOCKING                         ║');
      warn(`║  ${String(blocking.length + ' CRITICAL/HIGH violation(s)').padEnd(56)}║`);
      warn('║  Set POLICY_ENFORCER_DRY_RUN=false to enforce in production  ║');
      warn('╚══════════════════════════════════════════════════════════════╝');
    } else {
      log('[DRY-RUN] No blocking violations found. Would pass in enforce mode too.');
    }
    process.exit(0);
    return;
  }

  // Enforce mode
  if (blocking.length > 0) {
    warn(`BLOCKED: ${blocking.length} CRITICAL/HIGH violation(s) must be resolved before proceeding.`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[policy-enforcer] Unhandled error: ${err.message}\n`);
  process.exit(DRY_RUN ? 0 : 1);
});
