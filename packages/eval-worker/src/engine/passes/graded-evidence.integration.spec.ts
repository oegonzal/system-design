/**
 * End-to-end proof of the graded path on the REAL order-history prompt: all
 * five actual LLM passes, wired to a fake model that returns grounded
 * weaknesses, lower the actual deterministic score through the engine's generic
 * scorer — weakness-only, bounded, and grounded to real `ohi-*` / workflow ids.
 * No live model, so it is reproducible; it is the regression guard the live
 * smoke cannot be. [EVAL-16] [EVAL-17]
 */
import { EVAL_DIMENSIONS, type EvalDimension } from '@sysdesign/contracts';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';
import { NoopLlmClient } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import type { Critique } from '../../critic/critique-schema';
import { runEvaluation } from '../core/orchestrator';
import { createPassRegistry } from '../passes';
import { DEFAULT_PROFILE } from '../profiles/default.profile';
import { edge, graph, node, orderHistoryFacts } from '../testing';
import type { DepthCritique } from './depth/depth-schema';
import type { NarrativeCritique } from './narrative/narrative-schema';
import type { ScenarioCritique } from './scenarios/scenario-schema';
import type { WorkabilityCritique } from './workability/workability-schema';

/** A plausible order-history design — enough real nodes for several dimensions to earn a baseline. */
const canvas = graph(
  [
    node('n-gw', 'gateway', { label: 'API gateway' }),
    node('n-svc', 'service', { label: 'Order service' }),
    node('n-db', 'database', { label: 'Orders DB' }),
    node('n-cache', 'cache', { label: 'Read cache' }),
    node('n-queue', 'queue', { label: 'Ingest queue' }),
    node('n-worker', 'worker', { label: 'Indexer' }),
  ],
  [
    edge('e1', 'n-gw', 'n-svc'),
    edge('e2', 'n-svc', 'n-db'),
    edge('e3', 'n-svc', 'n-cache'),
    edge('e4', 'n-queue', 'n-worker'),
    edge('e5', 'n-worker', 'n-db'),
  ],
);

const facts = orderHistoryFacts();

const workabilityResponse: WorkabilityCritique = {
  factors: {
    objectiveAlignment: { level: 'medium', rationale: 'The read model serves the account page.' },
    completeness: { level: 'low', rationale: 'Disputes and partial refunds are unmodelled.' },
    feasibility: { level: 'low', rationale: 'The webhook path is not idempotent.' },
    risk: { level: 'high', rationale: 'A Shopify retry double-indexes an order.' },
    futureGain: { level: 'medium', rationale: 'The event stream leaves room for consumers.' },
  },
  weaknesses: [
    {
      requirementId: 'ing-shopify-webhooks',
      factor: 'feasibility',
      weakness: 'high',
      confidence: 'high',
      affectedComponents: ['n-worker'],
      rationale: 'No idempotency guard; a webhook retry double-indexes the order.',
    },
  ],
  summary: 'Make the ingest path idempotent before anything else.',
};

const depthResponse: DepthCritique = {
  depthScore: 55,
  subScores: {
    tradeoffArticulation: 50,
    bottleneckAwareness: 60,
    failureDesign: 45,
    dataFlowClarity: 65,
    contractQuality: 55,
  },
  weaknesses: [
    {
      dimension: 'reliability',
      severity: 'medium',
      weakness: 'medium',
      confidence: 'high',
      requirementId: 'ohi-avail-history',
      affectedComponents: ['n-db'],
      rationale: 'A single orders DB with no failover story is a box, not a mechanism.',
    },
  ],
  summary: 'Deepen the failure design.',
};

const narrativeResponse: NarrativeCritique = {
  score: 60,
  subScores: {
    componentClarity: 60,
    flowStory: 65,
    requirementCoverage: 55,
    diagramConsistency: 60,
  },
  summary: 'Tie the ingest story to the freshness target.',
  findings: [
    {
      severity: 'medium',
      weakness: 'medium',
      confidence: 'high',
      requirementId: 'ohi-fresh-online',
      affectedComponents: ['n-worker'],
      title: 'The story promises real-time indexing the diagram batches',
      message: '"orders appear instantly" — the worker drains a queue with no stated latency.',
    },
  ],
};

