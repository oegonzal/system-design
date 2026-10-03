import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import {
  BINDING_CLAIM_BOUND,
  repairSubmission,
  type CanvasEdge,
  type DesignSubmission,
} from '@sysdesign/contracts';

import { runPipeline } from '../../core/loop/run-pipeline';
import { fakeLlm, sequencedLlm } from '../../core/testing';
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

/** What a coach might return: a criterion it invented, a criterion bound twice, and a path that fans out. */
const sloppyCoached = (): DesignSubmission => {
  const coached = coachedSubmission();
  const first = coached.brief?.bindings[0];
  if (!first || !coached.brief) throw new Error('the fixture binds c1');
  return {
    ...coached,
    brief: {
      version: 1,
      bindings: [
        ...coached.brief.bindings.map((binding) =>
          binding.criterionId === 'c2'
            ? // edge-1 does not start where edge-9 ends: a fan-out tacked onto the walk.
              { ...binding, path: [...(binding.path ?? []), 'edge-1'] }
            : binding,
        ),
        {
          criterionId: 'c99',
          nodeIds: ['service-1'],
          claim: 'a criterion the rubric never listed',
        },
        { ...first, claim: 'bound twice' },
      ],
    },
  };
};

/** A coach revision the repair cannot save: an edge to a node that is not drawn. */
const brokenCoached = (): DesignSubmission => {
  const coached = coachedSubmission();
  const dangling: CanvasEdge = {
    id: 'ai-edge-9',
    source: 'service-1',
    target: 'nowhere',
    kind: 'sync',
  };
  return { ...coached, graph: { ...coached.graph, edges: [...coached.graph.edges, dangling] } };
};

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

  it('[QL-25] a coach revision that binds an unlisted criterion, binds one twice or breaks a path is repaired before judging — the author’s own submission never is', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 2 },
      {
        llm: fakeLlm(findings, requirementResults, qualityResults, sloppyCoached()),
        sink: (exchange) => exchanges.push(exchange),
        now: () => 0,
      },
    );

    const [, revised] = trace.iterations;
    expect(revised.validation.every((report) => report.problems.length === 0)).toBe(true);
    expect(revised.decision.reason).not.toContain('blocked');
    expect(revised.locations.length).toBeGreaterThan(0);
    const artifact = revised.artifact;
    if (artifact === null || artifact.brief === null) throw new Error('the coach must answer');
    const bound = artifact.brief.bindings.map((binding) => binding.criterionId);
    expect(bound).not.toContain('c99');
    expect(bound.filter((id) => id === 'c1')).toHaveLength(1);
    expect(artifact.brief.bindings.find((b) => b.criterionId === 'c2')?.path).toEqual([
      'edge-4',
      'edge-5',
      'edge-8',
      'edge-9',
    ]);
    // What is judged is what is stored: the repair is idempotent on it.
    expect(repairSubmission(artifact, sampleCriteria())).toEqual(artifact);
    // The coach was briefed with the criteria and their ids.
    const briefing = exchanges.find((exchange) => exchange.scope === 'producer');
    expect(briefing?.user).toContain('# Success criteria');
    expect(briefing?.user).toContain('- c1 [functional]');

    const author = sampleSubmission();
    author.brief?.bindings.push({ criterionId: 'c99', nodeIds: ['service-1'], claim: 'mine' });
    const judged = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: author, criteria: sampleCriteria(), maxIterations: 1 },
      { llm: fakeLlm(...canned), sink: () => undefined, now: () => 0 },
    );
    expect(judged.iterations[0].artifact).toEqual(author);
    expect(
      judged.iterations[0].validation.find((report) => report.validatorId === 'references')
        ?.problems,
    ).toEqual([expect.objectContaining({ message: 'binding references unknown criterion: c99' })]);
  });

  it('[QL-47] a coach revision with a claim past its ceiling is still repaired before judging, and one with an edge to nowhere still blocks', async () => {
    // Past the ceiling and short of the cut: the seam keeps it whole, so the repair and `references` must read it whole too.
    const long = 'x'.repeat(BINDING_CLAIM_BOUND.ceiling + 105);
    const wordy = (coached: DesignSubmission): DesignSubmission => {
      if (!coached.brief) throw new Error('the fixture has a brief');
      const [first, ...rest] = coached.brief.bindings;
      return { ...coached, brief: { version: 1, bindings: [{ ...first, claim: long }, ...rest] } };
    };
    const revise = async (coached: DesignSubmission) =>
      (
        await runPipeline(
          SYSTEM_DESIGN_CANVAS,
          { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 2 },
          {
            llm: fakeLlm(findings, requirementResults, qualityResults, coached),
            sink: () => undefined,
            now: () => 0,
          },
        )
      ).iterations[1];
    const problemsOf = (
      iteration: { validation: { validatorId: string; problems: { message: string }[] }[] },
      id: string,
    ) =>
      iteration.validation
        .find((report) => report.validatorId === id)
        ?.problems.map((p) => p.message);

    const repaired = await revise(wordy(sloppyCoached()));
    expect(problemsOf(repaired, 'references')).toEqual([]);
    const bindings = repaired.artifact?.brief?.bindings ?? [];
    expect(bindings.map((binding) => binding.criterionId)).not.toContain('c99');
    expect(bindings.filter((binding) => binding.criterionId === 'c1')).toEqual([
      expect.objectContaining({ claim: long }),
    ]);

    const blocked = await revise(wordy(brokenCoached()));
    expect(problemsOf(blocked, 'references')).toEqual([
      'edge ai-edge-9 references unknown target node: nowhere',
    ]);
    expect(blocked.decision.reason).toContain('blocked by validator(s) references');
  });

  it('[QL-25] after a revision `references` refused, the coach is told why before it revises again', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 3 },
      {
        llm: sequencedLlm(
          findings,
          requirementResults,
          qualityResults,
          brokenCoached(),
          coachedSubmission(),
        ),
        sink: (exchange) => exchanges.push(exchange),
        now: () => 0,
      },
    );

    expect(trace.iterations.map((iteration) => iteration.decision.finalDecision)).toEqual([
      'revise',
      'revise',
      'revise',
    ]);
    expect(trace.iterations[1].decision.reason).toContain('blocked by validator(s) references');
    expect(trace.iterations[2].validation.every((report) => report.problems.length === 0)).toBe(
      true,
    );
    const briefings = exchanges.filter((exchange) => exchange.scope === 'producer');
    expect(briefings).toHaveLength(2);
    expect(briefings[0].user).not.toContain('refused before any judge');
    expect(briefings[1].user).toContain('refused before any judge');
    expect(briefings[1].user).toContain('nowhere');
  });
});
