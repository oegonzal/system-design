/**
 * Field readers every USAspending normalizer shares, pure: a trimmed string or
 * null, an ISO day out of the source's `YYYY-MM-DD[ hh:mm:ss]`, a number
 * however it was spelled, and the `MM/DD/YYYY` the source's own freshness
 * endpoint uses.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const US_DAY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const day = (value: string | null | undefined): string | null => {
  const cleaned = clean(value);
  return cleaned !== null &&
    ISO_DAY.test(cleaned) &&
    !Number.isNaN(Date.parse(cleaned.slice(0, 10)))
    ? cleaned.slice(0, 10)
    : null;
};

export const usDay = (value: string | null | undefined): string | null => {
  const match = clean(value)?.match(US_DAY);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
};

export const amount = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/[,$\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const integer = (value: number | string | null | undefined): number | null => {
  const parsed = amount(value);
  return parsed === null ? null : Math.trunc(parsed);
};

/** `department.subtier.office` out of its parts, present ones only; null when none. */
export const dotted = (parts: readonly (string | null)[]): string | null => {
  const present = parts.filter((part): part is string => part !== null);
  return present.length > 0 ? present.join('.') : null;
};
