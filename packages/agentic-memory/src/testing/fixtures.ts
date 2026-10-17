/**
 * The data the runtime's specs build on: a policy with its own numbers (chosen
 * so a spec reads clearly, not copied from any deployed policy), a compact
 * strategy that keeps every kind, a record builder, and one strategy a model
 * wrote in a live run (2026-10-17), kept as found — nobody fitted the runtime
 * to it, and no code may branch on it.
 */
import { memoryStrategySchema, type MemoryStrategy } from '@sysdesign/contracts';

import type { MemoryRecord } from '../ports';
import type { MemoryPolicy } from '../space/policy';
import golden from './strategy-2026-10-17.json';

/** A value a spec expects to be there, or a failure that names what was missing. */
export function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}`);
  return value;
}

export const TEST_POLICY: MemoryPolicy = {
  scopeKeys: ['tenant', 'user'],
  terms: { short_term: { ttlSeconds: 600 }, long_term: { ttlSeconds: null } },
  recall: {
    maxItems: 5,
    maxChars: 2000,
    weights: { similarity: 0.5, exact: 0.3, recency: 0.1, support: 0.1 },
    recencyHalfLifeDays: 30,
  },
  consolidation: { minSupport: 2, promoteAt: 3 },
};

export const GOLDEN_STRATEGY: MemoryStrategy = memoryStrategySchema.parse(golden);

type Register = MemoryStrategy['registers'][number];
type Operation = MemoryStrategy['interfaces'][number]['operation'];

const register = (
  name: string,
  kind: Register['kind'],
  term: Register['term'],
  metadata: string[] = [],
): Register => ({
  name,
  kind,
  term,
  holds: `${kind} memory`,
  store: 'rows',
  scope: 'tenant, then user',
  metadata,
  lifecycle: 'as the policy declares',
});

const iface = (operation: Operation, name: string): MemoryStrategy['interfaces'][number] => ({
  operation,
  register: name,
  input: 'a request',
  output: 'an answer',
  guarantee: 'scoped',
});

const step = (operation: Operation, name: string) => ({
  operation,
  register: name,
  does: 'a step',
});

/** A strategy that keeps every kind, recalls all but its working notes, and promotes episodes to lessons to playbooks. */
export function strategyFixture(): MemoryStrategy {
  return {
    summary: 'A memory service for agents.',
    assumptions: [],
    registers: [
      register('notes', 'working', 'short_term'),
      register('facts', 'semantic', 'long_term', ['topic']),
      register('episodes', 'episodic', 'long_term', ['channel']),
      register('playbooks', 'procedural', 'long_term'),
      register('relations', 'relational', 'long_term'),
    ],
    interfaces: [
      iface('remember', 'notes'),
      iface('remember', 'facts'),
      iface('recall', 'facts'),
      iface('update', 'facts'),
      iface('invalidate', 'facts'),
      iface('remember', 'episodes'),
      iface('recall', 'episodes'),
      iface('invalidate', 'episodes'),
      iface('consolidate', 'episodes'),
      iface('recall', 'playbooks'),
      iface('consolidate', 'playbooks'),
      iface('remember', 'relations'),
      iface('recall', 'relations'),
      iface('invalidate', 'relations'),
    ],
    workflows: [
      {
        name: 'answer a question',
        kind: 'recall_routing',
        steps: [
          step('recall', 'facts'),
          step('recall', 'episodes'),
          step('recall', 'playbooks'),
          step('recall', 'relations'),
        ],
      },
      {
        name: 'learn from what happened',
        kind: 'consolidation_promotion',
        steps: [
          step('consolidate', 'episodes'),
          step('remember', 'facts'),
          step('consolidate', 'playbooks'),
        ],
      },
    ],
    safeguards: [],
    tradeoffs: [],
    risks: [],
  };
}

const AT = new Date('2026-10-01T00:00:00.000Z');

/** A current semantic record; a spec overrides what it is about. The lineage is the record's own id unless named. */
export function recordFixture(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  const id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  return {
    id,
    spaceId: 'space-under-test',
    register: 'facts',
    kind: 'semantic',
    partition: 't1',
    scope: { tenant: 't1' },
    identity: '["acme","language"]',
    keys: ['acme'],
    body: { subject: 'acme', predicate: 'language', value: 'TypeScript', validFrom: null },
    metadata: {},
    text: 'acme — language: TypeScript',
    contentHash: 'a'.repeat(64),
    status: 'active',
    version: 1,
    supersedesId: null,
    lineageId: id,
    validFrom: AT,
    validTo: null,
    recordedAt: AT,
    expiresAt: null,
    closedAt: null,
    closeReason: null,
    support: 1,
    provenance: { source: 'spec', sourceRunId: null, derivedFrom: [] },
    projectedInto: null,
    ...overrides,
  };
}
