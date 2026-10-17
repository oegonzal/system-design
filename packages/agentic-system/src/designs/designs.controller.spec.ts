import { NotFoundException } from '@nestjs/common';

import type { MemoryDesignCycleDto } from './cycle';
import { DesignsController } from './designs.controller';
import type { DesignsService } from './designs.service';

const dto = (over: Partial<MemoryDesignCycleDto> = {}): MemoryDesignCycleDto => ({
  id: 'c1',
  goalDigest: 'g1',
  status: 'running',
  designRunId: null,
  orchestrationRunId: null,
  note: null,
  startedAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
  ...over,
});

/** A controller exercised directly; its HTTP statuses and the Zod pipe are exercised through the booted app in `app/http.spec.ts`. */
describe('the designs controller', () => {
  it('[AGS-4] starts a cycle from a brief and sets it going off the request path', async () => {
    const executed: string[] = [];
    const service = {
      start: (_goal: string) => Promise.resolve(dto()),
      execute: (id: string, _goal: string) => {
        executed.push(id);
        return Promise.resolve();
      },
      get: () => Promise.resolve(null),
    } as unknown as DesignsService;

    const result = await new DesignsController(service).start({ goal: 'design a memory service' });
    expect(result.data).toMatchObject({ id: 'c1', status: 'running' });
    expect(executed).toEqual(['c1']);
  });

  it('[AGS-4] reads a cycle back, and 404s an unknown one', async () => {
    const service = {
      get: (id: string) => Promise.resolve(id === 'c1' ? dto() : null),
    } as unknown as DesignsService;
    const controller = new DesignsController(service);

    expect((await controller.get('c1')).data.id).toBe('c1');
    await expect(controller.get('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
