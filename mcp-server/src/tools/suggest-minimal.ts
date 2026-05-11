import { z } from 'zod';
import type { MinimalPolicy } from '../types';

interface PolicyPreset {
  actions: string[];
  resources: string[];
  conditions: Record<string, string>;
}

const PRESETS: Record<string, PolicyPreset> = {
  'lambda-s3-writer': {
    actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
    resources: [
      'arn:aws:s3:::REPLACE_WITH_BUCKET_NAME',
      'arn:aws:s3:::REPLACE_WITH_BUCKET_NAME/*',
    ],
    conditions: { 'aws:RequestedRegion': 'us-east-1,us-west-2,eu-west-1' },
  },
  'lambda-rds-reader': {
    actions: ['rds-db:connect'],
    resources: ['arn:aws:rds-db:REGION:ACCOUNT_ID:dbuser:CLUSTER_RESOURCE_ID/USERNAME'],
    conditions: { 'aws:RequestedRegion': 'us-east-1,us-west-2,eu-west-1' },
  },
  'lambda-secrets': {
    actions: ['secretsmanager:GetSecretValue'],
    resources: ['arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:REPLACE_WITH_SECRET_NAME-*'],
    conditions: { 'aws:RequestedRegion': 'us-east-1,us-west-2,eu-west-1' },
  },
  'api-gateway-invoker': {
    actions: ['lambda:InvokeFunction'],
    resources: ['arn:aws:lambda:REGION:ACCOUNT_ID:function:REPLACE_WITH_FUNCTION_NAME'],
    conditions: { 'aws:RequestedRegion': 'us-east-1,us-west-2,eu-west-1' },
  },
  'cloudwatch-logger': {
    actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: ['arn:aws:logs:*:ACCOUNT_ID:log-group:/aws/lambda/*'],
    conditions: { 'aws:RequestedRegion': 'us-east-1,us-west-2,eu-west-1' },
  },
};

const ADMIN_PREFIXES = ['iam:', 'organizations:', 'billing:', 'support:', 'account:'];
const REGION_CONDITION = 'us-east-1,us-west-2,eu-west-1';

function pruneActions(actions: string[]): string[] {
  // Remove wildcard and admin actions, return remaining
  return actions.filter(a => {
    if (a === '*') return false;
    if (a.endsWith(':*')) return false;
    if (ADMIN_PREFIXES.some(p => a.toLowerCase().startsWith(p))) return false;
    return true;
  });
}

export function suggestLeastPrivilege(currentActions: string[], useCase: string): MinimalPolicy {
  const preset = PRESETS[useCase];

  if (preset) {
    const original = currentActions.length;
    const suggested = preset.actions.length;
    const pct = original > 0 ? Math.round(((original - suggested) / original) * 100) : 0;

    return {
      useCase,
      suggestedActions: preset.actions,
      suggestedResources: preset.resources,
      rationale: original > 0
        ? `Reduced from ${original} actions to ${suggested} (${pct}% reduction). ` +
          `Preset "${useCase}" provides the minimum permissions needed. ` +
          `Replace placeholder ARNs with your specific resource identifiers.`
        : `Preset "${useCase}" provides the minimum permissions for this use case. ` +
          `Replace placeholder ARNs with your specific resource identifiers.`,
    };
  }

  // No matching preset — prune wildcards and admin actions
  const pruned = pruneActions(currentActions);
  const removed = currentActions.length - pruned.length;

  return {
    useCase,
    suggestedActions: pruned.length > 0 ? pruned : ['<specify-required-actions>'],
    suggestedResources: ['<specify-resource-arns>'],
    rationale: removed > 0
      ? `Removed ${removed} wildcard/admin action(s). ` +
        `Remaining ${pruned.length} actions need resource ARN scoping. ` +
        `Consider using a preset: ${Object.keys(PRESETS).join(', ')}. ` +
        `Add aws:RequestedRegion condition: "${REGION_CONDITION}".`
      : `No matching preset for "${useCase}". ` +
        `Scope each action to specific resource ARNs. ` +
        `Add aws:RequestedRegion condition: "${REGION_CONDITION}".`,
  };
}

export const SuggestMinimalInputSchema = {
  currentActions: z.array(z.string()).describe('Current IAM actions that need to be minimized'),
  useCase: z.string().describe(
    'Use case identifier. Built-in presets: lambda-s3-writer, lambda-rds-reader, ' +
    'lambda-secrets, api-gateway-invoker, cloudwatch-logger'
  ),
};
