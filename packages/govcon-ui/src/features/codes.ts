/** `a, b c` → `['a', 'b', 'c']`: the codes a field names, however they were separated. */
export const codesOf = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
