/**
 * A stable string for a JSON value, and a short digest of one.
 *
 * Both exist for one job: keying an action whose payload can still change.
 * An orchestration step's counts tick up between polls, and a run's standing
 * moves as iterations land. Keying those by identity alone would mean editing
 * history; keying them by what they assert makes every observed change its own
 * append-only action, which is the behaviour the whole timeline depends on.
 *
 * Object keys are emitted in sorted order, so two payloads that are equal as
 * values produce equal strings whatever order the server serialised them in.
 */

const stable = (value: unknown, depth: number): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  // The wire's shapes are shallow; a bound is still cheaper than trusting that.
  if (depth > 20) return '"…"';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable(item, depth + 1)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item, depth + 1)}`).join(',')}}`;
};

/** The value as one string, with every object's keys in sorted order. */
export const stableStringify = (value: unknown): string => stable(value, 0);

/**
 * A short digest of a JSON value — FNV-1a over its stable string, base 36.
 *
 * Deterministic and dependency-free. It is used only to tell one observation
 * of a changing payload from another, never to prove two payloads are equal,
 * so the collision risk of a 32-bit hash over a handful of observations per
 * step costs nothing.
 */
export function digest(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
