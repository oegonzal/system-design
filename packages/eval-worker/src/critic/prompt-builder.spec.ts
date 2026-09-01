import type { CanvasGraph } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { PromptFacts } from '../engine/types';
import { buildCriticUserPrompt, CRITIC_SYSTEM_PROMPT } from './prompt-builder';

const facts: PromptFacts = {
  archetype: 'flash-sale-ticketing',
  difficulty: 'standard',
  scaleTargets: {
    concurrentUsers: 10000,
    requestsPerSecond: 4000,
    readWriteRatio: '80:20',
    p99LatencyMs: 300,
    availabilityPct: '99.95',
  },
  nfrKinds: ['latency'],
  nfrs: [
    {
      id: 'fst-lat-read-spike',
      kind: 'latency',
      statement: 'Reads stay fast under the spike',
      target: 'p99 ≤ 300ms',
      targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 300, unit: 'ms' },
    },
  ],
  functionalText: 'sell tickets without overselling',
};

function build(graph: CanvasGraph, narrative: string | null = null): string {
  return buildCriticUserPrompt({ graph, facts, narrative, deterministicFindings: [] });
}

describe('buildCriticUserPrompt', () => {
  it('serializes declared roles, operations and carries onto their lines', () => {
    const prompt = build({
      nodes: [
        {
          id: 'n-svc',
          kind: 'service',
          label: 'Orders',
          responsibilities: ['owns orders', 'publishes events'],
          operations: [
            { name: 'placeOrder', kind: 'command', idempotent: true, notes: 'checks stock' },
            { name: 'getOrder', kind: 'query' },
            { name: 'cancelOrder', kind: 'command', idempotent: false },
          ],
        },
      ],
      edges: [{ id: 'e1', source: 'n-svc', target: 'n-svc', carries: ['placeOrder', 'getOrder'] }],
    });

    expect(prompt).toContain(' roles=[owns orders|publishes events]');
    expect(prompt).toContain(
      ' ops=[command placeOrder idem (checks stock); query getOrder; command cancelOrder non-idem]',
    );
    expect(prompt).toContain(' carries=[placeOrder,getOrder]');
  });

  it('marks idempotency only when the author stated it either way', () => {
    const prompt = build({
      nodes: [
        {
          id: 'n-svc',
          kind: 'service',
          label: 'Orders',
          operations: [{ name: 'getOrder', kind: 'query' }],
        },
      ],
      edges: [],
    });

    expect(prompt).toContain(' ops=[query getOrder]');
    expect(prompt).not.toContain('idem');
  });

  it('clips long notes to 60 chars', () => {
    const longNotes = 'x'.repeat(80);
    const prompt = build({
      nodes: [
        {
          id: 'n-svc',
          kind: 'service',
          label: 'Orders',
          operations: [{ name: 'placeOrder', kind: 'command', notes: longNotes }],
        },
      ],
      edges: [],
    });

    expect(prompt).toContain(`(${'x'.repeat(60)}…)`);
    expect(prompt).not.toContain('x'.repeat(61));
  });

  it('elides beyond eight operations with a …+N more marker', () => {
    const operations = Array.from({ length: 9 }, (_, index) => ({
      name: `op${index + 1}`,
      kind: 'command' as const,
    }));
    const prompt = build({
      nodes: [{ id: 'n-svc', kind: 'service', label: 'Orders', operations }],
      edges: [],
    });

    expect(prompt).toContain('command op8; …+1 more]');
    expect(prompt).not.toContain('op9');
  });

  it('carries the design narrative into the shared document', () => {
    const canvas: CanvasGraph = {
      nodes: [{ id: 'n-svc', kind: 'service', label: 'Orders' }],
      edges: [],
    };
    const prompt = build(canvas, 'Orders owns the write path.');
    expect(prompt).toContain("# Design narrative (the author's own explanation)");
    expect(prompt).toContain('Orders owns the write path.');
    expect(build(canvas)).not.toContain('# Design narrative');
  });

  it('leaves undeclared nodes and edges in the original format', () => {
    const prompt = build({
      nodes: [{ id: 'n-db', kind: 'database', label: 'Orders DB', config: { replicas: 2 } }],
      edges: [{ id: 'e1', source: 'n-db', target: 'n-db', label: 'writes' }],
    });

    expect(prompt).toContain('  node n-db kind=database label="Orders DB" config={"replicas":2}');
    expect(prompt).toContain('  edge e1: n-db -> n-db (sync) label="writes"');
    expect(prompt).not.toContain('roles=');
    expect(prompt).not.toContain('ops=');
    expect(prompt).not.toContain('carries=');
  });
});

describe('CRITIC_SYSTEM_PROMPT', () => {
  it('tells the critic to grade against the declared interface contracts', () => {
    expect(CRITIC_SYSTEM_PROMPT).toContain('interface contracts');
    expect(CRITIC_SYSTEM_PROMPT).toContain('responsibilities, operations and carries');
  });

  it('tells the critic to judge the API design when operations are declared', () => {
    expect(CRITIC_SYSTEM_PROMPT).toContain('also judge the API design itself');
    expect(CRITIC_SYSTEM_PROMPT).toContain('operation granularity');
    expect(CRITIC_SYSTEM_PROMPT).toContain('idempotency choices');
  });

  it('leaves story-diagram alignment to the dedicated narrative critic', () => {
    expect(CRITIC_SYSTEM_PROMPT).toContain('leave');
    expect(CRITIC_SYSTEM_PROMPT).toContain('story-diagram alignment to it');
    expect(CRITIC_SYSTEM_PROMPT).not.toContain('cross-examine it against the diagram');
  });
});
