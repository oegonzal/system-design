import type { EvaluationFindingDto, SuccessCriterion } from '@sysdesign/contracts';

import { humanizeToken } from './humanize';
import { substituteTerms, type Glossary } from './location-labels';

/** The part of a finding a reader names it by. */
export type NamedFinding = Pick<EvaluationFindingDto, 'id' | 'type' | 'locations'>;

/** The records a decision's sentence may cite, as structured data. */
export interface ReasonVocabulary {
  findings?: readonly NamedFinding[];
  criteria?: readonly SuccessCriterion[];
}

/** A finding as a reader names it: its type in words, then the places it points at, by label. */
export function findingName(finding: NamedFinding): string {
  const type = humanizeToken(finding.type);
  if (finding.locations.length === 0) return type;
  return `${type} (${finding.locations.map((location) => location.label).join('; ')})`;
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
 * vocabulary holds are rewritten: the sentence is never parsed, so a
 * controller that words its reasons differently still reads.
 */
export function humanizeReason(reason: string, vocabulary: ReasonVocabulary): string {
  return substituteTerms(reason, reasonGlossary(vocabulary));
}
