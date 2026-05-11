import { z } from 'zod';
import type { ArchSpec, ValidationResult, Violation } from '../types';

const DANGEROUS_PORTS = new Set([22, 23, 3306, 5432, 1433, 6379, 27017, 9200, 9300]);
const ALLOWED_PUBLIC_PORTS = new Set([80, 443]);

function toNumber(val: unknown): number | null {
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return [val];
  return [];
}

function getIngressRules(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const ingress = config['ingress'];
  return Array.isArray(ingress) ? (ingress as Array<Record<string, unknown>>) : [];
}

export function checkNetworkPosture(spec: ArchSpec): ValidationResult {
  const violations: Violation[] = [];
  const hasS3 = spec.resources.some(r => r.type === 'aws_s3_bucket');
  const hasVpcEndpointForS3 = spec.resources.some(
    r => r.type === 'aws_vpc_endpoint' &&
         String(r.config['service_name'] ?? '').includes('s3')
  );

  for (const resource of spec.resources) {
    switch (resource.type) {
      case 'aws_db_instance': {
        // NET-001: RDS publicly accessible
        if (resource.config['publicly_accessible'] === true) {
          violations.push({
            ruleId: 'NET-001',
            severity: 'CRITICAL',
            resource: resource.id,
            message: 'RDS instance is publicly accessible — violates Zero Trust',
            remediation: 'Set publicly_accessible = false and place in isolated subnet group',
          });
        }

        // NET-002: unencrypted storage
        if (resource.config['storage_encrypted'] === false) {
          violations.push({
            ruleId: 'NET-002',
            severity: 'HIGH',
            resource: resource.id,
            message: 'RDS storage encryption is disabled',
            remediation: 'Enable storage_encrypted = true with a KMS CMK',
          });
        }

        // NET-003: no backup retention
        const retention = toNumber(resource.config['backup_retention_period']);
        if (retention !== null && retention < 7) {
          violations.push({
            ruleId: 'NET-003',
            severity: 'MEDIUM',
            resource: resource.id,
            message: `RDS backup retention is ${retention} day(s) — minimum recommended is 7`,
            remediation: 'Set backup_retention_period to 7 or more',
          });
        }
        break;
      }

      case 'aws_s3_bucket': {
        const acl = String(resource.config['acl'] ?? '');
        if (acl === 'public-read' || acl === 'public-read-write') {
          violations.push({
            ruleId: 'NET-004',
            severity: 'CRITICAL',
            resource: resource.id,
            message: `S3 bucket has public ACL "${acl}"`,
            remediation: 'Set acl to "private" and use bucket policies for controlled access',
          });
        }
        break;
      }

      case 'aws_security_group': {
        const ingress = getIngressRules(resource.config);
        for (const rule of ingress) {
          const cidrs = toStringArray(rule['cidr'] ?? rule['cidr_blocks']);
          const port = toNumber(rule['port'] ?? rule['from_port']);

          if (!cidrs.includes('0.0.0.0/0') && !cidrs.includes('::/0')) continue;

          if (port !== null && DANGEROUS_PORTS.has(port)) {
            violations.push({
              ruleId: 'NET-005',
              severity: 'CRITICAL',
              resource: resource.id,
              message: `Security group opens dangerous port ${port} to 0.0.0.0/0`,
              remediation: `Restrict port ${port} to specific source security group or CIDR, never 0.0.0.0/0`,
            });
          } else if (port !== null && !ALLOWED_PUBLIC_PORTS.has(port)) {
            violations.push({
              ruleId: 'NET-006',
              severity: 'HIGH',
              resource: resource.id,
              message: `Security group opens port ${port} to 0.0.0.0/0`,
              remediation: 'Restrict ingress to known CIDR ranges or source security groups',
            });
          } else if (port !== null && ALLOWED_PUBLIC_PORTS.has(port)) {
            // HTTP/HTTPS open to world — warn unless there's an ALB context
            const hasAlb = spec.resources.some(r => r.type === 'aws_lb' || r.type === 'aws_alb');
            if (!hasAlb) {
              violations.push({
                ruleId: 'NET-007',
                severity: 'MEDIUM',
                resource: resource.id,
                message: `Security group opens port ${port} to 0.0.0.0/0 without an ALB in the spec`,
                remediation: 'Place an Application Load Balancer in front and restrict this SG to the ALB SG',
              });
            }
          }
        }
        break;
      }
    }
  }

  // NET-008: S3 buckets without VPC endpoint
  if (hasS3 && !hasVpcEndpointForS3) {
    violations.push({
      ruleId: 'NET-008',
      severity: 'MEDIUM',
      resource: 'vpc',
      message: 'S3 buckets defined without a VPC endpoint — traffic may traverse the public internet',
      remediation: 'Add an aws_vpc_endpoint resource for S3 (Gateway type, free of charge)',
    });
  }

  return { valid: violations.length === 0, violations, checkedAt: new Date().toISOString() };
}

export const CheckNetworkInputSchema = {
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
  }).describe('Architecture spec to validate for network security posture'),
};
