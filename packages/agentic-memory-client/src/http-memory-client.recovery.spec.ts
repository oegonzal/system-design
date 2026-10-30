import { describe, expect, it } from 'vitest';

import { HttpMemoryClient } from './http-memory-client';
import {
  dead,
  failed,
  HOST,
  RECORD,
  REMEMBERING,
  scripted,
  SPACE,
  ticking,
  VERBS,
} from './http-memory-client.testing';
import { MemoryHostRefused, MemoryHostTimeout, MemoryHostUnreachable } from './memory-errors';

/** A recovery as a settings file carries one: the window and the pause. */
const recovery = { windowMs: 10_000, pauseMs: 2_000 };
const space = { id: SPACE, name: 'notes' };
const written = { outcome: 'inserted', record: { id: RECORD }, superseded: null };

/** A client riding out the recovery on a clock that advances only when slept, over the scripted fetch. */
const ridingOut = (fetchImpl: typeof fetch, callTimeoutMs?: number) =>
  new HttpMemoryClient(HOST, { recovery, clock: ticking().clock, callTimeoutMs, fetchImpl });

describe('the memory host over HTTP, ridden out', () => {
  it('[AMC-2] rides out a restarting host within the declared window: a read nobody answered is asked again at the pause; past the window, or with nothing declared, the fault stands at once', async () => {
    // A read that cannot connect twice, then answers — paused twice, as declared.
    const reading = scripted([dead(), dead(), { status: 200, body: { data: space } }]);
    const paced = ticking();
    const client = new HttpMemoryClient(HOST, {
      recovery,
      clock: paced.clock,
      fetchImpl: reading.fetchImpl,
    });
    expect(await client.getSpace(SPACE)).toEqual(space);
    expect([reading.calls.length, paced.slept]).toEqual([3, [2_000, 2_000]]);

    // Past the window — asked at 0, 2, 4, 6 and 8 s of a 10 s window — the fault it would have raised at once.
    const gone = scripted(Array.from({ length: 10 }, dead));
    await expect(ridingOut(gone.fetchImpl).getSpace(SPACE)).rejects.toBeInstanceOf(
      MemoryHostUnreachable,
    );
    expect(gone.calls).toHaveLength(5);

    // A caller that declares nothing is never kept waiting.
    const once = scripted([dead(), { status: 200, body: { data: space } }]);
    await expect(
      new HttpMemoryClient(HOST, { fetchImpl: once.fetchImpl }).getSpace(SPACE),
    ).rejects.toBeInstanceOf(MemoryHostUnreachable);
    expect(once.calls).toHaveLength(1);
  });

  it('[AMC-2] asks a repeatable call again whether nobody answered it or the host failed it, and a write once whatever happened to it — row by row, as the table declares', async () => {
    const answered = { data: { ok: true } };
    for (const verb of VERBS) {
      // The host failed it, and nobody answered it: the row decides both the same way.
      const refused = scripted([failed, { status: verb.ok, body: answered }]);
      const unanswered = scripted([dead(), { status: verb.ok, body: answered }]);
      if (verb.repeatable) {
        expect(await verb.ask(ridingOut(refused.fetchImpl)), verb.name).toEqual({ ok: true });
        expect(await verb.ask(ridingOut(unanswered.fetchImpl)), verb.name).toEqual({ ok: true });
        expect([refused.calls.length, unanswered.calls.length], verb.name).toEqual([2, 2]);
      } else {
        await expect(verb.ask(ridingOut(refused.fetchImpl)), verb.name).rejects.toMatchObject({
          constructor: MemoryHostRefused,
          status: 500,
        });
        await expect(verb.ask(ridingOut(unanswered.fetchImpl)), verb.name).rejects.toBeInstanceOf(
          MemoryHostUnreachable,
        );
        expect([refused.calls.length, unanswered.calls.length], verb.name).toEqual([1, 1]);
      }
    }
    expect(VERBS.filter((verb) => verb.repeatable).map((verb) => verb.name)).toEqual([
      'getSpace',
      'getSpaceByName',
      'ensureSpace',
      'recall',
      'history',
      'getDigest',
    ]);
  });

  it('[AMC-2] never asks a write twice on a dead socket, since the socket does not say whether the host received it: a connection refused and one reset after the request arrived fail the same way, before the answer and under its body', async () => {
    // `TypeError: fetch failed` for a host that is down and for one that died holding the request alike (measured on Node 24).
    const writing = scripted([dead(), { status: 200, body: { data: written } }]);
    await expect(ridingOut(writing.fetchImpl).remember(SPACE, REMEMBERING)).rejects.toBeInstanceOf(
      MemoryHostUnreachable,
    );
    expect(writing.calls).toHaveLength(1);

    // A body the host cut after answering 200 is the same dead socket: a read is asked again, a write is not — the host may have done its work.
    const reading = scripted(['cut', { status: 200, body: { data: space } }]);
    expect(await ridingOut(reading.fetchImpl).getSpace(SPACE)).toEqual(space);
    expect(reading.calls).toHaveLength(2);
    const severed = scripted(['cut', { status: 200, body: { data: written } }]);
    await expect(ridingOut(severed.fetchImpl).remember(SPACE, REMEMBERING)).rejects.toBeInstanceOf(
      MemoryHostUnreachable,
    );
    expect(severed.calls).toHaveLength(1);
  });

  it('[AMC-2] never asks a call the host held past its time again, on any row: a restarting host refuses or fails a call, and one that holds a call is not restarting', async () => {
    const answered = { data: { ok: true } };
    const slow = scripted(['hang', { status: 200, body: answered }]);
    await expect(ridingOut(slow.fetchImpl, 20).getSpace(SPACE)).rejects.toBeInstanceOf(
      MemoryHostTimeout,
    );
    expect(slow.calls).toHaveLength(1);

    // Nor one whose body the host held past its time.
    const stalled = scripted(['stall', { status: 200, body: answered }]);
    await expect(ridingOut(stalled.fetchImpl, 20).getSpace(SPACE)).rejects.toBeInstanceOf(
      MemoryHostTimeout,
    );
    expect(stalled.calls).toHaveLength(1);
  });
});
