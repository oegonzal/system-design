import { describe, expect, it } from 'vitest';
import type { CanvasGraph, DesignSubmission, QualityRunDto } from '@sysdesign/contracts';

import { FakeQualityLoopClient } from '../../test/fake-quality-loop.client';
import { toEvaluationDto } from './evaluation.mapper';

const graph: CanvasGraph = {
  nodes: [
    { id: 'client', kind: 'client', label: 'Client' },
    { id: 'api', kind: 'service', label: 'API' },
    { id: 'db', kind: 'database', label: 'DB' },
  ],
  edges: [{ id: 'e-1', source: 'client', target: 'api', kind: 'sync' }],
};

/** The graded submission: the graph, one binding and one narration the lens can cite. */
const submission: DesignSubmission = {
  graph,
  brief: { version: 1, bindings: [{ criterionId: 'c1', nodeIds: ['api'], claim: 'served' }] },
  narrative: {
    version: 1,
    componentRationales: [],
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
      dimensions: { coverage: 80, quality_attributes: 40, compliance: null },
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
          lenses: ['critic.scale'],
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
        criticId: 'critic.scale',
        sample: 1,
        findings: [
          {
            type: 'scale_mismatch',
            severity: 'medium',
            confidence: 'medium',
            fixability: 'fixable_local',
            locationRefs: ['node.2'],
            criterionIds: ['c2'],
            rationale: 'three instances at 500 rps cannot carry 2,000',
          },
        ],
      },
      diagnostic: null,
    },
  ];
  run.trace.iterations[0].evaluators = [
    {
      report: {
        evaluatorId: 'evaluator.quality',
        sample: 1,
        results: [
          {
            criterionId: 'c2',
            result: 'partial',
            confidence: 'high',
            locationRefs: ['node.2'],
            rationale: 'sized, but not for the peak',
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
  it('[DEL-4] grounds every cited ref onto the graded submission with its part, key and label, keeps every ref verbatim, carries the decision reason, and borrows the lens’s words when the wire has none', async () => {
    const dto = toEvaluationDto(await finishedRun(), 1, submission);

    expect(dto).toMatchObject({
      status: 'complete',
      overall: 58,
      decision: 'revise',
      decisionReason: 'fake',
      dimensions: { coverage: 80, quality_attributes: 40, compliance: null },
      stopReason: 'max-iterations',
      error: null,
    });
    expect(dto.findings).toEqual([
      expect.objectContaining({
        id: 'scale_mismatch|binding.1,edge.1,node.2,node.9',
        locations: [
          { ref: 'binding.1', label: 'c1 ← api', part: 'binding', key: 'c1' },
          { ref: 'edge.1', label: 'e-1 · client → api (sync)', part: 'edge', key: 'e-1' },
          { ref: 'node.2', label: 'api · service · API', part: 'node', key: 'api' },
          // node.9 names nothing on the revision and is placed nowhere.
          { ref: 'narration.1', label: 'c2', part: 'narration', key: 'c2' },
        ],
        nodeIds: ['api'],
        edgeIds: ['e-1'],
        locationRefs: ['binding.1', 'edge.1', 'node.2', 'node.9', 'narration.1'],
        criterionIds: ['c2'],
        lenses: ['critic.scale'],
        rationale: 'three instances at 500 rps cannot carry 2,000',
        reconciledTo: 'c2',
      }),
    ]);
    expect(dto.criterionResults).toEqual([
      { criterionId: 'c1', result: 'pass', confidence: 'high', rationale: null },
      {
        criterionId: 'c2',
        result: 'partial',
        confidence: 'high',
        rationale: 'sized, but not for the peak',
      },
    ]);
  });

  it('[DEL-4] an iteration where nothing was assessed has a null overall — never the controller’s zero', async () => {
    const run = await finishedRun();
    if (!run.trace) throw new Error('the fake completes synchronously');
    const [it] = run.trace.iterations;
    it.decision = {
      ...it.decision,
      scores: {
        dimensions: { coverage: null, quality_attributes: null, compliance: null },
        overall: 0,
      },
    };
    const dto = toEvaluationDto(run, 1, submission);
    expect(dto.overall).toBeNull();
    expect(dto.decision).toBe('revise');
    it.decision = {
      ...it.decision,
      scores: { dimensions: { coverage: 80, compliance: null }, overall: 32 },
    };
    expect(toEvaluationDto(run, 1, submission).overall).toBe(32);
  });

  it('[DEL-4] a run without a trace is its status with nothing invented; an iteration the run never reached is failed', async () => {
    const run = await finishedRun();
    const missing = toEvaluationDto(run, 2, submission);
    expect(missing).toMatchObject({
      status: 'failed',
      error: 'the run has no iteration 2',
      overall: null,
    });

    const running: QualityRunDto = { ...run, status: 'running', trace: null, finishedAt: null };
    expect(toEvaluationDto(running, 1, submission)).toEqual({
      runId: run.runId,
      iteration: 1,
      status: 'running',
      llm: run.llm,
      overall: null,
      decision: null,
      decisionReason: null,
      dimensions: {},
      findings: [],
      criterionResults: [],
      stopReason: null,
      error: null,
    });
  });
});
