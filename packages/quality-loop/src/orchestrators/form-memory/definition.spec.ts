import type { PipelineSummary, SuccessCriterion } from '@sysdesign/contracts';
import {
  FIELD_EVIDENCE_HEADING,
  FORM_MEMORY_STEP_REASONS,
  FORM_MEMORY_TARGET_STEP,
  FORM_PIPELINES,
  renderDocumentGoal,
  resumeChunk,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { sampleSuggestions, suggestionsGoal } from '../../pipelines/answer-suggestions/testing';
import { fieldGoal, policyCriteria, sampleAnswers } from '../../pipelines/field-answer/testing';
import { childRun, memoryPorts, sampleFacts } from '../memory/steps.testing';
import { faulting, passed, readoutTrace } from '../memory/testing';
import { validateOrchestrator } from '../runner/definition';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { FORM_MEMORY } from './definition';

const GOAL = fieldGoal([]);
const registry: PipelineSummary[] = [
  summaryOf('field-answer', 70, 'composed'),
  summaryOf('answer-suggestions', 70, 'composed'),
];

describe('the form-memory orchestrator', () => {
  it('[QL-38] [QL-65] is valid data: a recall over no pipeline, then a target that runs the form pipeline the request names, without needing the recall', () => {
    expect(() => validateOrchestrator(FORM_MEMORY as never)).not.toThrow();
    expect(FORM_MEMORY.takesTarget).toBe(true);
    expect(FORM_MEMORY.reasons).toBe(FORM_MEMORY_STEP_REASONS);
    expect(FORM_MEMORY.steps.map((step) => [step.id, step.pipeline, step.needs])).toEqual([
      ['recall', undefined, undefined],
      [FORM_MEMORY_TARGET_STEP, FORM_PIPELINES, undefined],
    ]);
  });

  it('[QL-38] [QL-65] refuses a goal the form codec did not compose, and one composed for another pipeline than the request names', () => {
    expect(
      FORM_MEMORY.refuse?.({ goal: 'Just a policy.', pipeline: 'field-answer' }, registry),
    ).toMatch(/carries no form index/);
    expect(
      FORM_MEMORY.refuse?.(
        { goal: renderDocumentGoal(resumeChunk()), pipeline: 'field-answer' },
        registry,
      ),
    ).toMatch(/form index/);
    expect(FORM_MEMORY.refuse?.({ goal: GOAL, pipeline: 'field-answer' }, registry)).toBeNull();
    expect(
      FORM_MEMORY.refuse?.({ goal: fieldGoal(), pipeline: 'field-answer' }, registry),
    ).toBeNull();
    expect(
      FORM_MEMORY.refuse?.({ goal: suggestionsGoal(), pipeline: 'answer-suggestions' }, registry),
    ).toBeNull();
    expect(FORM_MEMORY.refuse?.({ goal: GOAL, pipeline: 'answer-suggestions' }, registry)).toBe(
      'form-memory runs the form pipeline its goal was composed for: the goal is for field-answer, the request names answer-suggestions',
    );
    expect(FORM_MEMORY.refuse?.({ goal: GOAL }, registry)).toMatch(/the request names none$/);
  });

  it('[QL-65] reports what a reader of the suggestions run withholds, as that pipeline declares it', async () => {
    const ports = memoryPorts({}, sampleFacts);
    const deps = orchestrationDeps(
      ports,
      (request, onOpened) => {
        const run = childRun(
          'answer-suggestions',
          readoutTrace({
            pipeline: 'answer-suggestions',
            goal: request.goal,
            artifact: sampleSuggestions(),
            locations: [
              'summary',
              'field.1',
              'field.1.1',
              'field.2',
              'field.3',
              'field.3.1',
              'field.3.2',
            ],
            criteria: request.criteria ?? [],
            results: [passed('c1', 'grounding', ['field.1.1'])],
            // A mislabelled draft is kept from the operator; a repeat is not.
            findings: [
              faulting('mislabelled', ['field.3.2']),
              faulting('duplicate', ['field.3.1']),
            ],
          }),
        );
        onOpened?.(run);
        return Promise.resolve(run);
      },
      { pipelines: () => registry },
    );
    const record = await performed(
      FORM_MEMORY,
      { goal: suggestionsGoal([]), pipeline: 'answer-suggestions', criteria: policyCriteria() },
      deps,
      { context: await FORM_MEMORY.context(ports) },
    );
    expect(record.pipeline).toBe('answer-suggestions');
    expect(record.steps[FORM_MEMORY_TARGET_STEP]).toMatchObject({
      status: 'complete',
      runIds: ['answer-suggestions-run'],
      report: {
        admission: 'admitted',
        withheld: [{ ref: 'field.3.2', source: 'finding', by: 'mislabelled', note: null }],
      },
    });
  });

  it('[QL-38] run over the runner, the answerer sees the recalled evidence and the request’s rubric, and the record reports the admission', async () => {
    const ports = memoryPorts({}, sampleFacts);
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
    const record = await performed(
      FORM_MEMORY,
      { goal: GOAL, pipeline: 'field-answer', criteria },
      deps,
      { context: await FORM_MEMORY.context(ports) },
    );

    expect(record.status).toBe('complete');
    expect(record.pipeline).toBe('field-answer');
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
    expect(record.steps[FORM_MEMORY_TARGET_STEP]).toMatchObject({
      status: 'complete',
      reason: null,
      runIds: ['field-answer-run'],
      counts: { iterations: 1 },
      report: { admission: 'admitted', withheld: [] },
    });
    expect(record.request.criteriaProvided).toBe(true);
  });

  it('[QL-67] declares the shape of what it records at open and of what its target reports, and the shapes read what it writes', async () => {
    expect(Object.keys(FORM_MEMORY.reports)).toEqual([FORM_MEMORY_TARGET_STEP]);
    const ports = memoryPorts({}, sampleFacts);
    expect(FORM_MEMORY.contextSchema.safeParse(await FORM_MEMORY.context(ports)).success).toBe(
      true,
    );
    expect(FORM_MEMORY.contextSchema.safeParse({ bogus: true }).success).toBe(false);
    const target = FORM_MEMORY.reports[FORM_MEMORY_TARGET_STEP];
    expect(
      target?.safeParse({
        admission: 'admitted',
        withheld: [{ ref: 'field.3.2', source: 'finding', by: 'mislabelled', note: null }],
      }).success,
    ).toBe(true);
    expect(target?.safeParse({ admission: 'maybe', withheld: [] }).success).toBe(false);
  });
});
