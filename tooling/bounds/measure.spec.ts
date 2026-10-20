import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_RUNS_DIR, loadMeasureConfig, MeasureConfigError } from './config';
import {
  FIXTURE_LAYOUT,
  fixturesToWrite,
  measuredCalls,
  measuredFixtures,
  percentile,
  pipelineFixture,
} from './measure';
import { type RecordedCall, readRecordedCalls } from './recorded';
import { measureReply, replyOf } from './reply';

/** The JSON Schema a producer showed its model: sizes at their targets. */
const producerSchema = {
  type: 'object',
  required: ['summary', 'items'],
  properties: {
    summary: { type: 'string', maxLength: 10 },
    items: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 5 } },
    note: { anyOf: [{ type: 'string', maxLength: 4 }, { type: 'null' }] },
  },
};

const lensSchema = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: { rationale: { type: 'string', maxLength: 20 }, type: { type: 'string' } },
      },
    },
  },
};

describe('measureReply', () => {
  it('[QL-49] measures every string and list the call gave a size, by bound path, against what that call asked', () => {
    const reply = {
      summary: 'twelve chars',
      items: ['a', 'bbbbbb', 'c'],
      note: null,
      extra: 'never walked',
    };
    expect(measureReply(reply, producerSchema)).toEqual([
      { path: 'summary', size: 12, asked: 10 },
      { path: 'items', size: 3, asked: 2 },
      { path: 'items[]', size: 1, asked: 5 },
      { path: 'items[]', size: 6, asked: 5 },
      { path: 'items[]', size: 1, asked: 5 },
    ]);
    // A union is walked down the branch the value took; a record's values are `*`.
    expect(measureReply({ note: 'long' }, producerSchema)).toEqual([
      { path: 'note', size: 4, asked: 4 },
    ]);
    const record = {
      type: 'object',
      additionalProperties: { type: 'string', maxLength: 3 },
    };
    expect(measureReply({ a: 'xy', b: 'xyz1' }, record)).toEqual([
      { path: '*', size: 2, asked: 3 },
      { path: '*', size: 4, asked: 3 },
    ]);
  });

  it('[QL-49] reads the reply as the model wrote it — the candidate holding every required key — before the response it was kept as', () => {
    const written = { summary: 'twelve chars', items: [] };
    const text = `Here is an example: {"summary": "no"}\n\`\`\`json\n${JSON.stringify(written)}\n\`\`\``;
    // A response the old clamp cut to its bound measures the cut, not the write.
    expect(replyOf(text, { summary: 'twelve cha', items: [] }, producerSchema)).toEqual(written);
    expect(replyOf('no object at all', { summary: 'kept', items: [] }, producerSchema)).toEqual({
      summary: 'kept',
      items: [],
    });
    expect(replyOf('{"summary": "cut mid', null, producerSchema)).toBeNull();
  });
});

