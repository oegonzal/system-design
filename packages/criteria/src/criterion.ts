/**
 * One completion criterion: the id a test claims in its title, and what must
 * be demonstrably true for the claim to hold.
 */
export interface Criterion {
  id: string;
  /** What must be demonstrably true. */
  statement: string;
}
