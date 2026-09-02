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
  it('maps a critique and drops node ids the graph does not contain', async () => {
    const critic = new AnthropicCritic(
      fakeLlm({
        summary: 'Solid start; the write path is the risk.',
        findings: [
          {
            dimension: 'data',
            severity: 'medium',
            title: 'Inventory decrement is not atomic',
            message: 'At 4000 req/s two buyers can read the same seat count.',
            affectedNodeIds: ['n-svc', 'n-ghost'],
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
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.affectedNodeIds).toEqual(['n-svc']);
  });

  it('resolves to the empty critique when the llm returns null', async () => {
    const critic = new AnthropicCritic(fakeLlm(null));
    const result = await critic.review({
      graph,
      facts,
      narrative: null,
      deterministicFindings: [],
    });
    expect(result).toEqual({ findings: [], summary: null, model: null });
  });
});
