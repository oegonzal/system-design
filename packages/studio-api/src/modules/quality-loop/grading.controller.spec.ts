import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { GradingController } from './grading.controller';
import type { QualityLoopClient, QualityLoopHealth } from './quality-loop.client';

const controllerOver = (health: () => Promise<QualityLoopHealth>) =>
  new GradingController({ health } as unknown as QualityLoopClient);

describe('GET /grading/availability', () => {
  it('[DEL-6] answers the loop’s own availability', async () => {
    const llm = { enabled: true, model: 'm', reason: null };
    await expect(
      controllerOver(async () => ({ status: 'ok', llm })).availability(),
    ).resolves.toEqual({
      data: llm,
    });
  });

  it('[DEL-6] is 503 when the loop is unreachable, and 503 when it answers without a model report', async () => {
    const down = controllerOver(() => Promise.reject(new BadGatewayException('dead')));
    await expect(down.availability()).rejects.toBeInstanceOf(ServiceUnavailableException);
    const old = controllerOver(async () => ({ status: 'ok' }) as QualityLoopHealth);
    await expect(old.availability()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(old.availability()).rejects.toThrow(/older quality loop/);
  });
});
