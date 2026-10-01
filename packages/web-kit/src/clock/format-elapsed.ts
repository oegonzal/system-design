/**
 * A duration as `m:ss` — long enough for a run of several model calls, never
 * wider, and never negative: a clock that runs a beat behind the server's
 * stamp reads `0:00`, not `-1:59`.
 */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
