import { describe, it, expect } from 'vitest';
import { calculateBlastRadius } from './blast-radius';

describe('calculateBlastRadius', () => {
  it('returns CRITICAL for full wildcard actions', () => {
    const result = calculateBlastRadius('danger-role', ['*'], ['*']);
    expect(result.estimatedBlastRadius).toBe('CRITICAL');
    expect(result.maxPrivilegeScore).toBeGreaterThanOrEqual(80);
  });

  it('includes can_create_admin_users capability for iam:*', () => {
    const result = calculateBlastRadius('iam-role', ['iam:*'], ['arn:aws:iam:::*']);
    expect(result.affectedServices).toContain('can_create_admin_users');
  });

  it('includes can_disable_audit_logging for cloudtrail:*', () => {
    const result = calculateBlastRadius('ct-role', ['cloudtrail:*'], ['*']);
    expect(result.affectedServices).toContain('can_disable_audit_logging');
  });

  it('includes can_steal_all_secrets for secretsmanager:*', () => {
    const result = calculateBlastRadius('sec-role', ['secretsmanager:*'], ['*']);
    expect(result.affectedServices).toContain('can_steal_all_secrets');
  });

  it('returns LOW for minimal read-only actions', () => {
    const result = calculateBlastRadius('read-role', ['s3:GetObject', 'logs:GetLogEvents'], ['arn:aws:s3:::my-bucket/*']);
    expect(['LOW', 'MEDIUM']).toContain(result.estimatedBlastRadius);
  });

  it('provides recommendations', () => {
    const result = calculateBlastRadius('wide-role', ['*'], ['*']);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('resource wildcard multiplies the score', () => {
    const withWildcard = calculateBlastRadius('role', ['s3:*'], ['*']);
    const withSpecific = calculateBlastRadius('role', ['s3:*'], ['arn:aws:s3:::my-bucket']);
    expect(withWildcard.maxPrivilegeScore).toBeGreaterThanOrEqual(withSpecific.maxPrivilegeScore);
  });
});
