import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { fakeLlm } from '../../core/testing';
import { SYSTEM_DESIGN_CANVAS } from './definition';
import { coachedSubmission, sampleCriteria, sampleSubmission } from './testing';

const GOAL = '# Serve an order history\n\nShoppers see their past orders; two sources feed them.';

/** What every critic sample says: one confirmed defect at the history service, naming the latency target. */
const findings = {
  findings: [
    {
      type: 'unhandled_failure',
      severity: 'high',
      confidence: 'high',
      fixability: 'fixable_local',
      locationRefs: ['node.3', 'edge.3'],
      criterionIds: ['c4'],
      rationale:
        'every read hits the primary; when it fails over, the 300 ms target is gone with it',
    },
  ],
};

/** Two evaluators, two rubrics: the fake answers each by the criterion ids its schema locks to. */
const requirementResults = {
  results: [
    {
      criterionId: 'c1',
      result: 'pass',
      confidence: 'high',
      locationRefs: ['binding.1'],
      rationale: 'the path is drawn',
    },
    {
      criterionId: 'c2',
      result: 'partial',
      confidence: 'medium',
      locationRefs: ['binding.2'],
      rationale: 'refunds are not walked',
    },
    {
      criterionId: 'c3',
      result: 'fail',
      confidence: 'high',
      locationRefs: ['binding.3'],
      rationale: 'nothing dedupes a re-polled batch',
    },
    {
      criterionId: 'c6',
      result: 'pass',
      confidence: 'high',
      locationRefs: ['binding.6'],
      rationale: 'only the importer touches the POS',
    },
  ],
  advisoryVerdict: 'revise',
};

const qualityResults = {
  results: [
    {
      criterionId: 'c4',
      result: 'fail',
      confidence: 'high',
      locationRefs: ['node.3'],
      rationale: 'no replica on the read path',
    },
    {
      criterionId: 'c5',
      result: 'partial',
      confidence: 'medium',
      locationRefs: ['binding.5'],
      rationale: 'four instances, no headroom',
    },
  ],
  advisoryVerdict: 'revise',
};

const canned = [findings, requirementResults, qualityResults, coachedSubmission()];

describe('the system-design-canvas loop', () => {
  it('[QL-21] a provided canvas is judged in one iteration against the supplied rubric, and nothing is derived', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 1 },
      { llm: fakeLlm(...canned), sink: (exchange) => exchanges.push(exchange), now: () => 0 },
    );

    expect(trace.contract.criteria.map((criterion) => criterion.id)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
    ]);
    const scopes = new Set(exchanges.map((exchange) => exchange.scope));
    expect(scopes.has('criteria')).toBe(false);
    expect(scopes.has('producer')).toBe(false);
    // Seven lenses, two samples each — every one attributed.
    expect(exchanges).toHaveLength(14);

    expect(trace.iterations).toHaveLength(1);
    const [only] = trace.iterations;
    expect(only.mode).toBe('provided');
    expect(only.validation.every((report) => report.problems.length === 0)).toBe(true);
    expect(only.ledger.findings.map((finding) => finding.key)).toEqual([
      'unhandled_failure|edge.3,node.3',
    ]);
    expect(only.ledger.findings[0].lenses).toEqual([
      'critic.requirements',
      'critic.architecture',
      'critic.scale',
      'critic.explanation',
      'critic.scenarios',
    ]);
    expect(only.ledger.findings[0].rationale).toContain('300 ms');
    expect(
      Object.fromEntries(only.ledger.criteria.map((row) => [row.criterionId, row.result])),
    ).toEqual({ c1: 'pass', c2: 'partial', c3: 'fail', c4: 'fail', c5: 'partial', c6: 'pass' });
    expect(only.decision.finalDecision).toBe('revise');
    expect(trace.stopReason).toBe('max-iterations');
  });

  it('[QL-21] coached, the revision keeps every author id and prefixes what it adds with ai-', async () => {
    const trace = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 2 },
      { llm: fakeLlm(...canned), sink: () => undefined, now: () => 0 },
    );

    expect(trace.iterations.map((iteration) => iteration.mode)).toEqual(['provided', 'revise']);
    const revised = trace.iterations[1].artifact;
    if (revised === null) throw new Error('the coach must answer');
    expect(trace.iterations[1].validation.every((report) => report.problems.length === 0)).toBe(
      true,
    );
    const authored = sampleSubmission().graph;
    for (const node of authored.nodes)
      expect(revised.graph.nodes.map((n) => n.id)).toContain(node.id);
    for (const edge of authored.edges)
      expect(revised.graph.edges.map((e) => e.id)).toContain(edge.id);
    const added = [
      ...revised.graph.nodes.filter((node) => !authored.nodes.some((n) => n.id === node.id)),
      ...revised.graph.edges.filter((edge) => !authored.edges.some((e) => e.id === edge.id)),
    ];
    expect(added.length).toBeGreaterThan(0);
    for (const part of added) expect(part.id.startsWith('ai-')).toBe(true);
    // The added replica is one more location the panel can cite.
    expect(trace.iterations[1].locations.map((location) => location.id)).toContain('node.14');
  });
});
