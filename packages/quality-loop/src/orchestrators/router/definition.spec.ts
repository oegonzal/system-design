import type { PipelineSummary, StartOrchestrationRequest } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { decision, runRecord, traceOf } from '../../core/testing';
import { validateOrchestrator } from '../runner/definition';
import { orchestrationDeps, performed, summaryOf } from '../runner/testing';
import { ROUTER } from './definition';
import type { BriefClassifier, Classification, RouterPorts } from './ports';

const summaries = (...ids: string[]): PipelineSummary[] => ids.map((id) => summaryOf(id));

const classifier = (answer: Classification | null, enabled = true): BriefClassifier => ({
  enabled,
  model: enabled ? 'test-model' : null,
  classify: () => Promise.resolve(answer),
});

const ports = (c: BriefClassifier): RouterPorts => ({
  classifier: c,
  llm: { enabled: c.enabled, model: c.model, reason: c.enabled ? null : 'no-key' },
});

const request: StartOrchestrationRequest = { goal: 'g' };

/** A run through the router with the registry and classifier given; records what the judge was asked. */
async function perform(registry: PipelineSummary[], c: BriefClassifier) {
  const asked: { pipeline: string; maxIterations: number | undefined }[] = [];
  const routes: string[][] = [];
  const spying: BriefClassifier = {
    ...c,
    classify: (goal, offered) => {
      routes.push(offered.map((route) => route.id));
      return c.classify(goal, offered);
    },
  };
  const deps = orchestrationDeps<RouterPorts>(
    ports(spying),
    (req, onOpened) => {
      asked.push({ pipeline: req.pipeline, maxIterations: req.maxIterations });
      const run = runRecord(
        'judged',
        traceOf({ decision: decision({ scores: { dimensions: {}, overall: 77 } }) }),
        { pipeline: req.pipeline },
      );
      onOpened?.(run);
      return Promise.resolve(run);
    },
    { pipelines: () => registry },
  );
  const record = await performed(ROUTER, request, deps, {
    context: await ROUTER.context(deps.ports),
  });
  return { record, asked, routes };
}

describe('the router orchestrator', () => {
  it('[QL-19] is valid data: a classify, then a judge whose pipeline is whatever classify chose', () => {
    expect(() => validateOrchestrator(ROUTER as never)).not.toThrow();
    expect(ROUTER.takesTarget).toBe(false);
    expect(ROUTER.steps.map((step) => step.id)).toEqual(['classify', 'judge']);
  });

  it('[QL-19] offers every registered brief-taking pipeline as a route, runs the one chosen, and judges once', async () => {
    const { record, asked, routes } = await perform(
      summaries('tiny', 'other', 'memory-recall'),
      classifier({ pipeline: 'other', rationale: 'it is the other kind' }),
    );
    expect(routes).toEqual([['tiny', 'other']]);
    expect(record.status).toBe('complete');
    expect(record.pipeline).toBeNull();
    expect(record.context).toEqual({
      classifier: { enabled: true, model: 'test-model', reason: null },
    });
    expect(record.steps['classify']).toMatchObject({
      status: 'complete',
      note: 'it is the other kind',
      counts: { routes: 2 },
      runIds: [],
    });
    expect(asked).toEqual([{ pipeline: 'other', maxIterations: 1 }]);
    expect(record.steps['judge']).toMatchObject({
      status: 'complete',
      runIds: ['judged'],
      counts: { iterations: 1, overall: 77 },
    });
  });

  it('[QL-19] a brief the classifier cannot place fails the run: dispatch is the deliverable', async () => {
    const { record, asked } = await perform(summaries('tiny', 'other'), classifier(null));
    expect(asked).toEqual([]);
    expect(record.status).toBe('failed');
    expect(record.error?.name).toBe('Unrouted');
    expect(record.steps['classify']).toMatchObject({
      status: 'failed',
      reason: 'unclassified',
      counts: { routes: 2 },
    });
    expect(record.steps['judge']).toMatchObject({
      status: 'skipped',
      reason: 'upstream-failed',
      note: 'classify',
    });
  });

  it('[QL-19] no model, or no pipeline that takes a brief, is said in the same place', async () => {
    const disabled = await perform(summaries('tiny'), classifier(null, false));
    expect(disabled.record.context).toEqual({
      classifier: { enabled: false, model: null, reason: 'no-key' },
    });
    expect(disabled.record.steps['classify']).toMatchObject({
      status: 'failed',
      reason: 'classifier-disabled',
    });
    expect(disabled.record.error?.message).toContain('no-key');

    const nowhere = await perform(
      summaries('memory-recall', 'experience-digest'),
      classifier({ pipeline: 'memory-recall', rationale: 'never asked' }),
    );
    expect(nowhere.routes).toEqual([]);
    expect(nowhere.record.steps['classify']).toMatchObject({
      status: 'failed',
      reason: 'no-routes',
    });
  });
});
