/**
 * A statement about the company that its owner has confirmed, declared once in
 * src/data. FactValue renders one inside `data-fact="verified"`, the only text
 * the credential check (website-e2e's claims) lets name a credential, and
 * structured data writes a fact's value, never the fact.
 */

/**
 * The mark only this module writes. Every fact carries it, and a spread or
 * Object.assign copy keeps it, since both copy symbol keys; structuredClone and
 * a JSON round trip drop it, so their copy is not told from data. A hand-written
 * object cannot have it, so a fact is told from any other object by the mark,
 * never by its shape.
 */
const FACT = Symbol('fact');

export type Fact<T> = { readonly value: T; readonly [FACT]: true };

/** A person the site names, as two facts. */
export interface PersonFacts {
  readonly name: Fact<string>;
  readonly title: Fact<string>;
}

export const verified = <T>(value: T): Fact<T> => ({ [FACT]: true, value });

/** Whether a value is a fact itself, which no serializer may write out: only its value is data. */
export const isFact = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && FACT in value;
