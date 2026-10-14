/** The route one award's record opens at — `/awards/:id` — spelled once for every table that links to one. */
export const awardHref = (externalId: string): string =>
  `/awards/${encodeURIComponent(externalId)}`;

/** The route one firm opens at — `/primes/:uei` — spelled once for every table that links to one. */
export const primeHref = (uei: string): string => `/primes/${encodeURIComponent(uei)}`;
