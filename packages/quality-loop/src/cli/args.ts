/** What the two commands parse the same way. */

/** An integer flag, or the default when the flag is absent. */
export const intOr = (
  value: string | undefined,
  fallback: number | undefined,
): number | undefined => (value ? parseInt(value, 10) : fallback);
