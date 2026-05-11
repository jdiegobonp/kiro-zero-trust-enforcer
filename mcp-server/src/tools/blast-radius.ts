import { z } from 'zod';
import type { BlastRadiusReport } from '../types';

interface CapabilityRule {
  match: (actions: string[], resources: string[]) => boolean;
  capability: string;
  score: number;
}

const CAPABILITY_RULES: CapabilityRule[] = [
  {
    match: (actions) => actions.some(a => a === '*' || a === 'iam:*'),
    capability: 'can_create_admin_users',
    score: 40,
  },
  {
    match: (actions, resources) =>
      actions.some(a => a === 's3:*' || a === '*') ||
      resources.some(r => r === 'arn:aws:s3:::*' || r === '*'),
    capability: 'can_exfiltrate_all_data',
    score: 30,
  },
  {
    match: (actions) => actions.some(a => a === 'cloudtrail:*' || a === '*'),
    capability: 'can_disable_audit_logging',
    score: 35,
  },
  {
    match: (actions) => actions.some(a => a === 'ec2:*' || a === '*'),
    capability: 'can_modify_network_controls',
    score: 20,
  },
  {
    match: (actions) => actions.some(a => a === 'secretsmanager:*' || a === '*'),
    capability: 'can_steal_all_secrets',
    score: 35,
  },
  {
    match: (actions) => actions.some(a => a === 'organizations:*' || a === '*'),
    capability: 'can_compromise_entire_org',
    score: 50,
  },
  {
    match: (actions) => actions.some(a => a === 'kms:*' || a === '*'),
    capability: 'can_decrypt_all_data',
    score: 30,
  },
];

function buildRecommendations(actions: string[]): string[] {
  const recs: string[] = [];

  if (actions.some(a => a === '*')) {
    recs.push('Split into purpose-scoped roles: one per Lambda function or service boundary');
    recs.push('Start with AWS managed policies (e.g., AmazonS3ReadOnlyAccess) then prune');
    recs.push('Use AWS IAM Access Analyzer to generate policies from CloudTrail activity');
    return recs;
  }

  const serviceGroups: Record<string, string[]> = {};
  for (const action of actions) {
    const [prefix] = action.split(':');
    if (prefix) {
      if (!serviceGroups[prefix]) serviceGroups[prefix] = [];
      serviceGroups[prefix].push(action);
    }
  }

  const services = Object.keys(serviceGroups);
  if (services.length > 3) {
    recs.push(`Consider splitting ${services.length} service permissions across ${Math.ceil(services.length / 2)} focused roles`);
  }
  for (const svc of services.slice(0, 3)) {
    recs.push(`Scope ${svc} actions to specific resource ARNs instead of "*"`);
  }

  return recs;
}

export function calculateBlastRadius(
  roleName: string,
  actions: string[],
  resources: string[]
): BlastRadiusReport {
  let score = 0;
  const capabilities: string[] = [];

  for (const rule of CAPABILITY_RULES) {
    if (rule.match(actions, resources)) {
      capabilities.push(rule.capability);
      score += rule.score;
    }
  }

  // Wildcard resource multiplier
  if (resources.some(r => r === '*')) {
    score = Math.ceil(score * 1.5);
  }

  // Estimate affected AWS services
  let affectedServiceCount = 0;
  if (actions.some(a => a === '*')) {
    affectedServiceCount = resources.some(r => r === '*') ? 847 : 300;
  } else {
    const uniquePrefixes = new Set(actions.map(a => a.split(':')[0]));
    affectedServiceCount = uniquePrefixes.size * 15; // rough sub-service estimate
  }

  const severity =
    score >= 80 ? 'CRITICAL' :
    score >= 50 ? 'HIGH' :
    score >= 20 ? 'MEDIUM' : 'LOW';

  return {
    roleName,
    estimatedBlastRadius: severity,
    affectedServices: capabilities.length > 0
      ? capabilities
      : [`${affectedServiceCount} potential service actions`],
    maxPrivilegeScore: score,
    recommendations: buildRecommendations(actions),
  };
}

export const BlastRadiusInputSchema = {
  roleName: z.string().describe('Name of the IAM role to analyze'),
  actions: z.array(z.string()).describe('List of IAM actions granted to the role'),
  resources: z.array(z.string()).describe('List of resource ARNs the role can act on'),
};
