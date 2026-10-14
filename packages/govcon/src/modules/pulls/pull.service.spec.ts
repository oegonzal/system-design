import { NotFoundException } from '@nestjs/common';

import { failure, okPage, opportunityOf, pick } from '../../core/testing';
import { NOW, pullHarness as harness } from './testing';

const window = { from: '2026-09-23', to: '2026-09-26' };

describe('the pull service', () => {
  it('[GOV-1] [GOV-14] pulls every saved search flagged for the pull, stores what normalized and reports what did not, per slice', async () => {
    const rejected = [{ noticeId: null, issues: ['noticeId: missing'] }];
    const { inner, repository, searchRepository, service } = await harness([
      okPage([opportunityOf({ noticeId: 'a' }), opportunityOf({ noticeId: 'b' })], 3, rejected),
      okPage([opportunityOf({ noticeId: 'b', title: 'seen twice' })]),
    ]);

    const report = await service.pull(undefined, window);
    expect(inner.queries.map((q) => q.naics)).toEqual(['332710', '5415']);
    expect(
      report.slices.map((s) => [s.name, s.outcome, s.received, s.inserted, s.updated, s.rejected]),
    ).toEqual([
      ['Machine shops', 'ok', 3, 2, 0, 1],
      ['Computer services', 'ok', 1, 0, 1, 0],
    ]);
    expect(report).toMatchObject({
      profile: 'tiny',
      window,
      spent: 2,
      budget: 10,
      stoppedBy: null,
    });
    expect(report.source).toEqual({ id: 'sam.gov', availability: { enabled: true, reason: null } });
    expect(repository.rows.size).toBe(2);
    expect(repository.rows.get('b')?.opportunity.title).toBe('seen twice');
    expect((await searchRepository.listByProfile('tiny')).map((s) => s.lastRunAt)).toEqual([
      NOW,
      NOW,
    ]);
  });

  it('[GOV-14] skips a saved search not flagged for the pull, and pulls nothing for a profile without searches', async () => {
    const { inner, searchRepository, service } = await harness([okPage([])]);
    const first = pick(await searchRepository.listByProfile('tiny'), 0);
    await searchRepository.update(first.id, { ...first, includedInPull: false }, NOW);
    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.name)).toEqual(['Computer services']);
    expect(inner.queries).toHaveLength(1);

    const bare = await harness([okPage([])], { searches: false });
    expect((await bare.service.pull('tiny', window)).slices).toEqual([]);
  });

  it('[GOV-3] stops at the budget: the slice that hit it says so, the rest are skipped, nothing more is called', async () => {
    const { inner, searchRepository, service } = await harness([okPage([opportunityOf()])], {
      dailyBudget: 1,
    });
    await searchRepository.insert(
      'tiny',
      { name: 'Third', filter: { naics: '33' }, days: 3, includedInPull: true, pullOrder: 2 },
      NOW,
    );

    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.outcome)).toEqual(['ok', 'budget-exhausted', 'skipped']);
    expect(report.slices[1]?.detail).toBe('budget 1/1 spent');
    expect(report.slices[2]?.detail).toBe('stopped earlier: budget');
    expect(report.stoppedBy).toBe('budget');
    expect(report.spent).toBe(1);
    expect(inner.queries).toHaveLength(1);
  });

  it('[GOV-3] a rate-limited reply ends the pull and is never retried', async () => {
    const { inner, service } = await harness([failure('rate-limited', 429, 'over quota')]);
    const report = await service.pull('tiny', window);
    expect(report.slices.map((s) => s.outcome)).toEqual(['error', 'skipped']);
    expect(report.slices[0]?.detail).toBe('rate-limited: over quota');
    expect(report.stoppedBy).toBe('rate-limited');
    expect(inner.queries).toHaveLength(1);
  });

  it('[GOV-2] reports a slice pulled inside the cache window as cached and stores nothing again', async () => {
    const { service, repository } = await harness([okPage([opportunityOf()])], { ttlMs: 60_000 });
    const first = await service.pull('tiny', window);
    expect(first.slices.map((s) => s.outcome)).toEqual(['ok', 'ok']);
    expect(first.spent).toBe(2);
    repository.rows.clear();
    const second = await service.pull('tiny', window);
    expect(second.slices.map((s) => s.outcome)).toEqual(['cached', 'cached']);
    expect(second.slices[0]?.detail).toBe('pulled 2026-09-26T12:00:00.000Z, 1 record(s)');
    expect(repository.rows.size).toBe(0);
    expect(second.spent).toBe(2);
  });

  it('[GOV-14] runs one saved search over its own days, or an explicit window, and stamps it', async () => {
    const { inner, searchRepository, service } = await harness([okPage([opportunityOf()])]);
    const first = pick(await searchRepository.listByProfile('tiny'), 0);
    const report = await service.runSaved(first.id, {});
    expect(report.slices.map((s) => [s.name, s.outcome])).toEqual([['Machine shops', 'ok']]);
    expect(report.window).toEqual({ from: '2026-09-23', to: '2026-09-26' });
    expect(inner.queries[0]).toMatchObject({ naics: '332710', postedFrom: '2026-09-23' });
    expect((await searchRepository.find(first.id))?.lastRunAt).toEqual(NOW);

    const explicit = await service.runSaved(first.id, { days: 1 });
    expect(explicit.window).toEqual({ from: '2026-09-25', to: '2026-09-26' });
    await expect(service.runSaved('nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('runs a filter once without saving it, and refuses a window the plan cannot run', async () => {
    const { inner, searchRepository, service } = await harness([okPage([])]);
    const report = await service.runFilter(
      undefined,
      { naics: '541511', status: 'active' },
      { days: 7 },
    );
    expect(report.slices.map((s) => [s.name, s.outcome])).toEqual([[null, 'ok']]);
    expect(inner.queries[0]).toMatchObject({
      naics: '541511',
      status: 'active',
      postedFrom: '2026-09-19',
    });
    expect(await searchRepository.listByProfile('tiny')).toHaveLength(2);
    await expect(service.pull('tiny', { from: '2026-09-27', to: '2026-09-26' })).rejects.toThrow(
      /starts after it ends/,
    );
    await expect(service.pull('nope', window)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('[GOV-37] every saved search a pull ran keeps what its read brought in — what the source returned, how much of it was new, and how the profile ranked what it carried — a notice two searches returned counted for both and new for the first', async () => {
    const mid = opportunityOf({
      noticeId: 'mid',
      naicsCode: '541512',
      naicsCodes: ['541512'],
      classificationCode: null,
      setAsideCode: null,
      title: 'Help desk',
    });
    const { service, searchRepository } = await harness([
      okPage(
        [
          opportunityOf({ noticeId: 'best' }),
          opportunityOf({ noticeId: 'gone', setAsideCode: 'HZC' }),
          mid,
        ],
        4,
        [{ noticeId: null, issues: ['noticeId: missing'] }],
      ),
      okPage([mid]),
    ]);
    await service.pull('tiny', window);
    expect(
      (await searchRepository.listByProfile('tiny')).map((search) => [
        search.name,
        search.lastYield,
      ]),
    ).toEqual([
      [
        'Machine shops',
        {
          at: NOW.toISOString(),
          window,
          received: 4,
          inserted: 3,
          truncated: false,
          tiers: { high: 1, medium: 1, low: 0 },
          unlisted: 1,
        },
      ],
      [
        'Computer services',
        {
          at: NOW.toISOString(),
          window,
          received: 1,
          inserted: 0,
          truncated: false,
          tiers: { high: 0, medium: 1, low: 0 },
          unlisted: 0,
        },
      ],
    ]);
  });

  it('[GOV-37] a run answered from the cache window stamps its search and leaves the yield of its last read; a search run by itself keeps its own; a filter never saved keeps nothing anywhere', async () => {
    const { service, searchRepository, advance } = await harness([okPage([opportunityOf()])], {
      ttlMs: 60 * 60 * 1000,
    });
    await service.pull('tiny', window);
    const [first] = await searchRepository.listByProfile('tiny');
    if (first === undefined) throw new Error('expected a saved search');
    const read = first.lastYield;
    expect(read).toMatchObject({ received: 1, inserted: 1, tiers: { high: 1, medium: 0, low: 0 } });

    advance(10 * 60 * 1000);
    const again = await service.pull('tiny', window);
    expect(again.slices.map((slice) => slice.outcome)).toEqual(['cached', 'cached']);
    const later = await searchRepository.find(first.id);
    expect(later?.lastRunAt).toEqual(new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(later?.lastYield).toEqual(read);

    // Run by itself over another window: a new read, and its own yield.
    await service.runSaved(first.id, { days: 1 });
    expect((await searchRepository.find(first.id))?.lastYield).toMatchObject({
      window: { from: '2026-09-25', to: '2026-09-26' },
      received: 1,
      inserted: 0,
    });

    const before = await searchRepository.listByProfile('tiny');
    await service.runFilter('tiny', { naics: '11' }, { days: 7 });
    expect(await searchRepository.listByProfile('tiny')).toEqual(before);
  });
});
