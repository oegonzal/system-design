/**
 * The guards that keep a dump from being the thing that breaks a run.
 *
 * Everything here fails soft. A dump is an audit trail; an audit trail that can
 * throw is worse than none, because it takes the graded evaluation down with
 * it. Every function below returns a description of the problem instead.
 */

/**
 * One recorded field's ceiling. "Keep everything" is about retention — never
 * pruning old runs — not about letting one pathological record write without
 * bound.
 */
export const MAX_TEXT_BYTES = 1_000_000;

export interface CappedText {
  text: string;
  truncated: boolean;
  /** The size before truncation, so a reader knows what they are missing. */
  originalBytes: number;
}

export function capText(value: string, max = MAX_TEXT_BYTES): CappedText {
  const originalBytes = Buffer.byteLength(value, 'utf8');
  if (originalBytes <= max) return { text: value, truncated: false, originalBytes };
  // Slice by bytes, then decode — a multi-byte character split at the boundary
  // becomes a replacement char rather than corrupting the file.
  const text = Buffer.from(value, 'utf8').subarray(0, max).toString('utf8');
  return { text, truncated: true, originalBytes };
}

/**
 * A plain, JSON-round-trippable copy — or a note saying why there isn't one.
 *
 * The dangerous inputs are ORM entities: a populated relation is a proxy and an
 * uninitialized `Collection` throws on access. Callers should project to plain
 * objects before reaching here; this is the net under that, not a substitute.
 */
export function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch (error) {
    return { unserializable: describeError(error).message };
  }
}

export interface ErrorShape {
  name: string;
  message: string;
  stack: string | null;
}

/** `JSON.stringify(new Error(...))` is `{}` — the fields are not enumerable. */
export function describeError(error: unknown): ErrorShape {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null };
  }
  return { name: 'UnknownError', message: String(error), stack: null };
}
