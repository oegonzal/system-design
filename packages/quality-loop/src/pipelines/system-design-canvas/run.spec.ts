import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import {
  BINDING_CLAIM_BOUND,
  canvasChangeSchema,
  designSubmissionSchema,
  parseLenient,
  repairSubmission,
  type Binding,
  type CanvasChange,
  type CanvasEdge,
} from '@sysdesign/contracts';

import { runPipeline } from '../../core/loop/run-pipeline';
import { fakeLlm, sequencedLlm } from '../../core/testing';
import { SYSTEM_DESIGN_CANVAS } from './definition';
import {
  coachedChange,
  sampleBrief,
  sampleCriteria,
  sampleModel,
  sampleNarrative,
  sampleSubmission,
} from './testing';

const GOAL = '# Serve an order history\n\nShoppers see their past orders; two sources feed them.';

/**
 * What the fitness critic's samples say — the one critic whose owned types
 * this reply fits — : one confirmed defect at the history service, naming the
 * latency target. Every other critic's schema refuses it and answers with
 * nothing.
 */
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

/** What the communication critic's samples say: the webhook path stops short, named at its binding and the hop. Only its schema admits the type. */
const flowFindings = {
  findings: [
    {
      type: 'flow_gap',
      severity: 'medium',
      confidence: 'high',
      fixability: 'fixable_local',
      locationRefs: ['binding.2', 'edge.5'],
      criterionIds: ['c11'],
      rationale: 'the webhook path stops at the queue; nothing walks it on to the store',
    },
  ],
};

const noFindings = { findings: [] };

/** Four evaluators, four rubrics: the fake answers each by the criterion ids its schema locks to. */
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

const designResults = {
  results: [
    {
      criterionId: 'c7',
      result: 'pass',
      confidence: 'high',
      locationRefs: ['node.11'],
      rationale: 'the history store owns every order once',
    },
    {
      criterionId: 'c8',
      result: 'partial',
      confidence: 'medium',
      locationRefs: ['node.3'],
      rationale: 'the webhook is keyed, the indexer is not',
    },
    {
      criterionId: 'c9',
      result: 'fail',
      confidence: 'high',
      locationRefs: ['edge.3'],
      rationale: 'no path carries a refund back to its order',
    },
    {
      criterionId: 'c11',
      result: 'partial',
      confidence: 'medium',
      locationRefs: ['binding.2'],
      rationale: 'the hops are drawn; two declare no mechanism',
    },
  ],
  advisoryVerdict: 'revise',
};

const reasoningResults = {
  results: [
    {
      criterionId: 'c10',
      result: 'partial',
      confidence: 'medium',
      locationRefs: ['rationale.1'],
      rationale: 'the read model is defended, the cost of staleness is not named',
    },
  ],
  advisoryVerdict: 'revise',
};

/** Every judge's answer, in the order the fake tries them: the two typed findings first, then nothing, then one results reply per evaluator. */
const judges = [
  findings,
  flowFindings,
  noFindings,
  requirementResults,
  qualityResults,
  designResults,
  reasoningResults,
];

const canned = [...judges, coachedChange()];

/** The change with bindings the coach also rewrote — whole, by criterion id; a later entry for one criterion wins. */
const withBindingUpserts = (change: CanvasChange, upsert: Binding[]): CanvasChange => ({
  changes: {
    ...change.changes,
    bindings: {
      upsert: [...(change.changes.bindings?.upsert ?? []), ...upsert],
      remove: change.changes.bindings?.remove ?? [],
    },
  },
});

/** What a coach might return: a criterion it invented, one bound criterion rewritten twice in the same change set, and a path that fans out. */
const sloppyChange = (): CanvasChange => {
  const [c1, c2] = sampleBrief().bindings;
  return withBindingUpserts(coachedChange(), [
    // edge-1 does not start where edge-9 ends: a fan-out tacked onto the walk.
    { ...c2, path: [...(c2.path ?? []), 'edge-1'] },
    { criterionId: 'c99', nodeIds: ['service-1'], claim: 'a criterion the rubric never listed' },
    // Each rewrite replaces the author's c1 binding in place, so the later one
    // is the binding and nothing is bound twice.
    { ...c1, claim: 'the earlier rewrite' },
    { ...c1, claim: 'the later rewrite, which wins' },
  ]);
};

/** A coach change the repair cannot save: an edge to a node that is not drawn. */
const brokenChange = (): CanvasChange => {
  const coached = coachedChange();
  const dangling: CanvasEdge = {
    id: 'ai-edge-9',
    source: 'service-1',
    target: 'nowhere',
    kind: 'sync',
  };
  return {
    changes: {
      ...coached.changes,
      edges: {
        upsert: [...(coached.changes.edges?.upsert ?? []), dangling],
        remove: coached.changes.edges?.remove ?? [],
      },
    },
  };
};

