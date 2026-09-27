/** Small pure formatters the tables share. Dates render as their ISO date, never through the machine's zone. */
export const day = (iso: string | null): string => (iso === null ? '—' : iso.slice(0, 10));

export const minute = (iso: string): string => iso.slice(0, 16).replace('T', ' ');

/** The office at the end of SAM.gov's dotted agency path. */
export const agencyOf = (path: string | null): string => {
  if (path === null) return '—';
  const parts = path.split('.').filter((part) => part.trim().length > 0);
  return parts[parts.length - 1] ?? path;
};

export const clip = (text: string, width: number): string =>
  text.length > width ? `${text.slice(0, width - 1)}…` : text;
