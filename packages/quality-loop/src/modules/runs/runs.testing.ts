import { QualityRun } from '@sysdesign/db';
import { fakeLlm, result, sequencedLlm, tinyPipeline } from '../../core/testing';
import { bootApp, claimDumpDir } from '../http/testing';
import { PIPELINES_TOKEN, QUALITY_LOOP_LLM } from './tokens';

/**
 * What every spec of the runs module boots and polls: the fake models, the
 * booted app, the tables it clears and the dump directory it claims.
 */
export const DUMP_DIR = claimDumpDir('quality-loop');
export const TABLES = [QualityRun];

export const tinyOnly = () => [PIPELINES_TOKEN, new Map([['tiny', tinyPipeline()]])] as const;

/** The fake model every boot here answers with: a rubric, an artifact, no findings, one pass. */
export const canned = () =>
  fakeLlm(
    { criteria: [{ kind: 'must', statement: 'has text' }] },
    { text: 'made', parts: ['one'] },
    { findings: [] },
    {
      results: [result({ criterionId: 'c1', locationRefs: ['text'] })],
      advisoryVerdict: null,
    },
  );

/** The real module over real HTTP; a fresh instance shares nothing but the database. */
export const boot = () => bootApp([[QUALITY_LOOP_LLM, canned()], tinyOnly()]);

/**
 * A model whose iteration 1 judges c1 partial and revises, and whose
 * iteration 2 passes it. Gated after `CALLS_IN_ITERATION_1`, it holds a run
 * in flight with one iteration recorded.
 */
export const revisingModel = () =>
  sequencedLlm(
    { criteria: [{ kind: 'must', statement: 'has text' }] },
    { text: 'made', parts: ['one'] },
    { findings: [] },
    {
      results: [result({ criterionId: 'c1', result: 'partial', locationRefs: ['text'] })],
      advisoryVerdict: null,
    },
    {
      results: [result({ criterionId: 'c1', locationRefs: ['text'] })],
      advisoryVerdict: null,
    },
  );
export const CALLS_IN_ITERATION_1 = 4; // criteria, producer, critic, evaluator

/** Read until `done` holds — a fake model moves within a second; the last read is returned either way. */
export const pollUntil = async <T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
): Promise<T> => {
  let value = await read();
  for (let attempt = 0; attempt < 100 && !done(value); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    value = await read();
  }
  return value;
};

export const HOURS = 60 * 60 * 1000;
