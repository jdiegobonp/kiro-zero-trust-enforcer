import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logToolCall } from './logger';
import type { ValidationResult, BlastRadiusReport, MinimalPolicy } from './types';

describe('logToolCall', () => {
  let writtenData: string;

  beforeEach(() => {
    writtenData = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      writtenData += String(data);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a ValidationResult with violation_count and severity', () => {
    const result: ValidationResult = {
      valid: false,
      checkedAt: new Date().toISOString(),
      violations: [
        { ruleId: 'IAM-001', severity: 'CRITICAL', resource: 'role', message: 'test', remediation: 'fix' },
      ],
    };
    const start = Date.now() - 50;
    logToolCall('validate_iam_policy', result, start);

    const entry = JSON.parse(writtenData.trim());
    expect(entry.tool).toBe('validate_iam_policy');
    expect(entry.violation_count).toBe(1);
    expect(entry.severity).toBe('CRITICAL');
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
    expect(entry.timestamp).toBeTruthy();
  });

  it('logs NONE severity when no violations', () => {
    const result: ValidationResult = { valid: true, checkedAt: '', violations: [] };
    logToolCall('check_network_posture', result, Date.now());
    const entry = JSON.parse(writtenData.trim());
    expect(entry.severity).toBe('NONE');
    expect(entry.violation_count).toBe(0);
  });

  it('logs blast radius severity', () => {
    const result: BlastRadiusReport = {
      roleName: 'test',
      estimatedBlastRadius: 'HIGH',
      affectedServices: [],
      maxPrivilegeScore: 60,
      recommendations: [],
    };
    logToolCall('calculate_blast_radius', result, Date.now());
    const entry = JSON.parse(writtenData.trim());
    expect(entry.severity).toBe('HIGH');
    expect(entry.violation_count).toBe(0);
  });

  it('logs NONE for MinimalPolicy result', () => {
    const result: MinimalPolicy = {
      useCase: 'test',
      suggestedActions: [],
      suggestedResources: [],
      rationale: 'test',
    };
    logToolCall('suggest_least_privilege', result, Date.now());
    const entry = JSON.parse(writtenData.trim());
    expect(entry.severity).toBe('NONE');
    expect(entry.violation_count).toBe(0);
  });

  it('emits valid JSON with newline', () => {
    const result: ValidationResult = { valid: true, checkedAt: '', violations: [] };
    logToolCall('test_tool', result, Date.now());
    expect(writtenData.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(writtenData.trim())).not.toThrow();
  });
});
