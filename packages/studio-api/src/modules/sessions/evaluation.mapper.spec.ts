import { describe, expect, it } from 'vitest';
import type { CanvasGraph, DesignSubmission, QualityRunDto } from '@sysdesign/contracts';

import { FakeQualityLoopClient } from '../../test/fake-quality-loop.client';
import { iterationStatus, toEvaluationDto } from './evaluation.mapper';

const graph: CanvasGraph = {
  nodes: [
    { id: 'client', kind: 'client', label: 'Client' },
    { id: 'api', kind: 'service', label: 'API' },
    { id: 'db', kind: 'database', label: 'DB' },
  ],
  edges: [{ id: 'e-1', source: 'client', target: 'api', kind: 'sync' }],
};

/** When the studio read the run, on its own clock. */
const READ_AT = '2026-09-29T00:07:00.000Z';

/** The graded submission: the graph, one binding and one narration the lens can cite. */
const submission: DesignSubmission = {
  graph,
  brief: { version: 1, bindings: [{ criterionId: 'c1', nodeIds: ['api'], claim: 'served' }] },
  narrative: {
    version: 1,
    componentRationales: [{ nodeId: 'db', prose: 'the store of record' }],
    criterionNarrations: [{ criterionId: 'c2', prose: 'sized for the peak' }],
  },
};

/** A finished run from the fake, so the spec and the fake agree on the wire shape. */
async function finishedRun(): Promise<QualityRunDto> {
  const loop = new FakeQualityLoopClient();
  const { runId } = await loop.startRun({
    pipeline: 'system-design-canvas',
    goal: 'g',
    output: { graph, brief: null, narrative: null },
    criteria: [
      { id: 'c1', kind: 'functional', statement: 'one' },
      { id: 'c2', kind: 'scale', statement: 'two' },
    ],
    maxIterations: 1,
  });
  loop.complete(runId, [
    {
      overall: 58,
      decision: 'revise',
      dimensions: { coverage: 80, qualities: 40, compliance: null },
      findings: [
        {
          key: 'scale_mismatch|binding.1,edge.1,node.2,node.9',
          type: 'scale_mismatch',
          severity: 'medium',
          confidence: 'medium',
          fixability: 'fixable_local',
          locationRefs: ['binding.1', 'edge.1', 'node.2', 'node.9', 'narration.1'],
          criterionIds: ['c2'],
          hits: 2,
          lenses: ['critic.fitness'],
          rationale: null,
          reconciledTo: 'c2',
        },
      ],
    },
  ]);
  const run = await loop.getRun(runId);
  if (!run?.trace) throw new Error('the fake completes synchronously');
  // The lens's own words, on the wire as a critic report rather than on the confirmed finding.
  run.trace.iterations[0].critics = [
    {
      report: {
        criticId: 'critic.fitness',
        sample: 1,
        findings: [
          {
            type: 'scale_mismatch',
            severity: 'medium',
            confidence: 'medium',
            fixability: 'fixable_local',
            locationRefs: ['node.2'],
            criterionIds: ['c2'],
            rationale: 'Node.2 runs three instances at 500 rps; node.3 cannot absorb the rest',
          },
        ],
      },
      diagnostic: null,
    },
  ];
  run.trace.iterations[0].evaluators = [
    {
      report: {
        evaluatorId: 'evaluator.qualities',
        sample: 1,
        results: [
          {
            criterionId: 'c2',
            result: 'partial',
            confidence: 'high',
            locationRefs: ['node.2'],
            rationale: 'sized, but narration.1 says peak while edge.1 and node.12 carry none',
          },
        ],
        advisoryVerdict: null,
      },
      diagnostic: null,
    },
  ];
  return run;
}

