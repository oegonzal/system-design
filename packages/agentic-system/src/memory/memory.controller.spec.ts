import { randomUUID } from 'node:crypto';

import { HttpException } from '@nestjs/common';
import { MemoryRefused } from '@sysdesign/agentic-memory';
import { strategyFixture } from '@sysdesign/agentic-memory/testing';
import {
  consolidateRequestSchema,
  fakeRun,
  invalidateRecordRequestSchema,
  MEMORY_REFUSALS,
  recallRecordsRequestSchema,
  recordHistoryRequestSchema,
  rememberRequestSchema,
  updateRecordRequestSchema,
  type MemoryRefusal,
} from '@sysdesign/contracts';
import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

import { MemoryController } from './memory.controller';
import { answered } from './refusals';
import { loopWith, memoryUnderTest } from './testing';

/** The rule every refusal is held to: what an address does not find is 404, what moved on is 409, the rest 422. */
const NOT_FOUND: readonly MemoryRefusal[] = ['space.not_found', 'record.not_found'];
/** What each not-found names as missing. */
const MISSING = { 'space.not_found': 'space', 'record.not_found': 'record' } as const;
const MOVED_ON: readonly MemoryRefusal[] = ['record.not_current', 'conflict'];
const statusOf = (code: MemoryRefusal): number =>
  NOT_FOUND.includes(code) ? 404 : MOVED_ON.includes(code) ? 409 : 422;

/** The HTTP answer a call was refused with. */
const answerOf = async (call: Promise<unknown>): Promise<{ status: number; body: unknown }> => {
  const error: unknown = await call.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof HttpException)) {
    throw new Error(`expected an answer, got ${String(error)}`);
  }
  return { status: error.getStatus(), body: error.getResponse() };
};

const runs = {
  strategy: fakeRun('memory-architecture', strategyFixture(), { runId: 'strategy' }),
  running: fakeRun('memory-architecture', null, { runId: 'running', status: 'running' }),
  empty: fakeRun('memory-architecture', null, { runId: 'empty' }),
};
const scope = { tenant: 't1' };
const provenance = { source: 'spec', sourceRunId: null };
const fact = (value: string) => ({
  subject: 'acme',
  predicate: 'language',
  value,
  validFrom: null,
});

