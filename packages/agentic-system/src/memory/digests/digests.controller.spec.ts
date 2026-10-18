import { randomUUID } from 'node:crypto';

import { HttpException } from '@nestjs/common';
import { strategyFixture } from '@sysdesign/agentic-memory/testing';
import {
  fakeRun,
  REGISTER_DIGEST_MAX_PARTS,
  REGISTER_DIGEST_PART_MAX_LENGTH,
  registerDigestRequestSchema,
  type OrchestrationStepDto,
  type QualityRunStatus,
  type RegisterDigestReportDto,
} from '@sysdesign/contracts';
import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

import { digestRecord, digestsUnderTest, loopWith, type SpecLoop } from '../testing';
import { DigestsController } from './digests.controller';

const SCOPE = { tenant: 't1' };
const request = (overrides: Record<string, unknown> = {}) =>
  registerDigestRequestSchema.parse({
    title: 'A support conversation',
    parts: [{ label: 'Dana', at: null, text: 'Billing moved to Go last week.' }],
    scope: SCOPE,
    provenance: { source: 'support-desk', sourceRunId: null },
    ...overrides,
  });

const REPORT: RegisterDigestReportDto = {
  admission: 'admitted',
  memories: [
    {
      ref: 'memory.1',
      register: 'facts',
      kind: 'semantic',
      evidence: ['section.1'],
      candidate: { subject: 'billing', predicate: 'language', value: 'Go', validFrom: null },
    },
  ],
  endorsed: ['memory.1'],
  withheld: [],
};

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

/** The digest routes over a space made from a strategy that keeps every kind, on a loop a spec may override. */
async function routesOver(loop: SpecLoop = loopWith()) {
  const strategyLoop: SpecLoop = {
    ...loop,
    getRun: () =>
      Promise.resolve(fakeRun('memory-architecture', strategyFixture(), { runId: 'strategy' })),
  };
  const { service, digests } = digestsUnderTest(strategyLoop);
  const created = await service.createFromRun('strategy');
  if (!('space' in created)) throw new Error('the strategy should compile');
  return {
    controller: new DigestsController(digests),
    loop: strategyLoop,
    spaceId: created.space.id,
  };
}

describe('the digest routes', () => {
  it('[AGS-9] answer a start with the orchestration, and each refusal before the loop at its declared status', async () => {
    const { controller, loop, spaceId } = await routesOver();
    const started = await controller.start(spaceId, request());
    expect(started).toEqual({
      data: { orchestrationRunId: loop.started[0].orchestrationRunId, status: 'running' },
    });

    const wide = { label: null, at: null, text: '€'.repeat(REGISTER_DIGEST_PART_MAX_LENGTH) };
    const tooLarge = request({
      parts: Array.from({ length: REGISTER_DIGEST_MAX_PARTS }, () => wide),
    });
    for (const [space, body, status, code] of [
      [randomUUID(), request(), 404, 'space.not_found'],
      [spaceId, request({ scope: { user: 'u1' } }), 422, 'scope.invalid'],
      [spaceId, request({ registers: ['playbooks'] }), 422, 'digest.no_registers'],
      [spaceId, tooLarge, 422, 'digest.too_large'],
    ] as const) {
      expect(await answerOf(controller.start(space, body))).toMatchObject({
        status,
        body: { statusCode: status, code, issues: [] },
      });
    }
    expect(loop.started).toHaveLength(1);
  });

  it('[AGS-9] answer a loop that cannot be reached, is too slow or refuses at its gateway status', async () => {
    for (const [error, status] of [
      [new LoopUnreachable('ECONNREFUSED'), 503],
      [new LoopTimeout('POST /orchestrations/register-memory', 15_000), 504],
      [new LoopRefused(400, 'no index', 'POST /orchestrations/register-memory'), 502],
    ] as const) {
      const { controller, spaceId } = await routesOver({
        ...loopWith(),
        startOrchestration: () => Promise.reject(error),
      });
      expect((await answerOf(controller.start(spaceId, request()))).status).toBe(status);
    }
  });

  it('[AGS-10] read and remember a settled digest, and answer each refusal at its declared status', async () => {
    const { controller, loop, spaceId } = await routesOver();
    const settled = async (step: Partial<OrchestrationStepDto>, status: QualityRunStatus) => {
      const { data } = await controller.start(spaceId, request());
      const started = loop.started.find(
        (each) => each.orchestrationRunId === data.orchestrationRunId,
      );
      if (started === undefined) throw new Error('the digest was not started');
      loop.orchestrations.set(data.orchestrationRunId, digestRecord(started, step, status));
      return data.orchestrationRunId;
    };

    const id = await settled({ report: REPORT }, 'complete');
    expect((await controller.get(spaceId, id)).data).toMatchObject({
      report: REPORT,
      applied: null,
    });
    const { data: applied } = await controller.remember(spaceId, id);
    expect(applied.items).toEqual([
      { ref: 'memory.1', outcome: 'inserted', recordId: expect.any(String), refusal: null },
    ]);

    const running = await settled({ status: 'running' }, 'running');
    const failed = await settled({ status: 'failed', reason: 'run-failed' }, 'failed');
    const refused: [call: () => Promise<unknown>, status: number, code: string][] = [
      [() => controller.get(spaceId, randomUUID()), 404, 'run.not_found'],
      [() => controller.remember(randomUUID(), id), 404, 'run.not_found'],
      [() => controller.remember(spaceId, running), 409, 'run.in_flight'],
      [() => controller.remember(spaceId, failed), 422, 'digest.no_report'],
      [() => controller.remember(spaceId, id), 409, 'digest.applied'],
    ];
    for (const [call, status, code] of refused) {
      expect(await answerOf(call())).toMatchObject({ status, body: { statusCode: status, code } });
    }
    // A digest that is not found names the kind of thing it did not find, as every 404 does.
    expect(await answerOf(controller.get(spaceId, randomUUID()))).toMatchObject({
      body: { missing: 'run' },
    });
  });
});
