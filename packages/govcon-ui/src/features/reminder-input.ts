/** ISO 8601 → a `datetime-local` input's value, read as UTC so a page never depends on the machine's zone. */
export const toReminderInput = (iso: string | null): string =>
  iso === null ? '' : iso.slice(0, 16);

/** The input's value back to ISO 8601, UTC; an empty field is no reminder. */
export const fromReminderInput = (value: string): string | null =>
  value === '' ? null : `${value}:00.000Z`;
