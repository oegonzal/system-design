/** Code-unit order: the same on every machine and in every locale, so every sort the runtime answers with is deterministic. */
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
