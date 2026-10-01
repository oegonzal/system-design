import { locationRefPattern, type EvaluationLocationDto } from '@sysdesign/contracts';

/** What a reader sees in place of each id the loop wrote: the id → its label. */
export type Glossary = ReadonlyMap<string, string>;

/**
 * Prose with every id the glossary holds replaced by its label. Pure.
 * Matching is against the ids the record actually holds — never a guess at
 * what looks like one — as whole tokens, longest first (the contract's
 * `locationRefPattern`, the same rule the API grounds prose with), so a listed
 * `node.1` never eats the `node.12` beside it. An id the glossary does not
 * hold is left as written, and a label put in place is never read again.
 */
export function substituteTerms(prose: string, glossary: Glossary): string {
  const pattern = locationRefPattern([...glossary.keys()]);
  return pattern === null ? prose : prose.replace(pattern, (id) => glossary.get(id) ?? id);
}

/** Each place the mapper grounded, by the positional id a lens cited it with. */
export const locationGlossary = (locations: readonly EvaluationLocationDto[]): Glossary =>
  new Map(locations.map((location) => [location.ref, location.label]));

/**
 * A lens's prose with every location id it cites — `node.3`, `binding.1` —
 * replaced by the label the mapper grounded it to, so the author reads
 * "Orders DB" where the model wrote a position.
 */
export function substituteLocationLabels(
  prose: string,
  locations: readonly EvaluationLocationDto[],
): string {
  return substituteTerms(prose, locationGlossary(locations));
}
