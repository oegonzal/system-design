import { ADVICE_UNITS_BOUND } from '@sysdesign/contracts';

import type { ScatterPolicy } from './policy';
import { ApplicationRecordSource, onRecord } from './record-source';
import { application, InMemoryApplicationStore } from './testing';

const NOW = new Date('2026-10-11T12:00:00.000Z');
const POLICY: ScatterPolicy = {
  windowDays: 90,
  stances: {
    'in-progress': 'forbid',
    submitted: 'avoid',
    'submitted-before': 'avoid',
    abandoned: 'avoid',
    failed: null,
    skipped: null,
  },
  neverOnRecord: ['Staffing Partners'],
  skippedBecomesAvoidAfter: 2,
};
const at = (day: string) => new Date(`${day}T10:00:00.000Z`);

describe('the record as the advisor answers it', () => {
  it('[JA-2] answers one unit per company under the shared key, the strongest stance, the latest date and the count in the note, the forbidden first', () => {
    const units = onRecord(
      [
        application({ company: 'Acme', openedAt: at('2026-10-01'), closedAt: at('2026-10-01') }),
        application({ company: ' ACME', openedAt: at('2026-10-05'), closedAt: at('2026-10-05') }),
        application({
          company: 'Globex',
          status: 'in-progress',
          openedAt: at('2026-10-06'),
          closedAt: null,
          expiresAt: new Date('2026-10-12T00:00:00.000Z'),
        }),
        application({ company: 'Globex', openedAt: at('2026-09-01'), closedAt: at('2026-09-01') }),
        application({
          company: 'Initech',
          status: 'failed',
          openedAt: at('2026-10-07'),
          closedAt: at('2026-10-07'),
        }),
        application({
          company: 'Umbrella',
          status: 'skipped',
          openedAt: at('2026-10-02'),
          closedAt: at('2026-10-02'),
        }),
        application({
          company: 'Umbrella',
          status: 'skipped',
          openedAt: at('2026-10-08'),
          closedAt: at('2026-10-08'),
        }),
        application({
          company: 'Hooli',
          status: 'submitted-before',
          openedAt: at('2026-10-09'),
          closedAt: at('2026-10-09'),
        }),
        application({
          company: 'Vandelay',
          status: 'abandoned',
          openedAt: at('2026-10-10'),
          closedAt: at('2026-10-10'),
        }),
        application({ company: 'Old Co', openedAt: at('2026-06-01'), closedAt: at('2026-06-01') }),
        application({
          company: 'Staffing Partners',
          openedAt: at('2026-10-09'),
          closedAt: at('2026-10-09'),
        }),
      ],
      POLICY,
      NOW,
    );
    expect(units.map((unit) => [unit.identity[0]?.value, unit.stance, unit.note])).toEqual([
      ['Globex', 'forbid', 'in progress in another session since 2026-10-06'],
      ['Vandelay', 'avoid', 'interrupted on 2026-10-10 — may have gone through'],
      ['Hooli', 'avoid', 'seen applied on 2026-10-09'],
      ['Umbrella', 'avoid', 'set aside 2 times'],
      [' ACME', 'avoid', 'applied 2026-10-05, 2 applications'],
    ]);
    expect(
      units.every((unit) => unit.identity.length === 1 && unit.identity[0]?.name === 'company'),
    ).toBe(true);
  });

  it('[JA-2] a company known only by failed applications is avoided under a policy that says so, its note naming the latest failure and the count', () => {
    const avoidingFailed: ScatterPolicy = {
      ...POLICY,
      stances: { ...POLICY.stances, failed: 'avoid' },
    };
    const failed = (day: string) =>
      application({ company: 'Initech', status: 'failed', openedAt: at(day), closedAt: at(day) });
    expect(
      onRecord([failed('2026-10-07')], avoidingFailed, NOW).map((unit) => [unit.stance, unit.note]),
    ).toEqual([['avoid', 'failed on 2026-10-07']]);
    expect(
      onRecord([failed('2026-10-03'), failed('2026-10-07')], avoidingFailed, NOW).map((unit) => [
        unit.stance,
        unit.note,
      ]),
    ).toEqual([['avoid', 'failed on 2026-10-07, 2 times']]);
    // Under the policy that says nothing of a failure, the company is not on record.
    expect(onRecord([failed('2026-10-07')], POLICY, NOW)).toEqual([]);
  });

  it('[JA-2] describes itself by id and facet, reads one subject’s window from the store, and bounds the answer with the rest counted', async () => {
    const store = new InMemoryApplicationStore();
    for (let i = 0; i < ADVICE_UNITS_BOUND.target + 3; i += 1) {
      await store.insert(
        application({
          company: `Company ${i}`,
          openedAt: at('2026-10-05'),
          closedAt: at('2026-10-05'),
        }),
      );
    }
    await store.insert(application({ subject: 'Someone Else', company: 'Other' }));
    const source = new ApplicationRecordSource(store, POLICY, () => NOW);
    expect(source.describe()).toEqual({ id: 'job-application', facets: ['company'] });
    // The asker's own unit still in progress is no other session's: it is not on record to it, and forbidden to everyone else.
    await store.insert(
      application({
        company: 'Mine Co',
        status: 'in-progress',
        sessionId: 'session-9',
        closedAt: null,
        expiresAt: new Date('2026-10-12T00:00:00.000Z'),
      }),
    );
    const theirs = await source.unitsOnRecord({
      subject: 'Alex Example',
      asker: { kind: 'browser-session', id: 'session-8', label: 'step 1' },
      facets: ['company'],
    });
    expect(theirs.units[0]).toMatchObject({
      identity: [{ name: 'company', value: 'Mine Co' }],
      stance: 'forbid',
    });
    const advice = await source.unitsOnRecord({
      subject: 'Alex Example',
      asker: { kind: 'browser-session', id: 'session-9', label: 'step 2' },
      facets: ['company'],
    });
    expect([advice.advisor, advice.units.length, advice.omitted]).toEqual([
      'job-application',
      ADVICE_UNITS_BOUND.target,
      3,
    ]);
    expect(advice.units.some((unit) => unit.identity[0]?.value === 'Other')).toBe(false);
    expect(advice.units.some((unit) => unit.identity[0]?.value === 'Mine Co')).toBe(false);
  });
});
