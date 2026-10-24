import {
  awardBodyOf,
  DEFAULT_ALERT_POLICY,
  MAX_WATCHED_AWARDS,
  opportunityOf,
  type Provenance,
} from '@sysdesign/contracts';

import { RequestGate, type BudgetPolicy } from '../../../core/budget';
import type { AwardRecord } from '../../../core/ports';
import {
  fetchedOf,
  InMemorySnapshotStore,
  scriptedSpendingSources,
  type SpendingScript,
} from '../../../core/spending/testing';
import {
  failure,
  InMemoryAlertLedger,
  InMemoryOpportunityRepository,
  InMemorySourceCallLog,
  InMemoryTargetRepository,
  tinyProfile,
} from '../../../core/testing';
import { SpendingService } from '../spending.service';
import { WatchedAwards, type WarmRead } from './watched-awards';

/** 2026-10-01: the fixture award ends 2026-12-26, 86 days out. */
const T0 = new Date('2026-10-01T12:00:00Z');
const { orders: _orders, subcontracts: _roster, ...RECORD } = awardBodyOf({ subcontractCount: 0 });
const ID = RECORD.externalId;
const AWARD = { kind: 'award' as const, subject: ID };
const PROFILE = tinyProfile({ alerts: { ...DEFAULT_ALERT_POLICY, audience: 'watched' } });
const input = {
  label: 'P',
  stage: 'watching' as const,
  notes: '',
  nextAction: '',
  contacts: [],
  links: [],
  activity: [],
  reminderAt: null,
};

function harness(script: SpendingScript = {}) {
  const clock = () => T0;
  const log = new InMemorySourceCallLog();
  const budget: BudgetPolicy = { ttlMs: 60 * 60 * 1000, pullDeadlineMs: 60_000, buckets: {} };
  const sources = scriptedSpendingSources({
    awardDetails: [fetchedOf<AwardRecord | null>(RECORD)],
    ...script,
  });
  const notices = new InMemoryOpportunityRepository();
  const spending = new SpendingService(
    new InMemorySnapshotStore(),
    sources,
    budget,
    new RequestGate(log, budget, clock),
    clock,
    notices,
  );
  const targets = new InMemoryTargetRepository();
  const ledger = new InMemoryAlertLedger();
  const lenses: string[] = [];
  /** The warmer's reader, as a spec needs it: the lens named, a refusal answered as nothing. */
  const read: WarmRead = async <T extends { provenance: Provenance }>(
    lens: string,
    load: () => Promise<T>,
  ) => {
    lenses.push(lens);
    try {
      return await load();
    } catch {
      return null;
    }
  };
  return {
    watched: new WatchedAwards(spending, targets, ledger, clock),
    targets,
    ledger,
    sources,
    notices,
    lenses,
    read,
  };
}

