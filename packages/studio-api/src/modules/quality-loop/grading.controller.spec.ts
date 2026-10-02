import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { QualityLoopHealthDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { GradingController } from './grading.controller';
import type { QualityLoopClient } from './quality-loop.client';

const controllerOver = (health: () => Promise<QualityLoopHealthDto>) =>
  new GradingController({ health } as unknown as QualityLoopClient);

const PACE = { heartbeatEveryMs: 60_000, staleAfterMs: 180_000 };

describe('GET /grading/availability', () => {
  it('[DEL-6] answers the loop’s model report, and the pace its runs keep', async () => {
    await expect(
      controllerOver(async () => ({
        status: 'ok',
        llm: { model: 'm' },
        heartbeat: { ...PACE, extra: 'not passed on' } as typeof PACE,
      })).availability(),
    ).resolves.toEqual({ data: { model: 'm', heartbeat: PACE } });
  });

  it('[DEL-6] is 503 when the loop is unreachable, and 503 when it answers without a model report', async () => {
    const down = controllerOver(() => Promise.reject(new BadGatewayException('dead')));
    await expect(down.availability()).rejects.toBeInstanceOf(ServiceUnavailableException);
    const old = controllerOver(async () => ({ status: 'ok' }) as QualityLoopHealthDto);
    await expect(old.availability()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(old.availability()).rejects.toThrow(/older quality loop/);
    const nameless = controllerOver(async () => ({
      status: 'ok',
      llm: { model: null },
      heartbeat: PACE,
    }));
    await expect(nameless.availability()).rejects.toThrow(/no model/);
  });

  // A studio that guessed the pace would warn of silence on a loop's numbers
  // it never read: a loop that reports none is an older build, not a grader.
  it('[DEL-6] is 503 when the loop reports no pace, or one that is not a positive duration', async () => {
    for (const heartbeat of [
      undefined,
      null,
      { heartbeatEveryMs: 60_000 },
      { heartbeatEveryMs: 0, staleAfterMs: 180_000 },
      { heartbeatEveryMs: '60000', staleAfterMs: 180_000 },
    ]) {
      const paceless = controllerOver(
        async () => ({ status: 'ok', llm: { model: 'm' }, heartbeat }) as QualityLoopHealthDto,
      );
      await expect(paceless.availability()).rejects.toThrow(/no heartbeat pace/);
    }
  });
});
