import type { SessionUnitClosed, SessionUnitOpened } from '@sysdesign/contracts';

import { SessionRecord } from './session-record';
import { InMemoryApplicationStore } from './testing';

const SESSION = { sessionId: crypto.randomUUID(), subject: 'Alex Example', profile: 'spec' };
const unit = (ordinal: number, company: string | null = 'Acme') => ({
  id: crypto.randomUUID(),
  ordinal,
  label: `Senior Engineer at ${company ?? '?'}`,
  url: 'https://jobs.example.test/42',
  facets: company === null ? [] : [{ name: 'company', value: company }],
});
const opened = (u: ReturnType<typeof unit>, session = SESSION): SessionUnitOpened => ({
  ...session,
  maxMinutes: 90,
  unit: u,
});
const closed = (
  u: ReturnType<typeof unit>,
  outcome: SessionUnitClosed['outcome'],
  session = SESSION,
): SessionUnitClosed => ({ ...session, maxMinutes: 90, unit: u, outcome });
const T0 = new Date('2026-10-11T10:00:00.000Z');
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe('what a session’s events do to the record', () => {
  it('[JA-3] an opened unit is inserted in progress with its declared expiry and never changes a row that exists; a close is terminal and the same event twice changes nothing', async () => {
    const store = new InMemoryApplicationStore();
    const record = new SessionRecord(store);
    const first = unit(1);
    expect(await record.opened(opened(first), T0)).toBe('inserted');
    expect(store.rows.get(first.id)).toMatchObject({
      status: 'in-progress',
      company: 'Acme',
      identityKey: 'company=acme',
      sessionId: SESSION.sessionId,
      profile: 'spec',
      unitOrdinal: 1,
      source: 'session',
      openedAt: T0,
      expiresAt: later(90),
    });
    expect(await record.opened(opened(first), later(1))).toBe('known');
    expect(store.rows.get(first.id)?.openedAt).toEqual(T0);
    expect(await record.closed(closed(first, 'done'), later(5))).toBe('updated');
    expect(store.rows.get(first.id)).toMatchObject({
      status: 'submitted',
      closedAt: later(5),
      expiresAt: null,
    });
    expect(await record.closed(closed(first, 'done'), later(5))).toBe('updated');
    expect(await record.opened(opened(first), later(6))).toBe('known');
    expect(store.rows.get(first.id)?.status).toBe('submitted');
  });

  it('[JA-3] a close that arrives without its open is inserted with what it says; a unit without the kept fact is passed over', async () => {
    const store = new InMemoryApplicationStore();
    const record = new SessionRecord(store);
    const seen = unit(2, 'Globex');
    expect(await record.closed(closed(seen, 'already-done'), T0)).toBe('inserted');
    expect(store.rows.get(seen.id)).toMatchObject({
      status: 'submitted-before',
      openedAt: T0,
      closedAt: T0,
      expiresAt: null,
    });
    const nameless = unit(3, null);
    expect(await record.opened(opened(nameless), T0)).toBe('no-company');
    expect(await record.closed(closed(nameless, 'done'), T0)).toBe('no-company');
    expect(store.rows.size).toBe(1);
  });

  it('[JA-3] a session’s end abandons only its own units still in progress, a new session on the profile abandons the dead one’s, and a late close still overrides abandoned', async () => {
    const store = new InMemoryApplicationStore();
    const record = new SessionRecord(store);
    const left = unit(1);
    const done = unit(2, 'Globex');
    await record.opened(opened(left), T0);
    await record.opened(opened(done), T0);
    await record.closed(closed(done, 'done'), later(1));
    const other = { ...SESSION, sessionId: crypto.randomUUID() };
    const elsewhere = unit(1, 'Initech');
    await record.opened(opened(elsewhere, other), T0);
    expect(await record.ended({ sessionId: SESSION.sessionId }, later(10))).toBe(1);
    expect(store.rows.get(left.id)).toMatchObject({
      status: 'abandoned',
      closedAt: later(10),
      expiresAt: null,
    });
    expect(store.rows.get(done.id)?.status).toBe('submitted');
    expect(store.rows.get(elsewhere.id)?.status).toBe('in-progress');

    // One profile runs one browser: a session starting there means the other one died.
    const next = { ...SESSION, sessionId: crypto.randomUUID() };
    expect(await record.started(next, later(20))).toBe(1);
    expect(store.rows.get(elsewhere.id)?.status).toBe('abandoned');
    // A different subject on the same profile is not this record's.
    const someoneElse = {
      sessionId: crypto.randomUUID(),
      subject: 'Someone Else',
      profile: 'spec',
    };
    const theirs = unit(1, 'Hooli');
    await record.opened(opened(theirs, someoneElse), later(21));
    expect(await record.started({ ...next, sessionId: crypto.randomUUID() }, later(22))).toBe(0);
    expect(store.rows.get(theirs.id)?.status).toBe('in-progress');

    // The close the dead session published late: the application did go through.
    expect(await record.closed(closed(left, 'done'), later(30))).toBe('updated');
    expect(store.rows.get(left.id)).toMatchObject({ status: 'submitted', closedAt: later(30) });
  });
});
