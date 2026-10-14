import {
  awardBodyOf,
  describeAlert,
  type RaisedAlertView,
  type Target,
} from '@sysdesign/contracts';

import type { AwardRecord } from '../../core/ports';
import { fetchedOf } from '../../core/spending/testing';
import {
  bootGovconHttp,
  get,
  resetGovcon,
  send,
  truncateGovcon,
  type Envelope,
  type GovconHttp,
  type Page,
} from '../app/testing';
import { SpendingWarmer } from '../spending/warm/spending-warmer';

/** The harness's clock is 2026-09-26; this award ends fifty days on. */
const {
  orders: _orders,
  subcontracts: _roster,
  ...RECORD
} = awardBodyOf({
  endsAt: '2026-11-15',
  subcontractCount: 0,
});
const ID = RECORD.externalId;

describe('the alert routes', () => {
  let http: GovconHttp;
  let url: string;

  beforeAll(async () => {
    http = await bootGovconHttp({ awardDetails: [fetchedOf<AwardRecord | null>(RECORD)] });
    url = http.url;
  });

  beforeEach(() => resetGovcon(http));

  afterAll(async () => {
    await truncateGovcon(http.em);
    await http.app.close();
  });

  it('[GOV-8] [GOV-32] [GOV-33] a tracked award is read by the warm, its ending raised once and kept with what was published, read back at /alerts as the line a person was sent, and the end the warm read shown on the target', async () => {
    expect((await get<Page<RaisedAlertView>>(url, '/alerts')).data).toEqual([]);
    const tracked = await send(url, 'PUT', `/targets/award/${ID}`, {
      label: '89303019FET000003',
      stage: 'watching',
    });
    expect(tracked.status).toBe(200);

    const warmer = http.app.get(SpendingWarmer);
    const first = await warmer.warm();
    expect(first.lenses.at(-1)).toMatchObject({ lens: `award ${ID}`, outcome: 'ok' });
    expect(first.alerts).toEqual({ found: 1, fresh: 1, published: 1, prompted: true });
    expect(http.sink.published.map((alert) => alert.topic)).toEqual(['govcon.award.ending']);

    const listed = await get<Page<RaisedAlertView>>(url, '/alerts');
    expect(listed.meta).toEqual({ total: 1, limit: 10, offset: 0 });
    const [view] = listed.data;
    if (!view?.alert) throw new Error('expected the alert that was published');
    expect(view).toMatchObject({
      key: { kind: 'award-ending', subject: ID },
      profileId: 'tiny',
      raisedAt: '2026-09-26T12:00:00.000Z',
      alert: { topic: 'govcon.award.ending', payload: { scopeKey: null, daysLeft: 50 } },
    });
    expect(describeAlert(view.alert)).toBe(
      '89303019FET000003 (contracts) ends 2026-11-15, in 50 day(s): BOOZ ALLEN HAMILTON INC, $44.1M obligated, HEADQUARTERS PROCUREMENT SERVICES.',
    );
    // What the warm read of its end is on the target now.
    expect((await get<Envelope<Target | null>>(url, `/targets/award/${ID}`)).data?.endsAt).toBe(
      '2026-11-15',
    );

    // The next warm finds the same alert and raises nothing.
    const second = await warmer.warm();
    expect(second.alerts).toEqual({ found: 1, fresh: 0, published: 0, prompted: false });
    expect((await get<Page<RaisedAlertView>>(url, '/alerts')).meta.total).toBe(1);
  });

  it('[GOV-33] pages the alerts within its declared bounds and refuses a page outside them', async () => {
    expect((await get<Page<RaisedAlertView>>(url, '/alerts?limit=5&offset=20')).meta).toEqual({
      total: 0,
      limit: 5,
      offset: 20,
    });
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'kind=award-ending']) {
      expect((await fetch(`${url}/alerts?${query}`)).status, query).toBe(400);
    }
  });
});
