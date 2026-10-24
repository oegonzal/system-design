import { isLive, SESSION_STALE_AFTER_MS } from './write-queue';

describe("a session's beat", () => {
  it('[BRW-5] tells a live session from a dead one by its beat against the declared window', () => {
    const now = new Date('2026-10-03T10:01:00.000Z');
    expect(isLive('2026-10-03T10:00:30.000Z', now)).toBe(true);
    expect(isLive(new Date(now.getTime() - SESSION_STALE_AFTER_MS).toISOString(), now)).toBe(true);
    expect(isLive(new Date(now.getTime() - SESSION_STALE_AFTER_MS - 1).toISOString(), now)).toBe(
      false,
    );
  });
});
