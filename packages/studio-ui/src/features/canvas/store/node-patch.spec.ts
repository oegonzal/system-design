import { describe, expect, it } from 'vitest';

import { patchedNodeData } from './node-patch';

describe('patchedNodeData', () => {
  it('[UX-31] naming a service keeps a kind the service plays and takes its first role otherwise', () => {
    expect(patchedNodeData({ kind: 'cache', label: 'Hot' }, { service: 'aws.sqs' })).toEqual({
      kind: 'queue',
      service: 'aws.sqs',
      label: 'Hot',
    });
    expect(
      patchedNodeData({ kind: 'worker', label: 'Indexer' }, { service: 'aws.lambda' }),
    ).toEqual({ kind: 'worker', service: 'aws.lambda', label: 'Indexer' });
  });

  it('[UX-31] changing the kind to a role the named service does not play takes the service off; to one it plays keeps it', () => {
    const lambda = {
      kind: 'serverless-function' as const,
      service: 'aws.lambda' as const,
      label: 'Fn',
    };
    expect(patchedNodeData(lambda, { kind: 'worker' })).toEqual({ ...lambda, kind: 'worker' });
    expect(patchedNodeData(lambda, { kind: 'database' })).toEqual({
      kind: 'database',
      label: 'Fn',
    });
  });

  it('[UX-31] `service: null` takes the service off and leaves the kind; other fields pass through', () => {
    const sqs = { kind: 'queue' as const, service: 'aws.sqs' as const, label: 'Events' };
    expect(patchedNodeData(sqs, { service: null })).toEqual({ kind: 'queue', label: 'Events' });
    expect(
      patchedNodeData(sqs, { label: 'Orders', config: [{ key: 'dlq', value: true }] }),
    ).toEqual({
      ...sqs,
      label: 'Orders',
      config: [{ key: 'dlq', value: true }],
    });
  });
});
