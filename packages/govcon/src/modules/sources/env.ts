/** A non-negative number out of the environment, or the fallback: absent, blank, unreadable and negative all read as the fallback. */
export const numberOr = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
