import type { PipelineSummary, SuccessCriterion } from '@sysdesign/contracts';
import {
  FIELD_EVIDENCE_HEADING,
  FORM_MEMORY_STEP_REASONS,
  renderDocumentGoal,
  resumeChunk,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { fieldGoal, policyCriteria, sampleAnswers } from '../../pipelines/field-answer/testing';
import { childRun, memoryPorts } from '../memory/steps.testing';
import { passed, readoutTrace } from '../memory/testing';
import { validateOrchestrator } from '../runner/definition';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { FORM_MEMORY } from './definition';

const GOAL = fieldGoal([]);
const registry: PipelineSummary[] = [summaryOf('field-answer', 70, 'composed')];

describe('the form-memory orchestrator', () => {
  it('[QL-38] is valid data: a recall over no pipeline, then a target that runs field-answer without needing it', () => {
    expect(() => validateOrchestrator(FORM_MEMORY as never)).not.toThrow();
    expect(FORM_MEMORY.takesTarget).toBe(false);
    expect(FORM_MEMORY.reasons).toBe(FORM_MEMORY_STEP_REASONS);
    expect(FORM_MEMORY.steps.map((step) => [step.id, step.pipeline, step.needs])).toEqual([
      ['recall', undefined, undefined],
      ['target', 'field-answer', undefined],
    ]);
  });

  it('[QL-38] refuses a goal the field codec did not compose, and nothing else', () => {
    expect(FORM_MEMORY.refuse?.({ goal: 'Just a policy.' }, registry)).toMatch(
      /carries no field-answer index/,
    );
    expect(FORM_MEMORY.refuse?.({ goal: renderDocumentGoal(resumeChunk()) }, registry)).toMatch(
      /field-answer/,
    );
    expect(FORM_MEMORY.refuse?.({ goal: GOAL }, registry)).toBeNull();
    expect(FORM_MEMORY.refuse?.({ goal: fieldGoal() }, registry)).toBeNull();
  });

  it('[QL-38] run over the runner, the answerer sees the recalled evidence and the request’s rubric, and the record reports the admission', async () => {
    const ports = memoryPorts();
    const asked: { pipeline: string; goal: string; criteria: SuccessCriterion[] | undefined }[] =
      [];
    const deps = orchestrationDeps(
      ports,
      (request, onOpened) => {
        asked.push({ pipeline: request.pipeline, goal: request.goal, criteria: request.criteria });
        const run = childRun(
          'field-answer',
          readoutTrace({
            pipeline: 'field-answer',
            goal: request.goal,
            artifact: sampleAnswers(),
            locations: ['summary', 'field.1', 'field.2', 'field.3', 'field.4', 'field.5'],
            criteria: request.criteria ?? [],
            results: [passed('c1', 'grounding', ['field.1'])],
          }),
        );
        onOpened?.(run);
        return Promise.resolve(run);
      },
      { pipelines: () => registry },
    );
    const criteria = policyCriteria();
    const record = await performed(FORM_MEMORY, { goal: GOAL, criteria }, deps, {
      context: await FORM_MEMORY.context(ports),
    });

    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.context).toMatchObject({ store: { ready: true, chunks: 2 } });
    expect(record.steps['recall']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: [],
      counts: { probes: 5, candidates: 2, evidence: 2 },
    });
    expect(asked).toHaveLength(1);
    expect(asked[0].pipeline).toBe('field-answer');
    expect(asked[0].goal).toContain(FIELD_EVIDENCE_HEADING);
    expect(asked[0].goal).toContain('- [m1] ');
    expect(asked[0].criteria).toEqual(criteria);
    expect(record.steps['target']).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: ['field-answer-run'],
      counts: { iterations: 1 },
      report: { admission: 'admitted' },
    });
    expect(record.request.criteriaProvided).toBe(true);
  });
});
