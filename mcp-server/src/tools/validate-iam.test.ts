import { describe, it, expect } from 'vitest';
import { validateIAMPolicy } from './validate-iam';
import type { ArchSpec } from '../types';

const baseSpec = (resources: ArchSpec['resources']): ArchSpec => ({
  name: 'test-spec',
  version: '1.0',
  resources,
});

describe('validateIAMPolicy', () => {
  it('returns valid for a clean spec with no IAM resources', () => {
    const result = validateIAMPolicy(baseSpec([]));
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects wildcard action as CRITICAL (IAM-001)', () => {
    const result = validateIAMPolicy(baseSpec([{
      type: 'aws_iam_role',
      id: 'bad-role',
      config: {
        statements: [{ effect: 'Allow', actions: ['*'], resources: ['arn:aws:s3:::my-bucket'] }],
      },
    }]));
    const v = result.violations.find(x => x.ruleId === 'IAM-001');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('CRITICAL');
    expect(result.valid).toBe(false);
  });

  it('detects service-level wildcard action (IAM-001)', () => {
    const result = validateIAMPolicy(baseSpec([{
      type: 'aws_iam_role',
      id: 'svc-wildcard',
      config: {
        statements: [{ effect: 'Allow', actions: ['s3:*'], resources: ['arn:aws:s3:::bucket'] }],
      },
    }]));
    expect(result.violations.some(v => v.ruleId === 'IAM-001')).toBe(true);
  });

  it('detects wildcard resource as CRITICAL (IAM-002)', () => {
    const result = validateIAMPolicy(baseSpec([{
      type: 'aws_iam_role',
      id: 'wild-resource',
      config: {
        statements: [{ effect: 'Allow', actions: ['s3:GetObject'], resources: ['*'] }],
      },
    }]));
    expect(result.violations.some(v => v.ruleId === 'IAM-002' && v.severity === 'CRITICAL')).toBe(true);
  });

  it('does not flag Deny statements', () => {
    const result = validateIAMPolicy(baseSpec([{
      type: 'aws_iam_role',
      id: 'deny-role',
      config: {
        statements: [{ effect: 'Deny', actions: ['*'], resources: ['*'] }],
      },
    }]));
    expect(result.valid).toBe(true);
  });

  it('detects admin actions without MFA as CRITICAL (IAM-004)', () => {
    const result = validateIAMPolicy(baseSpec([{
      type: 'aws_iam_role',
      id: 'iam-admin',
      config: {
        statements: [{ effect: 'Allow', actions: ['iam:CreateUser'], resources: ['*'] }],
      },
    }]));
    expect(result.violations.some(v => v.ruleId === 'IAM-004')).toBe(true);
  });

  it('passes admin actions when MFA condition is present', () => {
    const result = validateIAMPolicy(baseSpec([{
      type: 'aws_iam_role',
      id: 'mfa-admin',
      config: {
        statements: [{
          effect: 'Allow',
          actions: ['iam:CreateUser'],
          resources: ['arn:aws:iam::123456789012:user/*'],
          conditions: { Bool: { 'aws:MultiFactorAuthPresent': 'true' } },
        }],
      },
    }]));
    expect(result.violations.some(v => v.ruleId === 'IAM-004')).toBe(false);
  });

  it('returns clean result for compliant spec', () => {
    const result = validateIAMPolicy(baseSpec([{
      type: 'aws_iam_role',
      id: 'good-role',
      config: {
        statements: [{
          effect: 'Allow',
          actions: ['s3:GetObject', 's3:PutObject'],
          resources: ['arn:aws:s3:::my-bucket/*'],
        }],
      },
    }]));
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
