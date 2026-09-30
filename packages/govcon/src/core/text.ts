/**
 * The one text operation scoring needs: does a declared phrase occur in a
 * title, as whole tokens in order. Tokens are NFKC-folded, lower-cased runs of
 * letters and digits, so `3D-printed` and `3d printed` meet; what counts as a
 * phrase is the profile's data, never this file's.
 */
export const tokenize = (text: string): string[] =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);

/** True when `phrase` occurs in `tokens` as a contiguous run. */
export function containsPhrase(tokens: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || phrase.length > tokens.length) return false;
  outer: for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    for (let index = 0; index < phrase.length; index += 1) {
      if (tokens[start + index] !== phrase[index]) continue outer;
    }
    return true;
  }
  return false;
}

/** An error's message, or the thrown value spelled out — for a warning, never for control flow. */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
