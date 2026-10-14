/**
 * A statement about the company, and whether its owner has confirmed it.
 *
 * The site never presents an unconfirmed detail as fact: a placeholder renders
 * as a visibly marked "Placeholder" (FactValue) and is left out of structured
 * data. Confirming a detail is a one-line change from `placeholder(…)` to
 * `verified(…)` in src/data/company.ts.
 */

/**
 * The mark only this module writes. Every fact carries it, and a spread or
 * Object.assign copy keeps it, since both copy symbol keys; structuredClone and
 * a JSON round trip drop it, so their copy is not told from data. A hand-written
 * object cannot have it, so a fact is told from any other object by the mark,
 * never by its shape.
 */
const FACT = Symbol('fact');

export type Fact<T> = (
  | { readonly status: 'verified'; readonly value: T }
  | { readonly status: 'placeholder'; readonly label: string }
) & { readonly [FACT]: true };

/** A person the site names, as two facts: each is confirmed, or a placeholder, on its own. */
export interface PersonFacts {
  readonly name: Fact<string>;
  readonly title: Fact<string>;
}

export const verified = <T>(value: T): Fact<T> => ({ [FACT]: true, status: 'verified', value });

/** `label` says where the confirmed value will come from. */
export const placeholder = (label: string): Fact<never> => ({
  [FACT]: true,
  status: 'placeholder',
  label,
});

/** Whether a value is a fact itself, which no serializer may write out: only a confirmed value is data. */
export const isFact = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && FACT in value;

/** The confirmed value, or undefined while the detail is still a placeholder. */
export const confirmed = <T>(fact: Fact<T>): T | undefined =>
  fact.status === 'verified' ? fact.value : undefined;
