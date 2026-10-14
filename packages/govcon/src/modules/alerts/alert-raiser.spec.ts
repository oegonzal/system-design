import {
  DEFAULT_ALERT_POLICY,
  interactionPromptSchema,
  spendingHorizonOf,
  type GovconAlert,
} from '@sysdesign/contracts';

import { awardEndingAlerts, SPENDING_DIGEST } from '../../core/alerts/spending';
import { InMemoryAlertLedger, RecordingAlertSink } from '../../core/testing';
import { AlertRaiser } from './alert-raiser';

const NOW = new Date('2026-06-15T12:00:00Z');
const PROFILE = { id: 'enfav', company: 'Enfav LLC' };
const [ONE] = awardEndingAlerts(spendingHorizonOf(), DEFAULT_ALERT_POLICY, 'enfav');
if (ONE?.topic !== 'govcon.award.ending') throw new Error('expected an award alert');
const SEED = ONE;

/** An ending award under its own key, with that much obligated on it. */
const ending = (subject: string, amount: number): GovconAlert => ({
  ...SEED,
  key: { ...SEED.key, subject },
  payload: { ...SEED.payload, externalId: subject, piid: subject, amount },
});

const MOVED: GovconAlert = {
  topic: 'govcon.award.end-moved',
  key: { kind: 'award-end-moved', subject: 'tracked|2027-01-01' },
  payload: {
    profileId: 'enfav',
    externalId: 'tracked',
    piid: 'TRACKED',
    recipientName: null,
    agencyPath: null,
    from: '2026-07-20',
    to: '2027-01-01',
  },
};

function harness() {
  const ledger = new InMemoryAlertLedger();
  const sink = new RecordingAlertSink();
  return { ledger, sink, raiser: new AlertRaiser(ledger, sink, () => NOW) };
}

describe('the alert raiser', () => {
  it('[GOV-24] raises what the ledger has not seen once: published on its declared topic the weightiest first, listed in one digest its finder names, kept with its place, the bus’s receipt and that digest — the same key handed over twice is one alert, the first kept, and nothing handed over raises nothing', async () => {
    const { raiser, sink, ledger } = harness();
    const small = ending('small', 1_000);
    const large = ending('large', 9_000_000);
    const twice = ending('small', 5_000_000);
    const first = await raiser.raise(PROFILE, [small, large, MOVED, twice], SPENDING_DIGEST);
    expect(first).toEqual({ found: 3, fresh: 3, published: 3, prompted: true });
    // A tracked award's news, then the ending awards by what is obligated on them.
    expect(sink.published).toEqual([MOVED, large, small]);
    expect(sink.prompts).toHaveLength(1);
    const [prompt] = sink.prompts;
    if (prompt === undefined) throw new Error('expected a digest');
    expect(interactionPromptSchema.parse(prompt)).toEqual(prompt);
    expect(prompt.title).toBe('3 spending alerts for Enfav LLC');
    expect(prompt.origin).toEqual({ kind: 'govcon.spending', id: 'enfav', label: 'Enfav LLC' });
    expect(prompt.details).toHaveLength(3);
    expect(
      ledger.rows.map((row) => [row.key.subject, row.position, row.eventSeq, row.promptId]),
    ).toEqual([
      ['tracked|2027-01-01', 0, '1', prompt.id],
      ['large', 1, '2', prompt.id],
      ['small', 2, '3', prompt.id],
    ]);
    expect(ledger.rows.map((row) => [row.profileId, row.raisedAt, row.scopeKey === null])).toEqual([
      ['enfav', NOW, true],
      ['enfav', NOW, false],
      ['enfav', NOW, false],
    ]);
    expect(ledger.rows[2]?.payload).toBe(small.payload);

    // What was raised is not raised again; one new alert is one publication and its own digest.
    const fresh = ending('fresh', 10);
    const second = await raiser.raise(PROFILE, [small, large, MOVED, fresh], {
      origin: 'govcon.other',
      one: 'finding',
      many: 'findings',
    });
    expect(second).toEqual({ found: 4, fresh: 1, published: 1, prompted: true });
    expect(sink.published.at(-1)).toBe(fresh);
    expect(sink.prompts.at(-1)?.title).toBe('1 finding for Enfav LLC');
    expect(ledger.rows.at(-1)?.position).toBe(0);

    expect(await raiser.raise(PROFILE, [], SPENDING_DIGEST)).toEqual({
      found: 0,
      fresh: 0,
      published: 0,
      prompted: false,
    });
    expect(sink.prompts).toHaveLength(2);
  });

  it('[GOV-24] nothing thrown by the bus or the ledger leaves it: an alert the bus refused is not recorded, so the next run raises it; the ones published before the bus fell over are kept; a ledger that cannot be read raises nothing; a digest the bus refuses still keeps what was published; and a record that fails is one line', async () => {
    const alerts = [ending('a', 3), ending('b', 2), ending('c', 1)];

    const down = harness();
    down.sink.failing = new Error('bus down');
    expect(await down.raiser.raise(PROFILE, alerts, SPENDING_DIGEST)).toEqual({
      found: 3,
      fresh: 3,
      published: 0,
      prompted: false,
    });
    expect(down.ledger.rows).toEqual([]);
    down.sink.failing = null;
    expect(await down.raiser.raise(PROFILE, alerts, SPENDING_DIGEST)).toMatchObject({
      fresh: 3,
      published: 3,
    });

    const flaky = harness();
    const publish = flaky.sink.publish.bind(flaky.sink);
    let calls = 0;
    vi.spyOn(flaky.sink, 'publish').mockImplementation(async (alert) => {
      calls += 1;
      if (calls === 2) throw new Error('bus fell over');
      return publish(alert);
    });
    expect(await flaky.raiser.raise(PROFILE, alerts, SPENDING_DIGEST)).toEqual({
      found: 3,
      fresh: 3,
      published: 1,
      prompted: true,
    });
    expect(flaky.ledger.rows.map((row) => row.key.subject)).toEqual(['a']);
    expect(flaky.sink.prompts[0]?.title).toBe('1 spending alert for Enfav LLC');
    expect(await flaky.raiser.raise(PROFILE, alerts, SPENDING_DIGEST)).toMatchObject({
      fresh: 2,
      published: 2,
    });

    const unread = harness();
    unread.ledger.failing = new Error('ledger down');
    expect(await unread.raiser.raise(PROFILE, alerts, SPENDING_DIGEST)).toEqual({
      found: 3,
      fresh: 0,
      published: 0,
      prompted: false,
    });
    expect(unread.sink.published).toEqual([]);

    const mute = harness();
    vi.spyOn(mute.sink, 'prompt').mockRejectedValue(new Error('no prompt'));
    expect(await mute.raiser.raise(PROFILE, alerts, SPENDING_DIGEST)).toEqual({
      found: 3,
      fresh: 3,
      published: 3,
      prompted: false,
    });
    expect(mute.ledger.rows.map((row) => row.promptId)).toEqual([null, null, null]);

    const unkept = harness();
    vi.spyOn(unkept.ledger, 'record').mockRejectedValue(new Error('disk full'));
    expect(await unkept.raiser.raise(PROFILE, alerts, SPENDING_DIGEST)).toMatchObject({
      published: 3,
      prompted: true,
    });
  });
});