describe('the tracked awards a warm reads', () => {
  it('[GOV-32] reads each award still being pursued through the award lens and rules on its own record; a first reading raises that it ends soon and only records its end once settled', async () => {
    const { watched, targets, sources, lenses, read } = harness();
    await targets.save(AWARD, input, T0);
    await targets.save({ kind: 'award', subject: 'PASSED' }, { ...input, stage: 'passed' }, T0);
    await targets.save(
      { kind: 'firm', subject: 'JCBMLGPE6Z71' },
      { ...input, stage: 'talking' },
      T0,
    );

    const reading = await watched.read(PROFILE, { refresh: true }, read);
    expect(lenses).toEqual([`award ${ID}`]);
    expect(sources.requests.awardDetails).toEqual([{ externalId: ID }]);
    expect(reading.alerts.map((alert) => alert.key)).toEqual([
      { kind: 'award-ending', subject: ID },
    ]);
    // Read for the first time: its end is noted, and nothing says it moved.
    expect(reading.observations).toEqual([{ key: AWARD, endsAt: '2026-12-26', moved: null }]);
    expect((await targets.find(AWARD))?.endsAt).toBeNull();

    await watched.settle(reading.observations);
    expect((await targets.find(AWARD))?.endsAt).toBe('2026-12-26');
    // The same end again: nothing to observe, nothing to settle.
    const again = await watched.read(PROFILE, {}, read);
    expect(again.observations).toEqual([]);
    await watched.settle(again.observations);
  });

  it('[GOV-32] an end that is no longer the one last read is one alert, and is written back only once that alert is on the ledger — so one the bus refused is found again by the next warm', async () => {
    const { watched, targets, ledger, read } = harness();
    await targets.save(AWARD, input, T0);
    await targets.observe(AWARD, '2026-09-30');
    const movedKey = { kind: 'award-end-moved' as const, subject: `${ID}|2026-12-26` };

    const first = await watched.read(PROFILE, {}, read);
    expect(first.alerts.map((alert) => alert.key.kind)).toEqual([
      'award-ending',
      'award-end-moved',
    ]);
    expect(first.observations).toEqual([{ key: AWARD, endsAt: '2026-12-26', moved: movedKey }]);

    // The bus refused it: nothing is on the ledger, so the end stays as it was last written.
    await watched.settle(first.observations);
    expect((await targets.find(AWARD))?.endsAt).toBe('2026-09-30');
    const second = await watched.read(PROFILE, {}, read);
    expect(second.observations).toEqual(first.observations);

    // Raised: the ledger holds it, and the end is written.
    await ledger.record([
      {
        key: movedKey,
        scopeKey: null,
        payload: {},
        position: 0,
        profileId: 'tiny',
        raisedAt: T0,
        eventSeq: '1',
        promptId: null,
      },
    ]);
    await watched.settle(second.observations);
    expect((await targets.find(AWARD))?.endsAt).toBe('2026-12-26');
    expect((await watched.read(PROFILE, {}, read)).observations).toEqual([]);
  });

  it('[GOV-32] raises each open stored notice sharing a tracked award’s NAICS and buyer, skips an award the source refuses and reads the rest, and reads no more than the declared bound', async () => {
    const joined = harness();
    await joined.targets.save(AWARD, input, T0);
    // The fixture award is NAICS 541511 at Energy's sub-tier 8900.
    await joined.notices.upsertMany(
      [
        opportunityOf({
          noticeId: 'follow-on',
          title: 'Cyber support follow-on',
          naicsCode: '541511',
          naicsCodes: ['541511'],
          agencyCode: '089.8900.89303',
          responseDeadlineAt: '2026-11-15T17:00:00.000Z',
        }),
        opportunityOf({ noticeId: 'elsewhere', naicsCode: '541511', naicsCodes: ['541511'] }),
      ],
      T0,
    );
    const reading = await joined.watched.read(PROFILE, {}, joined.read);
    expect(
      reading.alerts.filter((alert) => alert.key.kind === 'award-notice').map((alert) => alert.key),
    ).toEqual([{ kind: 'award-notice', subject: `${ID}|follow-on` }]);

    const refused = harness({
      awardDetails: [failure('error', 503, 'status 503'), fetchedOf<AwardRecord | null>(RECORD)],
    });
    await refused.targets.save({ kind: 'award', subject: 'A-FIRST' }, input, T0);
    await refused.targets.save(AWARD, input, T0);
    const partial = await refused.watched.read(PROFILE, {}, refused.read);
    expect(refused.lenses).toEqual(['award A-FIRST', `award ${ID}`]);
    expect(partial.alerts.map((alert) => alert.key.subject)).toEqual([ID]);

    const many = harness();
    for (let index = 0; index < MAX_WATCHED_AWARDS + 3; index += 1) {
      await many.targets.save({ kind: 'award', subject: `AWARD-${index}` }, input, T0);
    }
    await many.watched.read(PROFILE, {}, many.read);
    expect(many.lenses).toHaveLength(MAX_WATCHED_AWARDS);
  });
});
