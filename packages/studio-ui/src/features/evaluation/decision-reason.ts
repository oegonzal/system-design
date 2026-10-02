import {
  substituteRefs,
  type EvaluationFindingDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';

import { humanizeToken } from './humanize';

/** What a reader sees in place of each id the controller wrote: the id → its name. */
export type Glossary = ReadonlyMap<string, string>;

/** The part of a finding a reader names it by. */
export type NamedFinding = Pick<EvaluationFindingDto, 'id' | 'type' | 'locations' | 'locationRefs'>;

/** The records a decision's sentence may cite, as structured data. */
export interface ReasonVocabulary {
  findings?: readonly NamedFinding[];
  criteria?: readonly SuccessCriterion[];
}

/**
 * A finding as a reader names it: its type in words, then the places it is
 * about, by label. Those are the places its lens cited — what the loop keys
 * the finding by — never every place its rationale goes on to mention, which
 * `locations` also holds: a name is short, and the rationale says the rest.
 */
export function findingName(finding: NamedFinding): string {
  const type = humanizeToken(finding.type);
  const cited = finding.locations.filter((location) => finding.locationRefs.includes(location.ref));
  if (cited.length === 0) return type;
  return `${type} (${cited.map((location) => location.label).join('; ')})`;
}

/**
 * Every id the controller may cite, with what a reader calls it: a
 * finding's structural key → its name, a criterion id → its statement,
 * quoted so a list of them still reads as a list.
 */
export function reasonGlossary({ findings = [], criteria = [] }: ReasonVocabulary): Glossary {
  return new Map([
    ...criteria.map((criterion) => [criterion.id, `“${criterion.statement}”`] as const),
    ...findings.map((finding) => [finding.id, findingName(finding)] as const),
  ]);
}

/**
 * The controller's sentence for its decision, in the reader's words. The
 * controller names its blockers by the ids its ledger keys them with — a
 * finding's `type|refs` key, a criterion id — and the trace keeps them so;
 * the reader gets each one as the record itself names it. Only the ids the
 * vocabulary holds are rewritten, as whole tokens by the contract's grammar
 * (`substituteRefs`): the sentence is never parsed, so a controller that
 * words its reasons differently still reads, and a name put in place is
 * never read again.
 */
export function humanizeReason(reason: string, vocabulary: ReasonVocabulary): string {
  return substituteRefs(reason, reasonGlossary(vocabulary));
}
