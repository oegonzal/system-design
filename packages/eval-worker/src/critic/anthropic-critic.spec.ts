import type { CanvasGraph } from '@sysdesign/contracts';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import type { PromptFacts } from '../engine/types';
import { AnthropicCritic } from './anthropic-critic';
import type { Critique } from './critique-schema';

const graph: CanvasGraph = {
  nodes: [
    { id: 'n-client', kind: 'client', label: 'Browser' },
    { id: 'n-svc', kind: 'service', label: 'API' },
  ],
  edges: [{ id: 'e1', source: 'n-client', target: 'n-svc' }],
};

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
  nfrKinds: ['latency', 'availability'],
  nfrs: [
    {
      id: 'fst-lat-read-spike',
      kind: 'latency',
      statement: 'Reads stay fast under the spike',
      target: 'p99 ≤ 300ms',
      targetSpec: { metric: 'p99_latency_ms', op: '<=', value: 300, unit: 'ms' },
    },
    {
      id: 'fst-avail-sale-window',
      kind: 'availability',
      statement: 'The sale stays up',
      target: '≥ 99.95%',
      targetSpec: { metric: 'availability_pct', op: '>=', value: 99.95, unit: '%' },
    },
  ],
  functionalCapabilities: [],
  functionalRequirementCount: 4,
  functionalText: 'sell tickets without overselling',
  workflow: null,
};

function fakeLlm(response: Critique | null): LlmClient {
  return {
    enabled: true,
    model: 'claude-sonnet-5',
    completeStructured: <T>(_request: StructuredRequest<T>) =>
      Promise.resolve(response as T | null),
  };
}

describe('AnthropicCritic', () => {
  it('maps a critique to graded evidence, keeping grounding and dropping unknown ids', async () => {
    const critic = new AnthropicCritic(
      fakeLlm({
        summary: 'Solid start; the write path is the risk.',
        findings: [
          {
            dimension: 'data',
            severity: 'medium',
            weakness: 'high',
            confidence: 'medium',
            requirementId: 'fst-lat-read-spike',
            affectedComponents: ['n-svc', 'n-ghost'],
            title: 'Inventory decrement is not atomic',
            rationale: 'At 4000 req/s two buyers can read the same seat count.',
          },
          {
            // A requirement the prompt never made is re-checked to null.
            dimension: 'reliability',
            severity: 'low',
            weakness: 'low',
            confidence: 'low',
            requirementId: 'not-a-real-requirement',
            affectedComponents: [],
            title: 'Minor nit',
            rationale: 'A stylistic point.',
          },
        ],
      }),
    );

    const result = await critic.review({
      graph,
      facts,
      narrative: null,
      deterministicFindings: [],
    });

    expect(result.model).toBe('claude-sonnet-5');
    expect(result.summary).toContain('write path');
    expect(result.items).toHaveLength(2);
    // Ordinals carried through, grounding kept, ghost node dropped.
    expect(result.items[0]).toMatchObject({
      dimension: 'data',
      level: 'high',
      confidence: 'medium',
      severity: 'medium',
      requirementId: 'fst-lat-read-spike',
      affectedNodeIds: ['n-svc'],
    });
    expect(result.items[0]?.rationale).toContain('Inventory decrement is not atomic');
    // The inadmissible requirement is nulled rather than trusted.
    expect(result.items[1]?.requirementId).toBeNull();
  });

  it('resolves to the empty critique when the llm returns null', async () => {
    const critic = new AnthropicCritic(fakeLlm(null));
    const result = await critic.review({
      graph,
      facts,
      narrative: null,
      deterministicFindings: [],
    });
    expect(result).toEqual({ items: [], summary: null, model: null });
  });
});
