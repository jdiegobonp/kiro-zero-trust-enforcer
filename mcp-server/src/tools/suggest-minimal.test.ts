import { describe, it, expect } from 'vitest';
import { suggestLeastPrivilege } from './suggest-minimal';

describe('suggestLeastPrivilege', () => {
  it('returns preset for lambda-s3-writer', () => {
    const result = suggestLeastPrivilege(['s3:*'], 'lambda-s3-writer');
    expect(result.suggestedActions).toContain('s3:PutObject');
    expect(result.suggestedActions).toContain('s3:GetObject');
    expect(result.suggestedActions).not.toContain('s3:*');
  });

  it('returns preset for cloudwatch-logger', () => {
    const result = suggestLeastPrivilege(['*'], 'cloudwatch-logger');
    expect(result.suggestedActions).toContain('logs:PutLogEvents');
    expect(result.suggestedActions).not.toContain('*');
  });

  it('prunes wildcards for unknown use case', () => {
    const result = suggestLeastPrivilege(['*', 's3:GetObject', 'iam:CreateUser'], 'unknown-use-case');
    expect(result.suggestedActions).not.toContain('*');
    expect(result.suggestedActions).not.toContain('iam:CreateUser');
    expect(result.suggestedActions).toContain('s3:GetObject');
  });

  it('includes rationale string', () => {
    const result = suggestLeastPrivilege(['s3:*', 'iam:*'], 'lambda-secrets');
    expect(result.rationale).toBeTruthy();
    expect(typeof result.rationale).toBe('string');
  });

  it('handles empty currentActions for preset', () => {
    const result = suggestLeastPrivilege([], 'api-gateway-invoker');
    expect(result.suggestedActions).toContain('lambda:InvokeFunction');
  });

  it('handles empty currentActions for unknown use case', () => {
    const result = suggestLeastPrivilege([], 'some-unknown-case');
    expect(result.suggestedActions.length).toBeGreaterThan(0);
    expect(result.rationale).toBeTruthy();
  });
});
