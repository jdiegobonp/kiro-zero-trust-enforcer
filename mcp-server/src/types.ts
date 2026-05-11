export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface Violation {
  ruleId: string;
  severity: Severity;
  resource: string;
  message: string;
  remediation: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
  checkedAt: string;
}

export interface AWSResource {
  type: string;
  id: string;
  config: Record<string, unknown>;
}

export interface ArchSpec {
  name: string;
  version: string;
  description?: string;
  resources: AWSResource[];
}

export interface BlastRadiusReport {
  roleName: string;
  estimatedBlastRadius: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  affectedServices: string[];
  maxPrivilegeScore: number;
  recommendations: string[];
}

export interface MinimalPolicy {
  useCase: string;
  suggestedActions: string[];
  suggestedResources: string[];
  rationale: string;
}
