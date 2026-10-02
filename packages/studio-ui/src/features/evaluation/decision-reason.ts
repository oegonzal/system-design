import {
  substituteRefs,
  type Decision,
  type DecisionBasisDto,
  type EvaluationFindingDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';

import { counted, humanizeToken } from './humanize';

/** What a reader sees in place of each id the controller wrote: the id → its name. */
export type Glossary = ReadonlyMap<string, string>;

/** The part of a finding a reader names it by. */
export type NamedFinding = Pick<EvaluationFindingDto, 'id' | 'type' | 'locations'>;

/** The records a decision's sentence may cite, as structured data. */
export interface ReasonVocabulary {
  findings?: readonly NamedFinding[];
  criteria?: readonly SuccessCriterion[];
}

/**
 * A finding as a reader names it: its type in words, then the places it is
 * about, by label. Those are the places its lens cited — what the loop keys
 * the finding by, and all `locations` holds — never a place its rationale
 * merely mentions (`mentions`): a name is short, and the rationale says the
 * rest.
 */
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
 * vocabulary holds are rewritten, as whole tokens by the contract's grammar
 * (`substituteRefs`): the sentence is never parsed, so a controller that
 * words its reasons differently still reads, and a name put in place is
 * never read again.
 */
export function humanizeReason(reason: string, vocabulary: ReasonVocabulary): string {
  return substituteRefs(reason, reasonGlossary(vocabulary));
}

/** A decision as a grade records it: the verdict, the controller's sentence, and what settled it. */
export interface RecordedDecision {
  decision: Decision | null;
  /** The controller's own sentence, written for its trace. */
  reason: string | null;
  basis: DecisionBasisDto | null;
}

/** A decision worded from what settled it; null when these words do not fit it. */
type Wording = (basis: DecisionBasisDto, decision: Decision) => string | null;

const fixes = (count: number): string => counted(count, 'fix', 'fixes');

/**
 * Words for the decisions a controller step settles, by the step's factor
 * (`DecisionBasisDto.factor`) — open, as controllers are composed per
 * pipeline, so a step with no words here is read the controller's way. Only
 * steps whose decision the basis says in full are worded: the route, which
 * decides from the remediations it selected below the accept threshold, and
 * the evidence gate, which decides from the criteria assessed. A gate that
 * names its blockers keeps its sentence, where each one is named.
 */
const WORDED_AT: Readonly<Record<string, Wording | undefined>> = {
  route: ({ remediations }, decision) => {
    if (remediations === 0) {
      return 'Below the accept threshold, with no fix the lenses could point to — it needs a person’s judgement.';
    }
    if (decision === 'revise')
      return `Below the accept threshold — ${fixes(remediations)} to make.`;
    if (decision === 'retry') {
      return `Below the accept threshold — ${fixes(remediations)}, each calling for a fresh attempt.`;
    }
    return null;
  },
  evidence: ({ criteria }) =>
    `Not scored — the lenses assessed ${criteria.assessed} of ${counted(
      criteria.total,
      'criterion',
      'criteria',
    )}, too few for a verdict.`,
};

/**
 * A decision in the reader's words: worded from what settled it where the
 * deciding step is one the studio has words for, and otherwise the
 * controller's own sentence with every id it cites named (`humanizeReason`).
 * The controller's sentence is its trace's — "10 remediation(s) to apply" —
 * and never reaches a reader where the basis says it better. Null when the
 * grade recorded no decision to word.
 */
export function decisionInWords(
  { decision, reason, basis }: RecordedDecision,
  vocabulary: ReasonVocabulary,
): string | null {
  const worded =
    decision !== null && basis?.factor
      ? (WORDED_AT[basis.factor]?.(basis, decision) ?? null)
      : null;
  return worded ?? (reason === null ? null : humanizeReason(reason, vocabulary));
}
