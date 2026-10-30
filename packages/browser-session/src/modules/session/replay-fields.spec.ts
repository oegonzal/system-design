import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryHostUnreachable, type MemoryClient } from '@sysdesign/agentic-memory-client';
import { memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';
import {
  answeringFixture,
  FIELD_ANSWER_PIPELINE_ID,
  type MemoryRecordDto,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionRefused } from '../../core/unit-advice';
import { replayFields, type ReplayFieldsOptions } from './replay-fields';
import {
  AT,
  AUTH_FACT,
  embedder,
  JUDGED,
  KNOWS_AT_ACME,
  KNOWS_AT_GLOBEX,
  NOTICE_ANSWER,
  PROJECT,
  QUESTION_AUTH,
  QUESTION_KNOWS,
  QUESTION_NOTICE,
  recordedGoal,
  RUN,
  SESSION,
  SETTINGS,
  STRATEGY,
  TENANT,
  unitValue,
  writeDumps,
} from './replay-fields.testing';

type ReplayFieldsDeps = Parameters<typeof replayFields>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The replay over the shipping recall and judge, against the runtime itself:
 * a space made from a strategy of one semantic register, seeded with facts of
 * the subject's, of two units of work and a standing answer as the brain
 * teaches one, and a folder of dumps as a session writes them. Nothing is
 * scripted of the recall: what the replay lists is what the engine serves
 * under each page's scope.
 */
describe('replay-fields over a folder of session dumps', () => {
  let dumps: string;
  let out: string;
  beforeEach(async () => {
    dumps = await mkdtemp(join(tmpdir(), 'replay-fields-dumps-'));
    out = await mkdtemp(join(tmpdir(), 'replay-fields-out-'));
  });
  afterEach(async () => {
    await rm(dumps, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  });

  /** A loop holding the recorded run, a space seeded with four facts, and the deps over both. */
  async function harness() {
    // The loop's clock and the replay's agree, so a judged run's beat is never read as stale.
    const loop = new FakeLoop({ now: () => AT });
    const { client, records } = memoryClientUnderTest({
      strategies: { [RUN]: STRATEGY },
      embedder,
    });
    const { space } = await client.ensureSpace(SETTINGS.binding.space.name, { runId: RUN });
    const remember = (candidate: unknown, unitKey: string | null, source = 'memory-ingest:notes') =>
      client.remember(space.id, {
        register: 'facts',
        scope: {
          tenant: TENANT,
          project: PROJECT,
          ...(unitKey === null ? {} : { unit: unitValue(unitKey) }),
        },
        candidate,
        provenance: { source, sourceRunId: null },
      });
    const auth = (await remember(AUTH_FACT.candidate, null)).record;
    await remember(KNOWS_AT_ACME.candidate, 'company=acme');
    const globex = (await remember(KNOWS_AT_GLOBEX.candidate, 'company=globex')).record;
    await remember(NOTICE_ANSWER.candidate, null, 'operator:chat');
    const { runId } = loop.startRun({ pipeline: FIELD_ANSWER_PIPELINE_ID, goal: recordedGoal() });
    loop.complete(runId);
    await writeDumps(dumps, runId);
    const logged: string[] = [];
    const deps: ReplayFieldsDeps = {
      loop: new FakeLoopClient(loop),
      memory: client,
      brainSettings: SETTINGS,
      answering: answeringFixture(),
      memoryTenant: TENANT,
      clock: { now: () => new Date(AT) },
      log: (text) => logged.push(text),
      loopOptions: {
        pollEveryMs: 0,
        staleAfterMs: 60_000,
        now: () => Date.parse(AT),
        // The judge's run settles on the first poll's sleep, with the answers the fixture declares.
        sleep: async () => {
          const running = [...loop.runs.values()].find((run) => run.status === 'running');
          if (running) {
            loop.complete(running.runId, [{ overall: 90, decision: 'accept', artifact: JUDGED }]);
          }
        },
      },
    };
    const options = (overrides: Partial<ReplayFieldsOptions> = {}): ReplayFieldsOptions => ({
      sessionsDir: dumps,
      tenant: undefined,
      sample: null,
      judge: false,
      retract: null,
      out,
      ...overrides,
    });
    return { loop, client, space, records, deps, logged, options, auth, globex };
  }

  const detailOf = async (outDir: string) =>
    JSON.parse(await readFile(join(outDir, 'report.json'), 'utf8'));
  const rowsOf = async (outDir: string): Promise<string[]> =>
    (await readFile(join(outDir, 'rows.csv'), 'utf8')).trim().split('\n');

  it('[BRW-21] recalls once per distinct question under the page’s own scope — the open unit’s key or none — and finds what the recorded run cited by the declared rules: an ingested fact by its words contained, a standing answer by the question’s identity', async () => {
    const { records, deps, options } = await harness();
    const before = records.all().length;
    const report = await replayFields(deps, options());
    expect(report).toMatchObject({
      fields: 4,
      pages: 2,
      citedFound: 2,
      cited: 2,
      // Neither store's rendering of a fact equals the other's: the rules that read the facts behind them find both.
      citedBy: { equal: 0, identity: 1, contained: 2 },
      unitLeak: 0,
      tenantLeak: 0,
      recordedLatency: { p50: null, p90: null },
      judged: null,
      unresolvedRuns: 1,
      unresolvedOrchestrations: 0,
      retraction: null,
    });
    expect(report.latency.p50).not.toBeNull();
    expect(report.outDir.startsWith(out)).toBe(true);
    // Nothing live was touched: no record written, no teaching, nothing closed.
    expect(records.all().length).toBe(before);
    expect(records.all().every((record) => record.status === 'active')).toBe(true);

    const rows = await rowsOf(report.outDir);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toBe(
      'session,step,ref,question,fieldType,unit,recordedRoute,recordedSource,recordedRests,recordedAdmission,recordedCited,recordedValue,recordedOperatorAnswer,newEvidence,citedFound,citedEqual,citedByIdentity,citedContained,citedMissing,newOnly,unitLeak,tenantLeak,recallLatencyMs,requests,newRoute,newSource,newValue,newAdmission,newWithheld,verdict',
    );
    // The page in the unit: three questions, three requests; the subject's facts and this unit's answer
    // recalled, the other unit's never. m1's fact found by its words contained in the record's value;
    // m3's answer by the question's identity — and its words contained too; every text new, since the
    // runtime renders a fact as the loop never did.
    expect(rows[1]).toContain(
      `${SESSION},3,e1,${QUESTION_AUTH},text,company=acme,fill,memory,stated,admitted,m1,"${AUTH_FACT.candidate.value}",,3,1,0,0,1,0,3,0,0,`,
    );
    expect(rows[1]).toMatch(/,\d+,3,,,,,,$/);
    expect(rows[2]).toContain(
      `,e2,${QUESTION_KNOWS},text,company=acme,ask-operator,loop,none,admitted,,,Yes,3,0,0,0,0,0,3,0,0,`,
    );
    expect(rows[3]).toContain(
      `,e3,${QUESTION_NOTICE},text,company=acme,fill,memory,stated,admitted,m3,Two weeks,,3,1,0,1,1,0,3,0,0,`,
    );
    // The page outside any unit, whose run the loop lost: one question, the subject's two facts — the
    // unit's answer is nobody's here — and nothing to compare.
    expect(rows[4]).toContain(
      `${SESSION},2,e1,${QUESTION_AUTH},text,,fill,memory,stated,admitted,m1,"${AUTH_FACT.candidate.value}",,2,,,,,,,0,0,`,
    );
    expect(rows[4]).toMatch(/,\d+,1,,,,,,$/);

    const detail = await detailOf(report.outDir);
    expect(detail.summary).toEqual({ ...report, outDir: undefined });
    expect(detail.replayId).toMatch(UUID);
    expect(detail.evidenceByKind).toEqual({ facts: 5 });
    expect(detail.evidenceByOrigin).toEqual({ 'memory-ingest:notes': 3, 'operator:chat': 2 });
    expect(detail.byFieldType.text).toEqual({ fields: 4, cited: 2, citedFound: 2 });
    expect(detail.pages).toEqual({
      recorded: 2,
      replayed: 2,
      judged: 0,
      unjudgeable: 0,
      withoutRun: 0,
    });
    expect(detail.faults).toEqual({ recall: [], judge: [] });
  });

  it('[BRW-21] judges the sampled pages again through the shipping judge under the replay’s own id, routes them by the shipped settings, and holds each typed value to the operator’s answer for its unit', async () => {
    const { loop, deps, options } = await harness();
    const report = await replayFields(deps, options({ judge: true, sample: 1 }));
    const detail = await detailOf(report.outDir);
    expect(detail.faults).toEqual({ recall: [], judge: [] });
    // The sample is drawn across the fields the operator answered: one such field, on the page in the unit.
    expect(report.judged).toEqual({ filled: 3, asked: 0, wrong: 1 });
    const judged = loop.startRequests.filter((request) =>
      request.openedBy?.label.includes('replay'),
    );
    expect(judged).toHaveLength(1);
    // Opened by the replay, never as the recorded session, which the label names.
    expect(judged[0]?.openedBy).toEqual({
      kind: 'browser-session',
      id: detail.replayId,
      label: `step 3 · replay of ${SESSION}`,
    });
    expect(judged[0]?.openedBy?.id).not.toBe(SESSION);
    expect(judged[0]?.goal).toContain(AUTH_FACT.text);
    expect(judged[0]?.goal).toContain(KNOWS_AT_ACME.text);
    expect(judged[0]?.goal).toContain(NOTICE_ANSWER.text);
    expect(judged[0]?.goal).not.toContain(KNOWS_AT_GLOBEX.text);
    const rows = await rowsOf(report.outDir);
    expect(rows[1]).toMatch(
      /,fill,memory,"Yes, authorised to work in this country",admitted,0,same-fill$/,
    );
    expect(rows[2]).toMatch(/,fill,memory,No,admitted,0,wrong$/);
    expect(rows[3]).toMatch(/,fill,memory,Two weeks,admitted,0,same-fill$/);
    expect(rows[4]).toMatch(/,,,,,,$/);
    expect(detail.judgedRecorded).toEqual({ filled: 2, asked: 1 });
    expect(detail.pages.judged).toBe(1);
  });

  it('judges every page without a sample, and counts a page whose dump kept no rubric as unjudgeable', async () => {
    const { deps, options } = await harness();
    const report = await replayFields(deps, options({ judge: true }));
    expect(report.judged).toEqual({ filled: 3, asked: 0, wrong: 1 });
    expect((await detailOf(report.outDir)).pages).toMatchObject({ judged: 1, unjudgeable: 1 });
  });

  it('[BRW-21] counts a leak off the scope the recall answered a record under: an engine that served another unit’s record is caught on the page, never excused by a read that cannot see it', async () => {
    const { client, deps, options, globex } = await harness();
    // The engine made to leak: every recall ranks the other unit's answer first, as a filter that let it through would.
    const leaking = new Proxy(client, {
      get(target, property, receiver) {
        if (property !== 'recall') return Reflect.get(target, property, receiver);
        return async (...args: Parameters<MemoryClient['recall']>) => {
          const result = await target.recall(...args);
          const [first] = result.items;
          return first === undefined
            ? result
            : { ...result, items: [{ ...first, record: globex }, ...result.items] };
        };
      },
    });
    const report = await replayFields({ ...deps, memory: leaking }, options());
    // Once per page, by record: under the acme unit the record names globex; outside any unit it names a unit at all.
    expect(report).toMatchObject({ unitLeak: 2, tenantLeak: 0 });
  });

  it('[BRW-22] a host that does not answer a page is that page’s fault, recorded on its report, and the replay goes on to the next', async () => {
    const { client, deps, options } = await harness();
    let silentCalls = 3;
    const flaky = new Proxy(client, {
      get(target, property, receiver) {
        if (property !== 'recall') return Reflect.get(target, property, receiver);
        return (...args: Parameters<MemoryClient['recall']>) => {
          if (silentCalls > 0) {
            silentCalls -= 1;
            return Promise.reject(new MemoryHostUnreachable('ECONNREFUSED'));
          }
          return target.recall(...args);
        };
      },
    });
    const report = await replayFields({ ...deps, memory: flaky }, options());
    expect(report).toMatchObject({ pages: 2, fields: 4 });
    const detail = await detailOf(report.outDir);
    expect(detail.faults.recall).toEqual([
      '2026-10-20T10-00-00-000-aaaaaa-session step 3: the memory host is unreachable: ECONNREFUSED',
    ]);
    const rows = await rowsOf(report.outDir);
    // The silent page's rows stand, with nothing recalled; the next page recalled as ever.
    expect(rows[1]).toContain(`,m1,"${AUTH_FACT.candidate.value}",,0,0,0,0,0,1,0,0,0,`);
    expect(rows[4]).toContain(`,m1,"${AUTH_FACT.candidate.value}",,2,,,,,,,0,0,`);
  });

  it('[BRW-21] measures retraction when asked: a sample of the recalled records closed with the replay’s reason, shown closed by history, and recalled by no page again', async () => {
    const { client, space, deps, options, auth } = await harness();
    const report = await replayFields(deps, options({ retract: 1 }));
    expect(report.retraction).toEqual({
      sampled: 1,
      recalledAfter: 0,
      lineageShown: 1,
      faults: [],
    });
    const scope = { tenant: TENANT, project: PROJECT };
    const lineage = await client.history(space.id, { recordId: auth.id, scope });
    // The reason the owner reads off the lineage, in the replay's own words.
    expect(lineage.map(({ status, closeReason }) => [status, closeReason])).toEqual([
      ['invalidated', 'retracted by replay-fields'],
    ]);
    const recalled = await client.recall(space.id, { scope, text: QUESTION_AUTH });
    expect(
      recalled.items.map(({ record }: { record: MemoryRecordDto }) => record.id),
    ).not.toContain(auth.id);
  });

  it('refuses by name a brain that is not the memory brain, and a tenant nobody named', async () => {
    const { deps, options } = await harness();
    await expect(
      replayFields({ ...deps, brainSettings: { adapter: 'loop' }, memory: null }, options()),
    ).rejects.toThrow(SessionRefused);
    await expect(
      replayFields({ ...deps, brainSettings: { adapter: 'loop' }, memory: null }, options()),
    ).rejects.toThrow('the chosen brain is loop');
    await expect(replayFields({ ...deps, memoryTenant: 'none' }, options())).rejects.toThrow(
      '--tenant <name>, or MEMORY_TENANT',
    );
    // The flag names the tenant over the environment's placeholder.
    await expect(
      replayFields({ ...deps, memoryTenant: 'none' }, options({ tenant: TENANT })),
    ).resolves.toMatchObject({ pages: 2 });
  });
});
