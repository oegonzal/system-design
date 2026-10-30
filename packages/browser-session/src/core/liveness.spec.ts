import { isLive } from './liveness';

const STALE_AFTER_MS = 60_000;

describe("a session's beat", () => {
  it('[BRW-5] tells a live session from a dead one by its beat against the declared window', () => {
    const now = new Date('2026-10-03T10:01:00.000Z');
    expect(isLive('2026-10-03T10:00:30.000Z', now, STALE_AFTER_MS)).toBe(true);
    expect(
      isLive(new Date(now.getTime() - STALE_AFTER_MS).toISOString(), now, STALE_AFTER_MS),
    ).toBe(true);
    expect(
      isLive(new Date(now.getTime() - STALE_AFTER_MS - 1).toISOString(), now, STALE_AFTER_MS),
    ).toBe(false);
  });
});
