import { EntityManager } from '@mikro-orm/postgresql';
import type { INestApplication } from '@nestjs/common';
import { bestIterationOf, type QualityRunReadDto } from '@sysdesign/contracts';
import { truncateTestTables } from '@sysdesign/db';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fakeLlm, finding, gatedLlm, result, tinyPipeline } from '../../core/testing';
import { bootApp, type Envelope, getJson, postJson } from '../http/testing';
import {
  CALLS_IN_ITERATION_1,
  DUMP_DIR,
  pollUntil,
  revisingModel,
  TABLES,
  tinyOnly,
} from './runs.testing';
import { QUALITY_LOOP_LLM } from './tokens';

/**
 * A model whose run is judged short of a perfect score: two criteria, both
 * passed, and one low finding at the part — so there is a bar above what the
 * run scores to hold it to, and a location its finding withholds.
 */
const faulting = () =>
  fakeLlm(
    {
      criteria: [
        { kind: 'must', statement: 'has text' },
        { kind: 'nice', statement: 'has parts' },
      ],
    },
    { text: 'made', parts: ['one'] },
    {
      findings: [
        finding({
          type: 'gap',
          severity: 'low',
          locationRefs: ['part.1'],
          rationale: 'the part says little',
        }),
      ],
    },
    {
      results: [
        result({ criterionId: 'c1', locationRefs: ['text'] }),
        result({ criterionId: 'c2', locationRefs: ['part.1'] }),
      ],
      advisoryVerdict: null,
    },
  );

describe('a run’s readout on its read', () => {
  let app: INestApplication;
  let url: string;
  let em: EntityManager;

  const read = async (base: string, id: string): Promise<QualityRunReadDto> =>
    (await getJson<Envelope<QualityRunReadDto>>(base, `/runs/${id}`)).data;

  /** A tiny run started with 202, by its id. */
  const start = async (base: string, body: Record<string, unknown>): Promise<string> => {
    const started = await postJson(base, '/runs', { pipeline: 'tiny', goal: '# Goal', ...body });
    expect(started.status).toBe(202);
    return ((await started.json()) as Envelope<{ runId: string }>).data.runId;
  };

  /** The run once it is no longer running — a fake model settles within a second. */
  const settled = (base: string, id: string): Promise<QualityRunReadDto> =>
    pollUntil(
      () => read(base, id),
      (run) => run.status !== 'running',
    );

  beforeAll(async () => {
    ({ app, url } = await bootApp([[QUALITY_LOOP_LLM, faulting()], tinyOnly()]));
    em = app.get(EntityManager);
    await truncateTestTables(em, TABLES);
  });

  afterAll(async () => {
    await truncateTestTables(em, TABLES);
    await app.close();
    rmSync(DUMP_DIR, { recursive: true, force: true });
  });

  it('[QL-83] a settled run answers its admission at the bar it was held to — its pipeline’s, or the one it raised — and the locations its findings withhold', async () => {
    const plain = await settled(url, await start(url, { maxIterations: 1 }));
    const overall = bestIterationOf(plain)?.decision.scores.overall ?? 0;
    // Over the pipeline's bar and short of perfect: there is a bar above it to raise to.
    expect(overall).toBeGreaterThanOrEqual(tinyPipeline().policy.thresholds.acceptAt);
    expect(overall).toBeLessThan(100);
    expect(plain.readout).toEqual({
      admission: 'admitted',
      withheld: [{ ref: 'part.1', source: 'finding', by: 'gap', note: 'the part says little' }],
    });

    // The same model, held a point above what it scores: decided against that bar, and read at it.
    const bar = Math.ceil(overall) + 1;
    const raised = await settled(url, await start(url, { maxIterations: 1, acceptAt: bar }));
    expect(raised.request.acceptAt).toBe(bar);
    expect(raised.trace?.finalDecision).not.toBe('accept');
    expect(raised.readout).toEqual({ admission: 'fell-short', withheld: plain.readout?.withheld });
  });

  it('[QL-83] nothing is read while the run is still running, whatever it has recorded so far', async () => {
    // The model waits at the gate once iteration 1 is recorded: the run stays in flight with a trace.
    const gated = gatedLlm(revisingModel(), CALLS_IN_ITERATION_1);
    const held = await bootApp([[QUALITY_LOOP_LLM, gated], tinyOnly()]);
    try {
      const id = await start(held.url, { maxIterations: 2 });
      const inFlight = await pollUntil(
        () => read(held.url, id),
        (run) => run.trace !== null,
      );
      expect(inFlight).toMatchObject({ status: 'running', readout: null });
      expect(inFlight.trace?.iterations).toHaveLength(1);
      gated.release();
      expect((await settled(held.url, id)).readout).toEqual({
        admission: 'admitted',
        withheld: [],
      });
    } finally {
      await held.app.close();
    }
  });
});
