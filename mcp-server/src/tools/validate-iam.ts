import { z } from 'zod';
import type { ArchSpec, ValidationResult, Violation } from '../types';

const WILDCARD_ACTION_RE = /^(\*|[a-zA-Z0-9-]+:\*)$/;
const ADMIN_ACTION_PREFIXES = ['iam:', 'organizations:', 'billing:'];

function getStatements(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const stmts = config['statements'];
  return Array.isArray(stmts) ? (stmts as Array<Record<string, unknown>>) : [];
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return [val];
  return [];
}

export function validateIAMPolicy(spec: ArchSpec): ValidationResult {
  const violations: Violation[] = [];

  for (const resource of spec.resources) {
    if (resource.type !== 'aws_iam_role' && resource.type !== 'aws_iam_policy') continue;

    const statements = getStatements(resource.config);

    for (const stmt of statements) {
      if (stmt['effect'] === 'Deny') continue;

      const actions = toStringArray(stmt['actions']);
      const resources = toStringArray(stmt['resources']);
      const conditions = stmt['conditions'];
      const hasMFA = typeof conditions === 'object' && conditions !== null &&
        JSON.stringify(conditions).includes('aws:MultiFactorAuthPresent');

      // IAM-001: wildcard action
      for (const action of actions) {
        if (WILDCARD_ACTION_RE.test(action)) {
          violations.push({
            ruleId: 'IAM-001',
            severity: 'CRITICAL',
            resource: resource.id,
            message: `Wildcard action "${action}" grants unrestricted permissions`,
            remediation: 'Replace wildcard with the specific actions required for this use case',
          });
        }
      }

      // IAM-002: wildcard resource
      for (const res of resources) {
        if (res === '*') {
          violations.push({
            ruleId: 'IAM-002',
            severity: 'CRITICAL',
            resource: resource.id,
            message: 'Wildcard resource "*" grants access to all AWS resources',
            remediation: 'Scope resources to specific ARNs (e.g., arn:aws:s3:::my-bucket/*)',
          });
        }
      }

      // IAM-003: more than 15 actions
      if (actions.length > 15) {
        violations.push({
          ruleId: 'IAM-003',
          severity: 'HIGH',
          resource: resource.id,
          message: `IAM role has ${actions.length} actions — consider splitting by function`,
          remediation: 'Split into separate roles with fewer, purpose-scoped permissions',
        });
      }

      // IAM-004: admin actions without MFA
      const adminActions = actions.filter(a =>
        ADMIN_ACTION_PREFIXES.some(prefix => a.toLowerCase().startsWith(prefix))
      );
      if (adminActions.length > 0 && !hasMFA) {
        violations.push({
          ruleId: 'IAM-004',
          severity: 'CRITICAL',
          resource: resource.id,
          message: `Admin actions (${adminActions.join(', ')}) granted without MFA condition`,
          remediation: 'Add Condition: { "Bool": { "aws:MultiFactorAuthPresent": "true" } }',
        });
      }
    }

    // IAM-005: role name too long
    const roleName = resource.config['role_name'] ?? resource.id;
    if (typeof roleName === 'string' && roleName.length > 64) {
      violations.push({
        ruleId: 'IAM-005',
        severity: 'MEDIUM',
        resource: resource.id,
        message: `IAM role name "${roleName}" exceeds 64 characters (${roleName.length})`,
        remediation: 'Shorten the role name to 64 characters or fewer',
      });
    }
  }

  return { valid: violations.length === 0, violations, checkedAt: new Date().toISOString() };
}

export const ValidateIAMInputSchema = {
  spec: z.object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    resources: z.array(
      z.object({
        type: z.string(),
        id: z.string(),
        config: z.record(z.unknown()),
      })
    ),
  }).describe('Architecture spec to validate for IAM compliance'),
};
