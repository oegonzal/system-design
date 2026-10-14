/**
 * A statement about the company, and whether its owner has confirmed it.
 *
 * The site never presents an unconfirmed detail as fact: a placeholder renders
 * as a visibly marked "Placeholder" (FactValue) and is left out of structured
 * data. Confirming a detail is a one-line change from `placeholder(…)` to
 * `verified(…)` in src/data/company.ts.
 */
export type Fact<T> =
  | { readonly status: 'verified'; readonly value: T }
  | { readonly status: 'placeholder'; readonly label: string };

export const verified = <T>(value: T): Fact<T> => ({ status: 'verified', value });

/** `label` says where the confirmed value will come from. */
export const placeholder = (label: string): Fact<never> => ({ status: 'placeholder', label });

/** The confirmed value, or undefined while the detail is still a placeholder. */
export const confirmed = <T>(fact: Fact<T>): T | undefined =>
  fact.status === 'verified' ? fact.value : undefined;
