import { NotFoundException } from '@nestjs/common';

import {
  InMemoryAwardRepository,
  InMemoryBidRepository,
  InMemoryOpportunityRepository,
  InMemoryProfileRepository,
  InMemorySavedSearchRepository,
  opportunityOf,
  tinyProfile,
} from '../../core/testing';
import { ProfilesService } from '../profiles/profiles.service';
import { BidsService } from './bids.service';

const T1 = new Date('2026-09-26T12:00:00Z');
const T2 = new Date('2026-09-27T12:00:00Z');

async function harness() {
  let now = T1;
  const notices = new InMemoryOpportunityRepository();
  const bids = new InMemoryBidRepository(notices);
  const profiles = new InMemoryProfileRepository();
  await profiles.insert(tinyProfile(), true, T1);
  await notices.upsertMany(
    [
      opportunityOf({ noticeId: 'n-1' }),
      opportunityOf({ noticeId: 'n-2', title: 'Lawn care', naicsCode: null, naicsCodes: [] }),
    ],
    T1,
  );
  const service = new BidsService(
    bids,
    notices,
    new InMemoryAwardRepository(),
    new ProfilesService(profiles, new InMemorySavedSearchRepository(), () => now),
    () => now,
  );
  return { bids, notices, service, tick: () => (now = T2) };
}

describe('the bids service', () => {
  it('[GOV-12] saves one bid per stored notice, refusing an unknown notice before any write', async () => {
    const { bids, service } = await harness();
    await expect(service.save('nope', { stage: 'watching' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(bids.rows.size).toBe(0);

    const saved = await service.save('n-1', {
      stage: 'watching',
      notes: 'Ask for the drawing',
      reminderAt: '2026-10-01T09:00:00.000Z',
      estimatedValue: 48000,
    });
    expect(saved).toEqual({
      noticeId: 'n-1',
      stage: 'watching',
      notes: 'Ask for the drawing',
      reminderAt: '2026-10-01T09:00:00.000Z',
      estimatedValue: 48000,
      stageChangedAt: T1.toISOString(),
      createdAt: T1.toISOString(),
      updatedAt: T1.toISOString(),
    });
    expect(bids.rows.size).toBe(1);
  });

  it('[GOV-12] keeps omitted fields, clears a reminder set to null, and moves the stage timestamp only with the stage', async () => {
    const { service, tick } = await harness();
    await service.save('n-1', {
      stage: 'watching',
      notes: 'keep me',
      reminderAt: '2026-10-01T09:00:00.000Z',
      estimatedValue: 100,
    });
    tick();
    const same = await service.save('n-1', { stage: 'watching' });
    expect(same).toMatchObject({
      notes: 'keep me',
      reminderAt: '2026-10-01T09:00:00.000Z',
      estimatedValue: 100,
      stageChangedAt: T1.toISOString(),
      updatedAt: T2.toISOString(),
    });
    const moved = await service.save('n-1', { stage: 'submitted', reminderAt: null });
    expect(moved).toMatchObject({
      stage: 'submitted',
      reminderAt: null,
      notes: 'keep me',
      stageChangedAt: T2.toISOString(),
    });
  });

  it('[GOV-12] lists the pipeline scored against the profile with its counts, and removes a bid once', async () => {
    const { service, tick } = await harness();
    await service.save('n-1', { stage: 'preparing', reminderAt: '2026-09-29T09:00:00.000Z' });
    tick();
    await service.save('n-2', { stage: 'watching' });

    const [rows, total] = await service.pipeline(undefined, { stage: null, limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(rows.map((row) => [row.bid.noticeId, row.bid.stage, row.lead.tier])).toEqual([
      ['n-2', 'watching', 'medium'],
      ['n-1', 'preparing', 'high'],
    ]);
    const [preparing] = await service.pipeline('tiny', {
      stage: 'preparing',
      limit: 10,
      offset: 0,
    });
    expect(preparing.map((row) => row.bid.noticeId)).toEqual(['n-1']);
    const [page] = await service.pipeline('tiny', { stage: null, limit: 1, offset: 1 });
    expect(page.map((row) => row.bid.noticeId)).toEqual(['n-1']);
    await expect(
      service.pipeline('nope', { stage: null, limit: 1, offset: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await service.summary()).toEqual({
      byStage: {
        watching: 1,
        qualifying: 0,
        preparing: 1,
        submitted: 0,
        won: 0,
        lost: 0,
        passed: 0,
      },
      dueSoon: 1,
      total: 2,
    });

    await service.remove('n-1');
    await expect(service.remove('n-1')).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.summary()).total).toBe(1);
  });
});
