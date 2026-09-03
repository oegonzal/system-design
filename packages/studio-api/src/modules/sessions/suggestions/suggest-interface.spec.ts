import type { CanvasGraph, NfrItem } from '@sysdesign/contracts';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';
import { NoopLlmClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { WORKFLOW_SPECS } from '../../prompts/generator/workflow-specs';
import { suggestInterface } from './suggest-interface';

const spec = WORKFLOW_SPECS['order-history-integration']('standard');

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Account page' },
    { id: 'n-2', kind: 'gateway', label: 'Gateway' },
    {
      id: 'n-3',
      kind: 'service',
      label: 'Orders API',
      config: { replicas: 2 },
      responsibilities: ['serves order history'],
      operations: [{ name: 'listOrders', kind: 'query', fulfills: 'op-list-orders' }],
    },
    { id: 'n-4', kind: 'database', label: 'Orders' },
    { id: 'n-5', kind: 'queue', label: 'Ingest' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    { id: 'e-3', source: 'n-3', target: 'n-4', kind: 'sync' },
  ],
};

const nfrs: NfrItem[] = [
  { id: 'ohi-lat-history-read', kind: 'latency', statement: 'History loads fast' },
];

const input = {
  graph,
  nodeId: 'n-3',
  spec,
  nfrs,
  functionalRequirements: ['Show a customer their orders'],
  narrative: null,
};

/** Captures the request so the schema and prompt can be asserted on. */
function fakeLlm(response: unknown) {
  const seen: StructuredRequest<unknown>[] = [];
  const client: LlmClient = {
    enabled: true,
    model: 'claude-test',
    completeStructured: <T>(request: StructuredRequest<T>) => {
      seen.push(request as StructuredRequest<unknown>);
      return Promise.resolve(response as T | null);
    },
  };
  return { client, seen };
}

describe('suggestInterface', () => {
  it('returns nothing without a model, which is the deterministic answer', async () => {
    await expect(suggestInterface(new NoopLlmClient(), input)).resolves.toEqual([]);
  });

  it('returns nothing for an unknown node or one with nothing to declare, without a prompt', async () => {
    const { client, seen } = fakeLlm({});
    await expect(suggestInterface(client, { ...input, nodeId: 'n-ghost' })).resolves.toEqual([]);
    // A client has no interface, no knobs and no responsibilities.
    await expect(suggestInterface(client, { ...input, nodeId: 'n-1' })).resolves.toEqual([]);
    expect(seen).toHaveLength(0);
  });

  it('[UX-14] enum-locks the schema to what THIS component may declare', async () => {
    const { client, seen } = fakeLlm({});
    await suggestInterface(client, input);
    const schema = seen[0]?.schema;
    expect(schema).toBeDefined();
    if (!schema) return;
    // Every applicable section must be answered, even with nothing — so the
    // model considers each; a partial answer is a schema miss.
    const answer = (partial: Record<string, unknown>) => ({
      operations: [],
      config: [],
      responsibilities: [],
      ...partial,
    });
    expect(schema.safeParse({ operations: [] }).success).toBe(false);

    const okOp = {
      name: 'getOrder',
      kind: 'query',
      idempotent: true,
      fulfills: 'op-get-order',
      emits: [],
      rationale: 'The account page opens one order.',
    };
    expect(schema.safeParse(answer({ operations: [okOp] })).success).toBe(true);
    // A service serves commands and queries — never events.
    expect(schema.safeParse(answer({ operations: [{ ...okOp, kind: 'event' }] })).success).toBe(
      false,
    );
    // A workflow item the prompt never declared is unrepresentable…
    expect(
      schema.safeParse(answer({ operations: [{ ...okOp, fulfills: 'op-not-in-spec' }] })).success,
    ).toBe(false);
    // …as is a knob a service does not offer, or a value outside a knob's domain.
    expect(
      schema.safeParse(answer({ config: [{ key: 'sharding', value: 'hash', rationale: 'x' }] }))
        .success,
    ).toBe(false);
    expect(
      schema.safeParse(answer({ config: [{ key: 'replicas', value: 500, rationale: 'x' }] }))
        .success,
    ).toBe(false);
    expect(
      schema.safeParse(answer({ config: [{ key: 'autoscaling', value: true, rationale: 'x' }] }))
        .success,
    ).toBe(true);
  });

  it('hands the model the vocabulary — never a grading predicate', async () => {
    const { client, seen } = fakeLlm({});
    await suggestInterface(client, input);
    const user = seen[0]?.user ?? '';
    expect(user).toContain('n-3 — Orders API (service, interface role: api)');
    expect(user).toContain('op-get-order');
    expect(user).toContain('autoscaling — Autoscaling');
    expect(user).not.toMatch(/MECHANISM_EVIDENCE|judge|corroborat/i);
  });

  it('keeps what the editor could accept and drops the rest, one item at a time', async () => {
    const { client } = fakeLlm({
      operations: [
        // Admissible: a new query grounded to an item a query may claim.
        {
          name: 'getOrder',
          kind: 'query',
          idempotent: true,
          fulfills: 'op-get-order',
          emits: ['evt-order-indexed'], // a query never emits — stripped, not rejected
          rationale: 'Opens one order.',
        },
        // Duplicate of a declared operation name.
        {
          name: 'listOrders',
          kind: 'query',
          idempotent: true,
          fulfills: null,
          emits: [],
          rationale: 'dup',
        },
        // A command cannot fulfill a query item: the per-kind rule nulls the grounding.
        {
          name: 'resync',
          kind: 'command',
          idempotent: false,
          fulfills: 'op-get-order',
          emits: [],
          rationale: 'Wrong kind for that item.',
        },
      ],
      config: [
        { key: 'autoscaling', value: true, rationale: 'Bursty reads.' },
        { key: 'replicas', value: 2, rationale: 'already set — not a suggestion' },
      ],
      responsibilities: [
        { text: 'serves order history', rationale: 'already declared' },
        { text: 'owns order read model', rationale: 'The API is the read side.' },
      ],
    });

    const proposals = await suggestInterface(client, input);
    expect(proposals.map((proposal) => proposal.id)).toEqual([
      'proposal-0',
      'proposal-1',
      'proposal-2',
      'proposal-3',
    ]);
    expect(proposals[0]).toMatchObject({
      kind: 'operation',
      operation: { name: 'getOrder', kind: 'query', idempotent: true, fulfills: 'op-get-order' },
    });
    expect(
      proposals[0]?.kind === 'operation' ? proposals[0].operation.emits : 'wrong',
    ).toBeUndefined();
    // The mis-grounded command survives WITHOUT its grounding, not as a false claim.
    expect(proposals[1]).toMatchObject({ kind: 'operation', operation: { name: 'resync' } });
    expect(
      proposals[1]?.kind === 'operation' ? proposals[1].operation.fulfills : 'wrong',
    ).toBeUndefined();
    expect(proposals[2]).toMatchObject({ kind: 'config', key: 'autoscaling', value: true });
    expect(proposals[3]).toMatchObject({ kind: 'responsibility', text: 'owns order read model' });
  });
});