describe('toEvaluationDto', () => {
  it('[DEL-4] grounds every cited ref onto the graded submission with its part, key and label — a place the prose merely names is a mention, never the finding’s — keeps every ref verbatim, carries the decision reason, and borrows the lens’s words when the wire has none', async () => {
    const run = await finishedRun();
    const dto = toEvaluationDto(run, 1, submission, READ_AT);

    expect(dto).toMatchObject({
      status: 'complete',
      overall: 58,
      decision: 'revise',
      decisionReason: 'fake',
      dimensions: { coverage: 80, qualities: 40, compliance: null },
      // One judgement ends on its budget of one: the run says so, the grade does not.
      stopReason: null,
      error: null,
    });
    expect(run.trace?.stopReason).toBe('max-iterations');
    expect(dto.findings).toEqual([
      expect.objectContaining({
        id: 'scale_mismatch|binding.1,edge.1,node.2,node.9',
        locations: [
          { ref: 'binding.1', label: 'c1 binding (api)', part: 'binding', key: 'c1' },
          { ref: 'edge.1', label: 'e-1 · client → api (sync)', part: 'edge', key: 'e-1' },
          { ref: 'node.2', label: 'api · service · API', part: 'node', key: 'api', name: 'API' },
          // node.9 names nothing on the revision and is placed nowhere.
          { ref: 'narration.1', label: 'c2 narration', part: 'narration', key: 'c2' },
        ],
        // Named by the lens's words and never cited: placed so the sentence
        // reads in labels, and nowhere else. `Node.2` is node.2, already cited.
        mentions: [
          { ref: 'node.3', label: 'db · database · DB', part: 'node', key: 'db', name: 'DB' },
        ],
        // The canvas highlights what was cited; the mentioned db is not lit.
        nodeIds: ['api'],
        edgeIds: ['e-1'],
        locationRefs: ['binding.1', 'edge.1', 'node.2', 'node.9', 'narration.1'],
        criterionIds: ['c2'],
        lenses: ['critic.fitness'],
        rationale: 'Node.2 runs three instances at 500 rps; node.3 cannot absorb the rest',
        reconciledTo: 'c2',
      }),
    ]);
    expect(dto.criterionResults).toEqual([
      {
        criterionId: 'c1',
        result: 'pass',
        confidence: 'high',
        rationale: null,
        locations: [],
        mentions: [],
      },
      {
        criterionId: 'c2',
        result: 'partial',
        confidence: 'high',
        rationale: 'sized, but narration.1 says peak while edge.1 and node.12 carry none',
        // The sample's own evidence, then every id its prose names besides that the revision
        // has — so the studio can read the prose in labels. node.12 names nothing here and is
        // not invented.
        locations: [
          { ref: 'node.2', label: 'api · service · API', part: 'node', key: 'api', name: 'API' },
        ],
        mentions: [
          { ref: 'narration.1', label: 'c2 narration', part: 'narration', key: 'c2' },
          { ref: 'edge.1', label: 'e-1 · client → api (sync)', part: 'edge', key: 'e-1' },
        ],
      },
    ]);
    expect(dto.degraded).toEqual([]);
  });

  it('[DEL-4] a lens sample that answered nothing is reported, so a grade made without it says so — a lens with nothing to judge is not', async () => {
    const run = await finishedRun();
    if (!run.trace) throw new Error('the fake completes synchronously');
    const [it] = run.trace.iterations;
    it.critics.push({
      report: null,
      diagnostic: { stage: 'critic.fitness', sample: 2, reason: 'llm-failed', detail: 'timed out' },
    });
    it.evaluators.push({
      report: null,
      diagnostic: {
        stage: 'evaluator.qualities',
        sample: 1,
        reason: 'token-clipped',
        detail: null,
      },
    });
    it.evaluators.push({
      report: null,
      diagnostic: {
        stage: 'evaluator.coverage',
        sample: null,
        reason: 'not-applicable',
        detail: 'no criteria of its kinds',
      },
    });
    expect(toEvaluationDto(run, 1, submission, READ_AT).degraded).toEqual([
      { stage: 'critic.fitness', sample: 2, reason: 'llm-failed' },
      { stage: 'evaluator.qualities', sample: 1, reason: 'token-clipped' },
    ]);
  });

  it('[DEL-4] why a coach stopped belongs to the iteration that ended it — never to an earlier one, and never when the decision already says it', async () => {
    const loop = new FakeQualityLoopClient();
    const { runId } = await loop.startRun({
      pipeline: 'system-design-canvas',
      goal: 'g',
      output: { graph, brief: null, narrative: null },
      criteria: [{ id: 'c1', kind: 'functional', statement: 'one' }],
      maxIterations: 2,
    });
    loop.complete(runId, [
      { overall: 12, decision: 'revise' },
      { overall: 30, decision: 'revise', artifact: submission },
    ]);
    const run = await loop.getRun(runId);
    if (!run?.trace) throw new Error('the fake completes synchronously');
    expect(run.trace.stopReason).toBe('max-iterations');

    expect(toEvaluationDto(run, 1, submission, READ_AT)).toMatchObject({
      overall: 12,
      stopReason: null,
      settled: true,
    });
    // The run could revise and used its budget: news on the iteration it ended on.
    expect(toEvaluationDto(run, 2, submission, READ_AT)).toMatchObject({
      status: 'complete',
      settled: true,
      overall: 30,
      stopReason: 'max-iterations',
    });
    run.trace.stopReason = 'plateau';
    expect(toEvaluationDto(run, 2, submission, READ_AT).stopReason).toBe('plateau');

    // A stop the last decision caused is the decision's to state — and no artifact earns no score.
    loop.complete(runId, [
      { overall: 12, decision: 'revise' },
      { overall: 0, decision: 'escalate', artifact: null },
    ]);
    const escalated = await loop.getRun(runId);
    if (!escalated?.trace) throw new Error('the fake completes synchronously');
    escalated.trace.stopReason = 'escalated';
    expect(toEvaluationDto(escalated, 2, submission, READ_AT)).toMatchObject({
      status: 'complete',
      overall: null,
      decision: 'escalate',
      stopReason: null,
    });
  });

  it('[DEL-4] an iteration a running run has recorded is complete but not settled; one it has not is still running; a failure keeps the recorded one', async () => {
    const loop = new FakeQualityLoopClient();
    const { runId } = await loop.startRun({
      pipeline: 'system-design-canvas',
      goal: 'g',
      output: { graph, brief: null, narrative: null },
      criteria: [{ id: 'c1', kind: 'functional', statement: 'one' }],
      maxIterations: 3,
    });
    loop.progress(runId, [{ overall: 40, decision: 'revise' }]);
    const run = await loop.getRun(runId);
    if (!run) throw new Error('the fake keeps every run');

    expect(iterationStatus(run, 1)).toBe('complete');
    // Recorded, so final — but whether it ends the run, and why, waits for the run.
    expect(toEvaluationDto(run, 1, submission, READ_AT)).toMatchObject({
      status: 'complete',
      settled: false,
      overall: 40,
      stopReason: null,
      error: null,
    });
    expect(iterationStatus(run, 2)).toBe('running');
    expect(toEvaluationDto(run, 2, submission, READ_AT)).toMatchObject({
      status: 'running',
      settled: false,
      overall: null,
      error: null,
    });

    // The grade already shown stays: a run that fails keeps what it recorded, with no stop reason.
    loop.fail(runId, 'the model went away');
    const failed = await loop.getRun(runId);
    if (!failed) throw new Error('the fake keeps every run');
    expect(toEvaluationDto(failed, 1, submission, READ_AT)).toMatchObject({
      status: 'complete',
      settled: true,
      overall: 40,
      stopReason: null,
      error: null,
    });
    expect(toEvaluationDto(failed, 2, submission, READ_AT)).toMatchObject({
      status: 'failed',
      settled: true,
      error: 'the model went away',
    });
  });

  it('[DEL-4] an iteration where nothing was assessed has a null overall — never the controller’s zero', async () => {
    const run = await finishedRun();
    if (!run.trace) throw new Error('the fake completes synchronously');
    const [it] = run.trace.iterations;
    it.decision = {
      ...it.decision,
      scores: {
        dimensions: { coverage: null, qualities: null, compliance: null },
        overall: 0,
      },
    };
    const dto = toEvaluationDto(run, 1, submission, READ_AT);
    expect(dto.overall).toBeNull();
    expect(dto.decision).toBe('revise');
    it.decision = {
      ...it.decision,
      scores: { dimensions: { coverage: 80, compliance: null }, overall: 32 },
    };
    expect(toEvaluationDto(run, 1, submission, READ_AT).overall).toBe(32);
  });

  it('[UX-18] a grade the evidence gate found too thin is unscored — no overall, no dimension, no lens’s words on what nobody settled — and a real 0 is still a 0', async () => {
    const run = await finishedRun();
    if (!run.trace) throw new Error('the fake completes synchronously');
    const [it] = run.trace.iterations;
    it.decision = {
      ...it.decision,
      finalDecision: 'escalate',
      gates: { ...it.decision.gates, evidenceSufficient: false },
      scores: { dimensions: { coverage: 0, qualities: 0, compliance: 0 }, overall: 0 },
    };
    it.ledger = {
      ...it.ledger,
      criteria: it.ledger.criteria.map((row) => ({ ...row, result: 'unassessed', hits: 0 })),
    };
    const thin = toEvaluationDto(run, 1, submission, READ_AT);
    expect(thin).toMatchObject({
      status: 'complete',
      overall: null,
      unscored: 'unassessed',
      decision: 'escalate',
      dimensions: { coverage: null, qualities: null, compliance: null },
    });
    // One evaluator sample still wrote about c2; nobody settled it, so its words are not a verdict.
    const c2 = thin.criterionResults.find((row) => row.criterionId === 'c2');
    expect(c2).toMatchObject({
      result: 'unassessed',
      rationale: null,
      locations: [],
      mentions: [],
    });

    it.decision = {
      ...it.decision,
      gates: { ...it.decision.gates, evidenceSufficient: true },
    };
    expect(toEvaluationDto(run, 1, submission, READ_AT)).toMatchObject({
      overall: 0,
      unscored: null,
      dimensions: { coverage: 0, qualities: 0, compliance: 0 },
    });
    // An iteration that produced nothing is unscored for its own reason.
    it.artifact = null;
    expect(toEvaluationDto(run, 1, submission, READ_AT)).toMatchObject({
      overall: null,
      unscored: 'no-artifact',
    });
  });

  it('[DEL-8] says what settled the decision as data: the deciding step and what it decided on, the remediations selected, the criteria assessed', async () => {
    const run = await finishedRun();
    if (!run.trace) throw new Error('the fake completes synchronously');
    const [it] = run.trace.iterations;
    it.decision = {
      ...it.decision,
      selectedRemediations: [
        {
          subject: { finding: 'a|node.1' },
          action: 'revise',
          severity: 'high',
          targetRefs: ['node.1'],
        },
        {
          subject: { finding: 'b|node.2' },
          action: 'revise',
          severity: 'medium',
          targetRefs: ['node.2'],
        },
      ],
      reason: '2 remediation(s) to apply',
      trace: {
        ...it.decision.trace,
        steps: [
          { order: 1, factor: 'scores', outcome: 'computed', detail: 'overall 58' },
          {
            order: 2,
            factor: 'evidence',
            outcome: 'passed',
            detail: '100% of 2 criteria assessed',
          },
          { order: 3, factor: 'route', outcome: 'decided', detail: '2 remediation(s) to apply' },
        ],
      },
    };
    expect(toEvaluationDto(run, 1, submission, READ_AT).decisionBasis).toEqual({
      factor: 'route',
      facts: {},
      remediations: 2,
      criteria: { assessed: it.ledger.criteria.length, total: it.ledger.criteria.length },
    });

    // A gate that held the score to a number records both, and the basis carries them as recorded.
    it.decision = {
      ...it.decision,
      finalDecision: 'revise',
      reason: 'overall 25 below the floor 30 (revised, never restarted)',
      trace: {
        ...it.decision.trace,
        steps: [
          { order: 1, factor: 'scores', outcome: 'computed', detail: 'overall 25' },
          {
            order: 2,
            factor: 'reject-floor',
            outcome: 'decided',
            detail: 'overall 25 below the floor 30 (revised, never restarted)',
            facts: { overall: 25, floor: 30 },
          },
          { order: 3, factor: 'route', outcome: 'skipped', detail: 'not reached' },
        ],
      },
    };
    expect(toEvaluationDto(run, 1, submission, READ_AT).decisionBasis).toMatchObject({
      factor: 'reject-floor',
      facts: { overall: 25, floor: 30 },
    });
  });

  it('[DEL-4] a run without a trace is its status with nothing invented; an iteration the run never reached is failed', async () => {
    const run = await finishedRun();
    const missing = toEvaluationDto(run, 2, submission, READ_AT);
    expect(missing).toMatchObject({
      status: 'failed',
      error: 'the run has no iteration 2',
      overall: null,
    });

    const running: QualityRunDto = { ...run, status: 'running', trace: null, finishedAt: null };
    expect(toEvaluationDto(running, 1, submission, READ_AT)).toEqual({
      runId: run.runId,
      iteration: 1,
      startedAt: run.startedAt,
      heartbeatAt: run.heartbeatAt,
      readAt: READ_AT,
      status: 'running',
      settled: false,
      llm: run.llm,
      overall: null,
      unscored: null,
      decision: null,
      decisionReason: null,
      decisionBasis: null,
      dimensions: {},
      findings: [],
      criterionResults: [],
      stopReason: null,
      degraded: [],
      error: null,
    });
  });
});