const scenariosResponse: ScenarioCritique = {
  reports: [
    {
      scenarioId: 'webhook-replay',
      verdict: 'fails',
      story: 'A replayed webhook double-indexes the order.',
      weakestNodeIds: ['n-worker'],
      violatesRequirementId: 'ohi-con-no-dupes',
      confidence: 'high',
    },
  ],
};

/** Routes each pass to its canned response by its system prompt; null → the pass degrades to a diagnostic. */
function dispatchingLlm(criticResponse: Critique): LlmClient {
  const byPrompt: Array<[string, unknown]> = [
    ['reviewing a system-design exercise', criticResponse],
    ['product-minded principal engineer', workabilityResponse],
    ['grading the DEPTH', depthResponse],
    ['grading the DESIGN NARRATIVE', narrativeResponse],
    ['adversarial reviewer stress-testing', scenariosResponse],
  ];
  return {
    enabled: true,
    model: 'test-model',
    completeStructured: <T>(request: StructuredRequest<T>) => {
      const match = byPrompt.find(([marker]) => request.system.includes(marker));
      return Promise.resolve((match?.[1] ?? null) as T | null);
    },
  };
}

describe('graded evidence end-to-end on order-history', () => {
  it('[EVAL-17] all five real LLM passes lower the real score, grounded and bounded', async () => {
    const base = {
      graph: canvas,
      facts,
      // A narrative, so the narrative lens has something to grade.
      narrative:
        'The gateway fronts the order service, which reads the orders DB through a cache. Webhooks land on the ingest queue and the indexer writes them into the DB.',
      profile: DEFAULT_PROFILE,
      registry: createPassRegistry(),
    };

    const baseline = await runEvaluation({ ...base, llm: new NoopLlmClient() });

    // Target the critic at a dimension the deterministic layer actually assessed
    // with headroom, so the drop is observable rather than clamped at 0.
    const target = EVAL_DIMENSIONS.find(
      (dimension) => (baseline.result.dimensionScores[dimension] ?? 0) > 5,
    );
    expect(target).toBeDefined();
    const criticResponse: Critique = {
      summary: 'The write path is the risk; retries can double-apply.',
      findings: [
        {
          dimension: target as EvalDimension,
          severity: 'high',
          weakness: 'high',
          confidence: 'high',
          requirementId: 'ohi-con-no-dupes',
          affectedComponents: ['n-db'],
          title: 'Non-idempotent write path',
          rationale: 'A retried checkout can double-apply against the orders table at this scale.',
        },
      ],
    };

    const graded = await runEvaluation({ ...base, llm: dispatchingLlm(criticResponse) });

    // Every lens emitted grounded evidence…
    expect(graded.result.gradedEvidence.map((artifact) => artifact.lens).sort()).toEqual([
      'critic',
      'critic.narrative',
      'evaluator.depth',
      'evaluator.scenarios',
      'evaluator.workability',
    ]);
    // …grounded to real prompt requirements, not invented ids.
    const grounded = graded.result.gradedEvidence.flatMap((artifact) =>
      artifact.items.map((item) => item.requirementId),
    );
    for (const id of [
      'ohi-con-no-dupes',
      'ing-shopify-webhooks',
      'ohi-avail-history',
      'ohi-fresh-online',
    ]) {
      expect(grounded).toContain(id);
    }
    // No free-form findings path survives: the only llm-source material is graded.
    expect(graded.artifacts.some((artifact) => (artifact.kind as string) === 'annotations')).toBe(
      false,
    );

    // Weakness-only and bounded: no dimension rose, the overall did not rise,
    // and the targeted dimension strictly dropped.
    for (const dimension of EVAL_DIMENSIONS) {
      const before = baseline.result.dimensionScores[dimension];
      const after = graded.result.dimensionScores[dimension];
      if (before !== null && after !== null) expect(after).toBeLessThanOrEqual(before);
    }
    expect(graded.result.overallScore).toBeLessThanOrEqual(baseline.result.overallScore);
    expect(graded.result.dimensionScores[target as EvalDimension]).toBeLessThan(
      baseline.result.dimensionScores[target as EvalDimension] as number,
    );

    // Graded evidence never introduces a letter cap — caps read deterministic evidence only.
    expect(graded.result.capApplied).toEqual(baseline.result.capApplied);
  });
});
