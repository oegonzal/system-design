import {
  substituteRefs,
  type Decision,
  type DecisionBasisDto,
  type DecisionFacts,
  type EvaluationFindingDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';

import { counted, humanizeToken } from './humanize';
import { formatScore } from './score';

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
type Wording = (basis: DecisionBasisDto, decision: Decision, glossary: Glossary) => string | null;

const fixes = (count: number): string => counted(count, 'fix', 'fixes');

/** A number the deciding step recorded under `key`; null when it recorded none. */
function numberFact(facts: DecisionFacts, key: string): number | null {
  const value = facts[key];
  return typeof value === 'number' ? value : null;
}

/** The ids the deciding step recorded under `key`; empty when it recorded none. */
function idsFact(facts: DecisionFacts, key: string): readonly string[] {
  const value = facts[key];
  return Array.isArray(value) ? value : [];
}

const listed = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/**
 * What a gate's decision asks for, after the sentence says what stopped the
 * design — the same words whichever gate stopped it. Only the decisions a
 * blocker can settle.
 */
const NEXT_STEP: Partial<Record<Decision, string>> = {
  revise: 'to fix before it can be accepted',
  retry: 'a fresh attempt is called for',
  escalate: 'it needs a person’s judgement',
  reject: 'no revision can fix that, so it is rejected',
};

/** `${what} — ${next step}.`, or null for a decision the gate does not settle that way. */
const stoppedBy = (what: string, decision: Decision): string | null => {
  const next = NEXT_STEP[decision];
  return next === undefined ? null : `${what} — ${next}.`;
};

/**
 * Words for the decisions a controller step settles, by the step's factor
 * (`DecisionBasisDto.factor`) — open, as controllers are composed per
 * pipeline, so a step with no words here is read the controller's way. A
 * step is worded from what it recorded: the route from the remediations it
 * selected, the evidence gate from the criteria assessed, and every other
 * standard gate from its facts — the threshold or floor it held the score
 * to, the blockers it named, the checks that failed. A step that recorded
 * none of them (a trace from before steps carried facts) keeps the
 * controller's sentence, every id in it named.
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
  validators: ({ facts }, decision) => {
    const failed = idsFact(facts, 'validators').length;
    return failed === 0
      ? null
      : stoppedBy(`Failed ${counted(failed, 'structural check', 'structural checks')}`, decision);
  },
  'policy-allowed': ({ facts }, decision, glossary) => {
    const blockers = [...idsFact(facts, 'findings'), ...idsFact(facts, 'criteria')];
    return blockers.length === 0
      ? null
      : stoppedBy(
          `Blocked by ${listed.format(blockers.map((id) => glossary.get(id) ?? id))}`,
          decision,
        );
  },
  'accept-threshold': ({ facts }, decision) => {
    const acceptAt = numberFact(facts, 'acceptAt');
    return decision === 'accept' && acceptAt !== null
      ? `At or above the accept threshold of ${formatScore(acceptAt)}, with nothing blocking it.`
      : null;
  },
  'reject-floor': ({ facts }, decision) => {
    const floor = numberFact(facts, 'floor');
    if (floor === null) return null;
    const below = `Below the reject floor of ${formatScore(floor)}`;
    if (decision === 'revise')
      return `${below} — far enough off to need reworking, not touching up.`;
    if (decision === 'retry')
      return `${below} — too far off to revise, so a fresh attempt is called for.`;
    return null;
  },
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
      ? (WORDED_AT[basis.factor]?.(basis, decision, reasonGlossary(vocabulary)) ?? null)
      : null;
  return worded ?? (reason === null ? null : humanizeReason(reason, vocabulary));
}
