import { describe, expect, it } from 'vitest';
import type { CanvasGraph, QualityRunDto } from '@sysdesign/contracts';

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
          locationRefs: ['binding.1', 'edge.1', 'node.2', 'node.9'],
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
  it('[DEL-4] grounds positional refs onto the graded graph, keeps every ref verbatim, and borrows the lens’s words when the wire has none', async () => {
    const dto = toEvaluationDto(await finishedRun(), 1, graph);

    expect(dto).toMatchObject({
      status: 'complete',
      overall: 58,
      decision: 'revise',
      dimensions: { coverage: 80, quality_attributes: 40, compliance: null },
      stopReason: 'max-iterations',
      error: null,
    });
    expect(dto.findings).toEqual([
      expect.objectContaining({
        id: 'scale_mismatch|binding.1,edge.1,node.2,node.9',
        nodeIds: ['api'],
        edgeIds: ['e-1'],
        locationRefs: ['binding.1', 'edge.1', 'node.2', 'node.9'],
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

  it('[DEL-4] a run without a trace is its status with nothing invented; an iteration the run never reached is failed', async () => {
    const run = await finishedRun();
    const missing = toEvaluationDto(run, 2, graph);
    expect(missing).toMatchObject({
      status: 'failed',
      error: 'the run has no iteration 2',
      overall: null,
    });

    const running: QualityRunDto = { ...run, status: 'running', trace: null, finishedAt: null };
    expect(toEvaluationDto(running, 1, graph)).toEqual({
      runId: run.runId,
      iteration: 1,
      status: 'running',
      llm: run.llm,
      overall: null,
      decision: null,
      dimensions: {},
      findings: [],
      criterionResults: [],
      stopReason: null,
      error: null,
    });
  });
});