describe('the system-design-canvas loop', () => {
  it('[QL-21] a provided canvas is judged in one iteration against the supplied rubric, and nothing is derived', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 1 },
      { llm: fakeLlm(...canned), sink: (exchange) => exchanges.push(exchange), now: () => 0 },
    );

    expect(trace.contract.criteria.map((criterion) => criterion.id)).toEqual(
      Array.from({ length: 11 }, (_, index) => `c${index + 1}`),
    );
    const scopes = new Set(exchanges.map((exchange) => exchange.scope));
    expect(scopes.has('criteria')).toBe(false);
    expect(scopes.has('producer')).toBe(false);
    // Ten lenses, two samples each — every one attributed.
    expect(exchanges).toHaveLength(20);

    expect(trace.iterations).toHaveLength(1);
    const [only] = trace.iterations;
    expect(only.mode).toBe('provided');
    expect(only.validation.every((report) => report.problems.length === 0)).toBe(true);
    expect(only.ledger.findings.map((finding) => finding.key)).toEqual([
      'unhandled_failure|edge.3,node.3',
      'flow_gap|binding.2,edge.5',
    ]);
    // Only the critic that owns a type raised it; its two samples confirm it.
    expect(only.ledger.findings[0].lenses).toEqual(['critic.fitness']);
    expect(only.ledger.findings[0].rationale).toContain('300 ms');
    expect(only.ledger.findings[1].lenses).toEqual(['critic.communication']);
    expect(
      Object.fromEntries(only.ledger.criteria.map((row) => [row.criterionId, row.result])),
    ).toEqual({
      c1: 'pass',
      c2: 'partial',
      c3: 'fail',
      c4: 'fail',
      c5: 'partial',
      c6: 'pass',
      c7: 'pass',
      c8: 'partial',
      c9: 'fail',
      c10: 'partial',
      c11: 'partial',
    });
    expect(only.decision.finalDecision).toBe('revise');
    expect(trace.stopReason).toBe('max-iterations');
  });

  it('[QL-21] [QL-84] coached, the coach is asked for a change set and the revision — the change applied to the best — keeps every author id, every part it did not name, and prefixes what it adds with ai-', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 2 },
      { llm: fakeLlm(...canned), sink: (exchange) => exchanges.push(exchange), now: () => 0 },
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
    expect(trace.iterations[1].locations.map((location) => location.id)).toContain('node.16');
    // Asked in the change schema, in the pipeline's words — never the canvas again.
    const briefing = exchanges.find((exchange) => exchange.scope === 'producer');
    const asked = Object.keys((briefing?.schema as { properties: object }).properties);
    expect(asked).toEqual(['changes']);
    expect(briefing?.user).toContain(
      '# Instructions\n\nReturn only a change set against the artifact above',
    );
    // Everything the change did not name is the author's, the model included:
    // a redraw used to drop it, and nothing noticed.
    expect(revised.model).toEqual(sampleModel());
    expect(revised.brief).toEqual(sampleBrief());
    expect(revised.narrative).toEqual(sampleNarrative());
  });

  it('[QL-84] no judge’s reply and no whole submission reads as a change set, so the coach is never answered with one', () => {
    // The fake model answers with the first canned object that parses
    // leniently, unknown keys stripped. The change schema's one required
    // root key, `changes`, is all that keeps a findings reply, a results
    // reply and the author's own canvas from reading as an empty change —
    // and a change set from reading as a canvas. Were the key optional,
    // every coach ask in these specs would be answered with a judge's reply.
    for (const reply of [...judges, sampleSubmission()]) {
      expect(parseLenient(canvasChangeSchema, reply).ok).toBe(false);
    }
    expect(parseLenient(canvasChangeSchema, coachedChange()).ok).toBe(true);
    expect(parseLenient(designSubmissionSchema, coachedChange()).ok).toBe(false);
  });

  it('[QL-25] a coach change set that binds an unlisted criterion, rewrites one criterion twice or breaks a path is applied and repaired before judging — the unlisted binding dropped, the later rewrite the one binding, the walk cut where it stops connecting — and the author’s own submission never is', async () => {
    const exchanges: LlmExchange[] = [];
    const trace = await runPipeline(
      SYSTEM_DESIGN_CANVAS,
      { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 2 },
      {
        llm: fakeLlm(...judges, sloppyChange()),
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
    // Two rewrites of c1 in one change set: the later replaced the author's
    // binding in place, so c1 is bound once, by it.
    expect(artifact.brief.bindings.filter((binding) => binding.criterionId === 'c1')).toEqual([
      expect.objectContaining({ claim: 'the later rewrite, which wins' }),
    ]);
    expect(artifact.brief.bindings.find((b) => b.criterionId === 'c2')?.path).toEqual([
      'edge-4',
      'edge-14',
      'edge-16',
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
    /** The change with c1 rewritten whole, its claim past the ceiling. */
    const wordy = (change: CanvasChange): CanvasChange =>
      withBindingUpserts(change, [{ ...sampleBrief().bindings[0], claim: long }]);
    const revise = async (change: CanvasChange) =>
      (
        await runPipeline(
          SYSTEM_DESIGN_CANVAS,
          { goal: GOAL, output: sampleSubmission(), criteria: sampleCriteria(), maxIterations: 2 },
          {
            llm: fakeLlm(...judges, change),
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

    const repaired = await revise(wordy(sloppyChange()));
    expect(problemsOf(repaired, 'references')).toEqual([]);
    const bindings = repaired.artifact?.brief?.bindings ?? [];
    expect(bindings.map((binding) => binding.criterionId)).not.toContain('c99');
    expect(bindings.filter((binding) => binding.criterionId === 'c1')).toEqual([
      expect.objectContaining({ claim: long }),
    ]);

    const blocked = await revise(wordy(brokenChange()));
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
        llm: sequencedLlm(...judges, brokenChange(), coachedChange()),
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