describe('the memory routes', () => {
  it('[AGS-8] give every runtime refusal its one declared status, its body the refusal itself', async () => {
    const issues = [{ path: 'candidate.value', message: 'Required' }];
    for (const code of MEMORY_REFUSALS) {
      const refused = answerOf(
        answered(() => Promise.reject(new MemoryRefused(code, 'no', issues))),
      );
      expect(await refused).toEqual({
        status: statusOf(code),
        body: {
          statusCode: statusOf(code),
          error: expect.any(String),
          code,
          message: 'no',
          issues,
          // A 404 names the kind of thing it did not find, as every 404 an API raises does.
          ...(code in MISSING ? { missing: MISSING[code as keyof typeof MISSING] } : {}),
        },
      });
    }
  });

  it('[AGS-8] POST /spaces answers 201 with the space, 422 with a report, and each run refusal at its status', async () => {
    const broken = strategyFixture();
    broken.interfaces.push({ ...broken.interfaces[0], register: 'nowhere' });
    const { memory, service } = memoryUnderTest(
      loopWith({ ...runs, broken: fakeRun('memory-architecture', broken, { runId: 'broken' }) }),
    );
    const controller = new MemoryController(service, memory);

    const created = await controller.create({ runId: 'strategy' });
    expect(created.data).toMatchObject({ designRunId: 'strategy' });
    expect(await controller.get(created.data.id)).toEqual(created);

    expect(await answerOf(controller.create({ runId: 'broken' }))).toMatchObject({
      status: 422,
      body: {
        statusCode: 422,
        message: 'the strategy does not compile: interface.unknown_register',
        report: { problems: [{ code: 'interface.unknown_register' }] },
      },
    });
    for (const [runId, status, code] of [
      ['missing', 404, 'run.not_found'],
      ['running', 409, 'run.in_flight'],
      ['empty', 422, 'run.no_strategy'],
    ] as const) {
      expect(await answerOf(controller.create({ runId }))).toMatchObject({
        status,
        body: { statusCode: status, code, issues: [] },
      });
    }
  });

  it('[AGS-8] answers a loop that cannot be reached, is too slow or refuses as its gateway status', async () => {
    for (const [error, status] of [
      [new LoopUnreachable('ECONNREFUSED'), 503],
      [new LoopTimeout('GET /runs/strategy', 15_000), 504],
      [new LoopRefused(500, 'loop exploded', 'GET /runs/strategy'), 502],
    ] as const) {
      const { memory, service } = memoryUnderTest({ getRun: () => Promise.reject(error) });
      const controller = new MemoryController(service, memory);
      expect((await answerOf(controller.create({ runId: 'strategy' }))).status).toBe(status);
    }
  });

  it('[AGS-8] serves every verb on a space, and answers the runtime’s refusals at their statuses', async () => {
    const { memory, service } = memoryUnderTest(loopWith(runs));
    const controller = new MemoryController(service, memory);
    const { data: space } = await controller.create({ runId: 'strategy' });
    const remember = (candidate: unknown, register = 'facts') =>
      rememberRequestSchema.parse({ register, scope, candidate, provenance });

    const first = await controller.remember(space.id, remember(fact('TypeScript')));
    expect(first.data.outcome).toBe('inserted');
    const recalled = await controller.recall(
      space.id,
      recallRecordsRequestSchema.parse({ scope, key: 'acme' }),
    );
    expect(recalled.data.items.map(({ record }) => record.id)).toEqual([first.data.record.id]);
    const updated = await controller.update(
      space.id,
      updateRecordRequestSchema.parse({
        recordId: first.data.record.id,
        scope,
        candidate: fact('Go'),
        provenance,
      }),
    );
    expect(updated.data.outcome).toBe('superseded');
    const history = { recordId: updated.data.record.id, scope };
    expect(
      (await controller.history(space.id, recordHistoryRequestSchema.parse(history))).data,
    ).toHaveLength(2);
    expect(
      (await controller.consolidate(space.id, consolidateRequestSchema.parse({ scope }))).data,
    ).toMatchObject({ groups: 0, lessons: [], playbooks: [] });

    // A record that has moved on, one that is not there, and requests the space's declarations do not serve.
    const stale = updateRecordRequestSchema.parse({
      recordId: first.data.record.id,
      scope,
      candidate: fact('Rust'),
      provenance,
    });
    expect((await answerOf(controller.update(space.id, stale))).status).toBe(409);
    const nowhere = invalidateRecordRequestSchema.parse({
      recordId: randomUUID(),
      scope,
      reason: 'gone',
    });
    expect(await answerOf(controller.invalidate(space.id, nowhere))).toMatchObject({
      status: 404,
      body: { code: 'record.not_found' },
    });
    expect(
      await answerOf(controller.remember(space.id, remember(fact('x'), 'nowhere'))),
    ).toMatchObject({
      status: 422,
      body: { code: 'register.unknown' },
    });
    expect(
      await answerOf(controller.remember(space.id, remember({ subject: 'acme' }))),
    ).toMatchObject({
      status: 422,
      body: { code: 'candidate.invalid', issues: expect.arrayContaining([expect.anything()]) },
    });
    expect(
      (
        await controller.invalidate(
          space.id,
          invalidateRecordRequestSchema.parse({ ...history, reason: 'retracted' }),
        )
      ).data,
    ).toMatchObject({ status: 'invalidated', closeReason: 'retracted' });

    // A space that is not there is not found, whichever verb asks.
    const unknown = randomUUID();
    const verbs: (() => Promise<unknown>)[] = [
      () => controller.get(unknown),
      () => controller.remember(unknown, remember(fact('x'))),
      () => controller.update(unknown, stale),
      () => controller.invalidate(unknown, nowhere),
      () => controller.recall(unknown, recallRecordsRequestSchema.parse({ scope, key: 'acme' })),
      () => controller.consolidate(unknown, consolidateRequestSchema.parse({ scope })),
      () => controller.history(unknown, recordHistoryRequestSchema.parse(history)),
    ];
    for (const verb of verbs) {
      expect(await answerOf(verb())).toMatchObject({
        status: 404,
        body: { code: 'space.not_found' },
      });
    }
  });
});
