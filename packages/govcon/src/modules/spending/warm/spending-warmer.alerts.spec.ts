import { awardBodyOf, DEFAULT_ALERT_POLICY, horizonRowOf } from '@sysdesign/contracts';

import type { AwardRecord } from '../../../core/ports';
import { fetchedOf } from '../../../core/spending/testing';
import { tinyProfile } from '../../../core/testing';
import { harness, outcomes, SCRIPT, T0 } from './testing';

describe('the spending warmer’s alerts', () => {
  it('[GOV-24] a warm hands the alert raiser what its rules found — the same award through every horizon one alert, the finding about the whole scope ahead of it, under the spending digest’s name — a second warm raises nothing again, and the policy is the profile’s', async () => {
    const { warmer, sink, ledger, profiles } = harness();
    await profiles.create(tinyProfile());
    const first = await warmer.warm();
    expect(first.alerts).toEqual({ found: 2, fresh: 2, published: 2, prompted: true });
    expect(sink.published.map((alert) => alert.topic)).toEqual([
      'govcon.pulse.above-band',
      'govcon.award.ending',
    ]);
    expect(sink.prompts.map((prompt) => prompt.title)).toEqual(['2 spending alerts for Tiny LLC']);
    // The same award came through three horizons — the profile's and two agencies' — and is one alert.
    expect(ledger.rows.map((row) => row.key.kind)).toEqual(['pulse-above-band', 'award-ending']);
    expect(ledger.rows[1]?.scopeKey).toMatch(/^[0-9a-f]{64}$/);

    const second = await warmer.warm();
    expect(second.alerts).toEqual({ found: 2, fresh: 0, published: 0, prompted: false });
    expect(sink.prompts).toHaveLength(1);

    const quiet = harness();
    await quiet.profiles.create(
      tinyProfile({ alerts: { ...DEFAULT_ALERT_POLICY, pulseAboveBand: false } }),
    );
    expect((await quiet.warmer.warm()).alerts.found).toBe(1);
    expect(quiet.sink.published.map((alert) => alert.topic)).toEqual(['govcon.award.ending']);
  });

  it('[GOV-39] a warm raises the tracked firms and awards left quiet after an outreach under the tracker’s own digest, and a second warm raises them no more', async () => {
    const made = harness();
    await made.profiles.create(tinyProfile());
    await made.targets.save(
      { kind: 'firm', subject: 'JCBMLGPE6Z71' },
      {
        label: 'BOOZ ALLEN HAMILTON INC',
        stage: 'contacted',
        notes: '',
        nextAction: 'Ask for the program manager.',
        contacts: [],
        links: [],
        activity: [{ at: '2026-06-05T15:00:00.000Z', kind: 'emailed', summary: 'Sent it.' }],
        reminderAt: null,
      },
      T0,
    );
    const first = await made.warmer.warm();
    expect(first.quiet).toEqual({ found: 1, fresh: 1, published: 1, prompted: true });
    expect(made.sink.published.map((alert) => alert.topic)).toContain('govcon.target.quiet');
    expect(made.sink.prompts.map((prompt) => prompt.title)).toContain(
      '1 quiet target for Tiny LLC',
    );
    expect((await made.warmer.warm()).quiet).toEqual({
      found: 1,
      fresh: 0,
      published: 0,
      prompted: false,
    });
  });

  it('[GOV-32] [GOV-33] a warm reads every tracked award after the scope and raises what its record shows once — its own record kept when a scope lists the same award — keeps what was published on the ledger, and writes back the end it read only once the alert for the move is raised', async () => {
    // The award the scope's horizon lists, tracked too: its record ends the same day, and its end was last read five days earlier.
    const id = horizonRowOf().externalId;
    const {
      orders: _orders,
      subcontracts: _roster,
      ...body
    } = awardBodyOf({
      externalId: id,
      endsAt: '2026-07-05',
      subcontractCount: 0,
    });
    const script = { ...SCRIPT, awardDetails: [fetchedOf<AwardRecord | null>(body)] };
    const key = { kind: 'award' as const, subject: id };
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
    const tracking = async (options: Parameters<typeof harness>[0] = { script }) => {
      const made = harness(options);
      await made.profiles.create(tinyProfile());
      await made.targets.save(key, input, T0);
      await made.targets.observe(key, '2026-06-30');
      return made;
    };

    const { warmer, sink, ledger, targets } = await tracking();
    const report = await warmer.warm();
    expect(outcomes(report).at(-1)).toEqual([`award ${id}`, 'ok', null]);
    expect(report.alerts).toEqual({ found: 3, fresh: 3, published: 3, prompted: true });
    // Raised in the order a person reads them: the tracked award's news, the whole-scope finding, the ending award.
    expect(sink.published.map((alert) => alert.topic)).toEqual([
      'govcon.award.end-moved',
      'govcon.pulse.above-band',
      'govcon.award.ending',
    ]);
    // One ending alert for the award, and it is the tracked record's: no scope found it first.
    expect(ledger.rows.map((row) => [row.key.kind, row.position, row.scopeKey === null])).toEqual([
      ['award-end-moved', 0, true],
      ['pulse-above-band', 1, false],
      ['award-ending', 2, true],
    ]);
    expect(ledger.rows[0]?.payload).toEqual({
      profileId: 'tiny',
      externalId: id,
      piid: body.piid,
      recipientName: body.recipient.name,
      agencyPath: body.agencyPath,
      from: '2026-06-30',
      to: '2026-07-05',
    });
    expect(ledger.rows[2]?.payload).toEqual(sink.published[2]?.payload);
    expect((await targets.find(key))?.endsAt).toBe('2026-07-05');
    // The digest leads with the tracked award's news.
    expect(sink.prompts[0]?.details[0]).toContain('now ends 2026-07-05, not 2026-06-30');

    // A bus that is down raises nothing, so the end read is not written: the next warm finds the move again.
    const down = await tracking();
    down.sink.failing = new Error('bus down');
    expect((await down.warmer.warm()).alerts).toMatchObject({ found: 3, published: 0 });
    expect((await down.targets.find(key))?.endsAt).toBe('2026-06-30');
    down.sink.failing = null;
    expect((await down.warmer.warm()).alerts).toMatchObject({ fresh: 3, published: 3 });
    expect((await down.targets.find(key))?.endsAt).toBe('2026-07-05');

    // A policy that raises tracked awards alone: the scope's ending award is not raised, the tracked one is.
    const narrow = harness({ script });
    await narrow.profiles.create(
      tinyProfile({ alerts: { ...DEFAULT_ALERT_POLICY, audience: 'watched' } }),
    );
    expect((await narrow.warmer.warm()).alerts.found).toBe(1);
    expect(narrow.sink.published.map((alert) => alert.topic)).toEqual(['govcon.pulse.above-band']);
    await narrow.targets.save(key, input, T0);
    expect((await narrow.warmer.warm()).alerts).toMatchObject({ found: 2, fresh: 1 });
    expect(narrow.sink.published.at(-1)?.topic).toBe('govcon.award.ending');

    // A target store that cannot be read is one line; the scope's alerts are still raised.
    const blind = await tracking();
    vi.spyOn(blind.targets, 'listAll').mockRejectedValue(new Error('store down'));
    const unseen = await blind.warmer.warm();
    expect(outcomes(unseen).some(([lens]) => String(lens).startsWith('award '))).toBe(false);
    expect(unseen.alerts).toEqual({ found: 2, fresh: 2, published: 2, prompted: true });
  });
});