describe('the measurement of a runs folder', () => {
  let dir: string;
  const run = (
    name: string,
    manifest: Record<string, unknown>,
    calls: Record<string, { meta: Record<string, unknown>; response?: unknown }>,
  ) => {
    const root = join(dir, name);
    mkdirSync(join(root, '05-llm'), { recursive: true });
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(
      join(root, '03-pipeline.json'),
      JSON.stringify({
        id: 'tiny',
        critics: [{ id: 'critic.a', samples: 2 }],
        evaluators: [],
      }),
    );
    for (const [stem, { meta, response }] of Object.entries(calls)) {
      writeFileSync(join(root, '05-llm', `${stem}.meta.json`), JSON.stringify(meta));
      writeFileSync(
        join(root, '05-llm', `${stem}.response.json`),
        JSON.stringify(response ?? null),
      );
    }
  };
  const meta = (fields: Record<string, unknown>) => ({
    ordinal: 1,
    maxTokens: 10_000,
    durationMs: 1_000,
    outcome: 'ok',
    usage: { inputTokens: 1, outputTokens: 900 },
    schema: producerSchema,
    text: null,
    ...fields,
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'measure-bounds-'));
    run(
      '2026-10-02T00-00-00-000-aaaaaa-quality',
      { kind: 'quality', startedAt: '2026-10-02T00:00:00.000Z' },
      {
        '01.producer.1': {
          meta: meta({
            scope: 'producer',
            apiCalls: 2,
            text: JSON.stringify({ summary: 'twelve chars', items: ['a', 'b', 'c'] }),
          }),
          response: { summary: 'twelve chars', items: ['a', 'b'] },
        },
        '02.critic.a.s1.1': {
          meta: meta({
            scope: 'critic.a.s1',
            outcome: 'schema-miss',
            schema: lensSchema,
            text: '{"findings": [{"rationale": "a reason", "type": "bogus"}]}',
            usage: { inputTokens: 1, outputTokens: 4_000 },
          }),
        },
        // A runaway turn stopped at the provider's ceiling measures the fault, not the lens.
        '03.critic.a.s2.1': {
          meta: meta({
            scope: 'critic.a.s2',
            outcome: 'error',
            schema: lensSchema,
            usage: { inputTokens: 1, outputTokens: 128_000 },
          }),
        },
        '04.critic.gone.s1.1': { meta: meta({ scope: 'critic.gone.s1' }) },
      },
    );
    run(
      '2026-09-01T00-00-00-000-bbbbbb-quality',
      { kind: 'quality', startedAt: '2026-09-01T00:00:00.000Z' },
      { '01.producer.1': { meta: meta({ scope: 'producer' }), response: { summary: 'old' } } },
    );
    run('2026-10-02T00-00-00-000-cccccc-eval', { kind: 'eval' }, {});
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('[QL-49] reads only quality runs since the date asked, attributes each call to its stage by the run’s own pipeline, and says what it skipped', () => {
    const { calls, skipped } = readRecordedCalls(dir, new Date('2026-10-01'));
    expect(calls.map((call) => [call.run.slice(-14), call.stage, call.role])).toEqual([
      ['aaaaaa-quality', 'producer', 'producer'],
      ['aaaaaa-quality', 'critic.a', 'critic'],
      ['aaaaaa-quality', 'critic.a', 'critic'],
    ]);
    expect(skipped).toEqual([
      '2026-10-02T00-00-00-000-aaaaaa-quality/04.critic.gone.s1.1: scope critic.gone.s1 is no stage of tiny',
    ]);
    expect(readRecordedCalls(dir, null).calls).toHaveLength(4);
  });

  it('[QL-49] writes each field where its bound is declared and each stage’s output beside its pipeline, measuring caps only on turns that answered', () => {
    const { calls } = readRecordedCalls(dir, null);
    const { fixtures, retired } = measuredFixtures(calls, ['tiny', 'idle']);
    expect(retired).toEqual([]);
    expect(fixtures.get(pipelineFixture('tiny'))).toEqual({
      since: '2026-09-01T00:00:00.000Z',
      until: '2026-10-02T00:00:00.000Z',
      runs: 2,
      fields: {
        items: { n: 1, max: 3, p99: 3, overTarget: 1 },
        'items[]': { n: 3, max: 1, p99: 1, overTarget: 0 },
        summary: { n: 2, max: 12, p99: 12, overTarget: 1 },
      },
      caps: {
        'critic.a': { n: 1, max: 4_000, p99: 4_000, maxApiCalls: null },
        producer: { n: 2, max: 900, p99: 900, maxApiCalls: 2 },
      },
    });
    // A refused reply is measured as written; a lens's fields are the engine's.
    expect(fixtures.get(FIXTURE_LAYOUT.lenses)?.fields).toEqual({
      findings: { n: 1, max: 1, p99: 1, overTarget: 0 },
      'findings[].rationale': { n: 1, max: 8, p99: 8, overTarget: 0 },
    });
    // A declared pipeline no run recorded still gets its (empty) fixture.
    expect(fixtures.get(pipelineFixture('idle'))).toEqual({
      since: null,
      until: null,
      runs: 0,
      fields: {},
      caps: {},
    });
    // A pipeline no longer declared is reported, never written.
    expect(measuredFixtures(calls, []).retired).toEqual(['tiny']);
  });

  it('[QL-49] a measurement of one pipeline writes its own fixture and its contract output’s alone, never the shared lenses’', () => {
    const { calls } = readRecordedCalls(dir, null);
    const { fixtures } = measuredFixtures(calls, ['tiny', 'idle']);
    expect([...fixturesToWrite(fixtures, null).keys()]).toEqual([...fixtures.keys()]);
    expect([...fixturesToWrite(fixtures, 'tiny').keys()]).toEqual([pipelineFixture('tiny')]);
    expect([...fixturesToWrite(fixtures, 'idle').keys()]).toEqual([pipelineFixture('idle')]);
  });

  it('[QL-49] picks the calls the time-limit spec replays: the longest, slowest, tightest, furthest past their declaration and longest per stage, each once', () => {
    const call = (name: string, fields: Partial<RecordedCall>): RecordedCall => ({
      run: 'r',
      startedAt: '2026-10-02T00:00:00.000Z',
      pipeline: 'tiny',
      stage: 'producer',
      role: 'producer',
      call: name,
      outcome: 'ok',
      maxTokens: 10_000,
      outputTokens: 1_000,
      durationMs: 10_000,
      apiCalls: null,
      reply: null,
      schema: null,
      ...fields,
    });
    const picked = measuredCalls([
      call('01.producer.1', { outputTokens: 26_918, maxTokens: 12_000 }),
      call('02.producer.2', { outcome: 'error', durationMs: 900_000 }),
      call('03.critic.a.s1.1', { stage: 'critic.a', role: 'critic', durationMs: 259_567 }),
    ]);
    expect(picked).toEqual([
      {
        run: 'r',
        call: '01.producer.1',
        maxTokens: 12_000,
        outputTokens: 26_918,
        durationMs: 10_000,
      },
      {
        run: 'r',
        call: '03.critic.a.s1.1',
        maxTokens: 10_000,
        outputTokens: 1_000,
        durationMs: 259_567,
      },
    ]);
  });

  it('[QL-49] the 99th percentile is the nearest rank', () => {
    const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(hundred, 0.99)).toBe(99);
    expect(percentile([1, 2, 3], 0.99)).toBe(3);
    expect(percentile([], 0.99)).toBe(0);
  });
});

describe('loadMeasureConfig', () => {
  it('[QL-49] reads the runs folder and the date from flags it declares, and refuses any other by name', () => {
    expect(loadMeasureConfig([])).toEqual({
      runsDir: DEFAULT_RUNS_DIR,
      since: null,
      pipeline: null,
    });
    expect(
      loadMeasureConfig(['--runs-dir=/tmp/runs', '--since=2026-10-01', '--pipeline=tiny']),
    ).toEqual({ runsDir: '/tmp/runs', since: new Date('2026-10-01'), pipeline: 'tiny' });
    expect(() => loadMeasureConfig(['--since=yesterday'])).toThrow(MeasureConfigError);
    expect(() => loadMeasureConfig(['--runs-dir'])).toThrow(/unknown or malformed flag/);
    expect(() => loadMeasureConfig(['--write'])).toThrow(
      /--runs-dir=<value>, --since=<value>, --pipeline=<value>/,
    );
  });
});
