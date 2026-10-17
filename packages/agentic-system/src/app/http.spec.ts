import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { GOLDEN_STRATEGY } from '@sysdesign/agentic-memory/testing';
import { MemoryDesignCycle, MemoryRecord, MemorySpace, truncateTestTables } from '@sysdesign/db';
import {
  MEMORY_DESIGN_CYCLE_STATUSES,
  type ConsolidationResultDto,
  type MemoryRecordDto,
  type MemorySpaceDto,
  type RecallResultDto,
  type WriteResultDto,
} from '@sysdesign/contracts';

import { bootApp } from './testing';
import type { FakeLoopClient } from '../designs/testing';

type Envelope<T> = { data: T };
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

/** The run whose best iteration holds a memory strategy: one a model wrote in a live run, kept as found. */
const STRATEGY_RUN = 'strategy-run-1';
const TABLES = [MemoryDesignCycle, MemoryRecord, MemorySpace];

describe('the agentic-system HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let loop: FakeLoopClient;
  beforeAll(async () => {
    ({ app, url, loop } = await bootApp({ artifacts: new Map([[STRATEGY_RUN, GOLDEN_STRATEGY]]) }));
    await truncateTestTables(app.get(EntityManager).fork(), TABLES);
  });
  afterAll(async () => {
    await truncateTestTables(app.get(EntityManager).fork(), TABLES);
    await app.close();
  });

  const send = (method: string, path: string, body?: unknown): Promise<Response> =>
    fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** Poll the row off the request path until the detached cycle reaches a terminal status. */
  const settle = async (id: string): Promise<{ status: string }> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const got = await json<Envelope<{ status: string }>>(await send('GET', `/designs/${id}`));
      if (got.data.status === 'stored' || got.data.status === 'failed') return got.data;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`cycle ${id} did not settle`);
  };

  it('[AGS-4] health is ok', async () => {
    expect((await send('GET', '/health')).status).toBe(200);
  });

  it('[AGS-4] starts a cycle from a brief (202, running), coaches it, and reads it back', async () => {
    const started = await send('POST', '/designs', { goal: '# Design a memory service' });
    expect(started.status).toBe(202);
    const body = await json<Envelope<{ id: string; status: string }>>(started);
    expect(body.data.status).toBe('running');
    expect(MEMORY_DESIGN_CYCLE_STATUSES as readonly string[]).toContain(body.data.status);

    // The cycle runs off the request path: the loop coaches a strategy, then the run is digested.
    const final = await settle(body.data.id);
    expect(final.status).toBe('stored');
    // The loop was asked to run the memory-architecture pipeline, straight from the brief.
    expect(loop.runs.map((request) => request.pipeline)).toContain('memory-architecture');
  });

  it('[AGS-4] 404s an unknown cycle and 400s a request with no goal', async () => {
    expect((await send('GET', '/designs/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    expect((await send('POST', '/designs', {})).status).toBe(400);
  });

  it('[AGS-8] makes a space from a run’s strategy and walks a memory through every verb', async () => {
    const created = await send('POST', '/spaces', { runId: STRATEGY_RUN });
    expect(created.status).toBe(201);
    const space = (await json<Envelope<MemorySpaceDto>>(created)).data;
    expect(space).toMatchObject({ designRunId: STRATEGY_RUN, policySource: 'memory/spec' });
    expect(space.report.problems).toEqual([]);
    expect(
      (await json<Envelope<MemorySpaceDto>>(await send('GET', `/spaces/${space.id}`))).data,
    ).toEqual(space);

    const verb = async <T>(name: string, body: unknown): Promise<T> => {
      const response = await send('POST', `/spaces/${space.id}/${name}`, body);
      expect(response.status).toBe(200);
      return (await json<Envelope<T>>(response)).data;
    };
    const scope = { tenant: 'acme' };
    const provenance = { source: 'http-spec', sourceRunId: null };
    const language = (value: string) => ({
      subject: 'billing-service',
      predicate: 'language',
      value,
      validFrom: null,
    });

    const remembered = await verb<WriteResultDto>('remember', {
      register: 'semantic_fact',
      scope,
      candidate: language('TypeScript'),
      provenance,
    });
    expect(remembered).toMatchObject({ outcome: 'inserted', projected: true });

    // A key runs the exact route alone; a text finds the same memory by meaning, through its projection.
    const byKey = await verb<RecallResultDto>('recall', { scope, key: 'billing-service' });
    expect(byKey.items.map(({ record }) => record.id)).toEqual([remembered.record.id]);
    expect(byKey.routes.map(({ route }) => route)).toEqual(['exact']);
    const byText = await verb<RecallResultDto>('recall', {
      scope,
      text: 'what is billing written in',
    });
    expect(byText.routes).toMatchObject([{ route: 'semantic', skipped: null, hits: 1 }]);
    expect(byText.items.map(({ record }) => record.id)).toEqual([remembered.record.id]);

    const updated = await verb<WriteResultDto>('update', {
      recordId: remembered.record.id,
      scope,
      candidate: language('Go'),
      provenance,
    });
    expect(updated).toMatchObject({
      outcome: 'superseded',
      superseded: { id: remembered.record.id, status: 'superseded' },
    });
    const history = await verb<MemoryRecordDto[]>('history', {
      recordId: updated.record.id,
      scope,
    });
    expect(history.map(({ version, status }) => [version, status])).toEqual([
      [1, 'superseded'],
      [2, 'active'],
    ]);
    const invalidated = await verb<MemoryRecordDto>('invalidate', {
      recordId: updated.record.id,
      scope,
      reason: 'the service was rewritten',
    });
    expect(invalidated).toMatchObject({
      status: 'invalidated',
      closeReason: 'the service was rewritten',
    });
    expect(
      (await verb<RecallResultDto>('recall', { scope, key: 'billing-service' })).items,
    ).toEqual([]);

    // Three verified episodes from three runs teaching one lesson: consolidation reports it, with that support.
    for (const sourceRunId of ['run-1', 'run-2', 'run-3']) {
      const episode = await verb<WriteResultDto>('remember', {
        register: 'episodic_record',
        scope,
        candidate: {
          subject: 'deploys',
          situation: `a Friday deploy in ${sourceRunId}`,
          action: 'rolled it back',
          outcome: 'the service recovered',
          outcomeVerified: true,
          occurredAt: '2026-10-15T12:00:00.000Z',
          lesson: { key: 'no-friday-deploys', text: 'Do not deploy on a Friday.', playbook: null },
        },
        provenance: { source: 'http-spec', sourceRunId },
      });
      expect(episode.outcome).toBe('inserted');
    }
    const consolidated = await verb<ConsolidationResultDto>('consolidate', { scope });
    expect(consolidated.lessons).toEqual([
      expect.objectContaining({ key: 'no-friday-deploys', outcome: 'inserted', support: 3 }),
    ]);
  });

  it('[AGS-8] answers a refusal at its declared status, carrying its code', async () => {
    const created = await send('POST', '/spaces', { runId: STRATEGY_RUN });
    const space = (await json<Envelope<MemorySpaceDto>>(created)).data;
    const scope = { tenant: 'acme' };

    const unknown = await send('GET', '/spaces/00000000-0000-4000-8000-000000000000');
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      code: 'space.not_found',
      issues: [],
    });
    const undeclared = await send('POST', `/spaces/${space.id}/remember`, {
      register: 'procedural_playbook',
      scope,
      candidate: { name: 'deploys', description: null, rules: [{ key: 'k', text: 'a rule' }] },
      provenance: { source: 'http-spec', sourceRunId: null },
    });
    expect(undeclared.status).toBe(422);
    expect(await undeclared.json()).toMatchObject({ code: 'operation.undeclared' });
    // What the contract does not accept never reaches the runtime: it is the pipe's 400, saying why.
    const unrouted = await send('POST', `/spaces/${space.id}/recall`, { scope });
    expect(unrouted.status).toBe(400);
    expect(await unrouted.json()).toMatchObject({
      message: 'validation failed',
      issues: [expect.anything()],
    });
    expect((await send('POST', '/spaces/not-a-uuid/recall', { scope, key: 'k' })).status).toBe(400);
  });
});
