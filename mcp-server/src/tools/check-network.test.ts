import { describe, it, expect } from 'vitest';
import { checkNetworkPosture } from './check-network';
import type { ArchSpec } from '../types';

const baseSpec = (resources: ArchSpec['resources']): ArchSpec => ({
  name: 'test-spec',
  version: '1.0',
  resources,
});

describe('checkNetworkPosture', () => {
  it('returns valid for empty spec', () => {
    expect(checkNetworkPosture(baseSpec([])).valid).toBe(true);
  });

  it('detects publicly accessible RDS as CRITICAL (NET-001)', () => {
    const result = checkNetworkPosture(baseSpec([{
      type: 'aws_db_instance',
      id: 'prod-db',
      config: { publicly_accessible: true, storage_encrypted: true, backup_retention_period: 7 },
    }]));
    expect(result.violations.some(v => v.ruleId === 'NET-001' && v.severity === 'CRITICAL')).toBe(true);
  });

  it('detects unencrypted RDS storage as HIGH (NET-002)', () => {
    const result = checkNetworkPosture(baseSpec([{
      type: 'aws_db_instance',
      id: 'unencrypted-db',
      config: { publicly_accessible: false, storage_encrypted: false, backup_retention_period: 7 },
    }]));
    expect(result.violations.some(v => v.ruleId === 'NET-002' && v.severity === 'HIGH')).toBe(true);
  });

  it('detects low backup retention as MEDIUM (NET-003)', () => {
    const result = checkNetworkPosture(baseSpec([{
      type: 'aws_db_instance',
      id: 'low-backup-db',
      config: { publicly_accessible: false, storage_encrypted: true, backup_retention_period: 1 },
    }]));
    expect(result.violations.some(v => v.ruleId === 'NET-003' && v.severity === 'MEDIUM')).toBe(true);
  });

  it('detects public S3 ACL as CRITICAL (NET-004)', () => {
    const result = checkNetworkPosture(baseSpec([{
      type: 'aws_s3_bucket',
      id: 'public-bucket',
      config: { acl: 'public-read' },
    }]));
    expect(result.violations.some(v => v.ruleId === 'NET-004' && v.severity === 'CRITICAL')).toBe(true);
  });

  it('detects SSH open to world as CRITICAL (NET-005)', () => {
    const result = checkNetworkPosture(baseSpec([{
      type: 'aws_security_group',
      id: 'open-sg',
      config: { ingress: [{ cidr: '0.0.0.0/0', port: 22 }] },
    }]));
    expect(result.violations.some(v => v.ruleId === 'NET-005' && v.severity === 'CRITICAL')).toBe(true);
  });

  it('detects S3 without VPC endpoint as MEDIUM (NET-008)', () => {
    const result = checkNetworkPosture(baseSpec([{
      type: 'aws_s3_bucket',
      id: 'private-bucket',
      config: { acl: 'private' },
    }]));
    expect(result.violations.some(v => v.ruleId === 'NET-008')).toBe(true);
  });

  it('passes when S3 has a VPC endpoint defined', () => {
    const result = checkNetworkPosture(baseSpec([
      { type: 'aws_s3_bucket', id: 'private-bucket', config: { acl: 'private' } },
      { type: 'aws_vpc_endpoint', id: 's3-endpoint', config: { service_name: 'com.amazonaws.us-east-1.s3' } },
    ]));
    expect(result.violations.some(v => v.ruleId === 'NET-008')).toBe(false);
  });

  it('returns valid for a secure RDS setup', () => {
    const result = checkNetworkPosture(baseSpec([{
      type: 'aws_db_instance',
      id: 'secure-db',
      config: { publicly_accessible: false, storage_encrypted: true, backup_retention_period: 7 },
    }]));
    expect(result.valid).toBe(true);
  });
});
