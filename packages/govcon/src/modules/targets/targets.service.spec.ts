import { BadRequestException, NotFoundException } from '@nestjs/common';

import { InMemoryTargetRepository } from '../../core/testing';
import { TargetsService } from './targets.service';

const T1 = new Date('2026-09-26T12:00:00Z');
const T2 = new Date('2026-09-27T12:00:00Z');
const AWARD = { kind: 'award' as const, subject: 'CONT_AWD_1' };
const FIRM = { kind: 'firm' as const, subject: 'JCBMLGPE6Z71' };

function harness() {
  let now = T1;
  const repository = new InMemoryTargetRepository();
  return {
    repository,
    service: new TargetsService(repository, () => now),
    later: () => {
      now = T2;
    },
  };
}

describe('the targets service', () => {
  it('[GOV-31] tracks a firm or an award once by what it is about, keeps what a later save leaves out, moves the stage’s day only with the stage, and answers whether something is tracked with the row or with nothing', async () => {
    const { service, later } = harness();
    expect(await service.get(AWARD)).toBeNull();

    const tracked = await service.save(AWARD, {
      label: 'N6660426P0205',
      stage: 'watching',
      notes: 'Recompete expected in the spring.',
      contact: 'A. Contracting Officer',
      reminderAt: '2026-10-01T15:00:00.000Z',
    });
    expect(tracked).toEqual({
      id: tracked.id,
      kind: 'award',
      subject: 'CONT_AWD_1',
      label: 'N6660426P0205',
      stage: 'watching',
      notes: 'Recompete expected in the spring.',
      contact: 'A. Contracting Officer',
      reminderAt: '2026-10-01T15:00:00.000Z',
      endsAt: null,
      stageChangedAt: T1.toISOString(),
      createdAt: T1.toISOString(),
      updatedAt: T1.toISOString(),
    });
    expect(await service.get(AWARD)).toEqual(tracked);

    later();
    // The same stage, nothing else said: every other field stays, and so does the stage's day.
    const touched = await service.save(AWARD, { label: 'N6660426P0205', stage: 'watching' });
    expect(touched).toMatchObject({
      id: tracked.id,
      notes: 'Recompete expected in the spring.',
      contact: 'A. Contracting Officer',
      reminderAt: '2026-10-01T15:00:00.000Z',
      stageChangedAt: T1.toISOString(),
      updatedAt: T2.toISOString(),
    });
    // A cleared reminder is written as none; a new stage moves the stage's day.
    const moved = await service.save(AWARD, {
      label: 'N6660426P0205',
      stage: 'positioning',
      reminderAt: null,
      notes: '',
    });
    expect(moved).toMatchObject({
      stage: 'positioning',
      reminderAt: null,
      notes: '',
      contact: 'A. Contracting Officer',
      stageChangedAt: T2.toISOString(),
      createdAt: T1.toISOString(),
    });

    // Another kind is another target; both changed at the same instant, so they list by subject.
    await service.save(FIRM, { label: 'BOOZ ALLEN HAMILTON INC', stage: 'identified' });
    const [listed, total] = await service.list({ kind: null, stage: null, limit: 50, offset: 0 });
    expect(total).toBe(2);
    expect(listed.map((target) => [target.kind, target.label])).toEqual([
      ['award', 'N6660426P0205'],
      ['firm', 'BOOZ ALLEN HAMILTON INC'],
    ]);
    expect((await service.list({ kind: 'firm', stage: null, limit: 50, offset: 0 }))[1]).toBe(1);
    expect(
      (await service.list({ kind: null, stage: 'positioning', limit: 50, offset: 0 }))[0].map(
        (target) => target.subject,
      ),
    ).toEqual(['CONT_AWD_1']);
    expect(await service.summary()).toMatchObject({
      total: 2,
      byKind: { firm: { identified: 1 }, award: { positioning: 1, watching: 0 } },
    });
  });

  it('[GOV-31] refuses a stage that is not the kind’s own before anything is written, naming the stages it has, and answers 404 to removing what is not tracked', async () => {
    const { service, repository } = harness();
    await expect(
      service.save(FIRM, { label: 'BOOZ ALLEN HAMILTON INC', stage: 'watching' }),
    ).rejects.toThrow(
      new BadRequestException(
        'watching is not a stage of a firm: identified, contacted, talking, teamed, passed',
      ),
    );
    expect(repository.rows.size).toBe(0);

    await expect(service.remove(AWARD)).rejects.toThrow(NotFoundException);
    await service.save(AWARD, { label: 'N6660426P0205', stage: 'watching' });
    await service.remove(AWARD);
    expect(await service.get(AWARD)).toBeNull();
  });
});
