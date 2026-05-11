import type { Severity, BlastRadiusReport, MinimalPolicy, ValidationResult } from './types';

type ToolResult = ValidationResult | BlastRadiusReport | MinimalPolicy;

function extractMetrics(result: ToolResult): { violation_count: number; severity: Severity | 'NONE' } {
  if ('violations' in result) {
    return {
      violation_count: result.violations.length,
      severity: result.violations[0]?.severity ?? 'NONE',
    };
  }
  if ('estimatedBlastRadius' in result) {
    return { violation_count: 0, severity: result.estimatedBlastRadius };
  }
  return { violation_count: 0, severity: 'NONE' };
}

export function logToolCall(tool: string, result: ToolResult, startTime: number): void {
  const entry = {
    timestamp: new Date().toISOString(),
    tool,
    duration_ms: Date.now() - startTime,
    ...extractMetrics(result),
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}
