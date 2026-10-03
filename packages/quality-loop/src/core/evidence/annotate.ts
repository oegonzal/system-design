/**
 * Prose for a reader, never for a decision. A confirmed finding is structural
 * — a key, ordinals, refs — and the normaliser builds it without reading a
 * word; the first sentence a critic gave for it is attached here, after the
 * fact, so a producer or a person can see why. The same goes for the notes on
 * what the policy selected: the runner does that join, not the policy, so
 * prose reaches the producer and never the decision. The controller never
 * looks.
 */
import type {
  ConfirmedFinding,
  CriticReport,
  EvaluationReport,
  LensOutcome,
  Remediation,
  RemediationNote,
  ValidationReport,
} from '@sysdesign/contracts';

import type { TaskContract } from '../contracts';
import { admitRefs, sameDefect } from './identity';

/** The slot the normaliser leaves empty; `annotate` fills it. */
export const unannotated = (): Pick<ConfirmedFinding, 'rationale'> => ({ rationale: null });

/**
 * Each confirmed finding with the first sentence a critic gave for it. A
 * confirmed finding groups raw ones, so its key is no longer any single raw
 * finding's key: match by membership.
 */
export function annotate(
  confirmed: readonly ConfirmedFinding[],
  critics: readonly LensOutcome<CriticReport>[],
  locations: readonly { id: string }[],
): ConfirmedFinding[] {
  const known = new Set(locations.map((location) => location.id));
  const raws = critics.flatMap((outcome) =>
    (outcome.report?.findings ?? []).map((raw) => ({
      type: raw.type,
      locationRefs: admitRefs(raw.locationRefs, known),
      rationale: raw.rationale,
    })),
  );
  return confirmed.map((finding) => ({
    ...finding,
    rationale: raws.find((raw) => sameDefect(finding, raw))?.rationale ?? null,
  }));
}

interface Notes {
  /** Finding key → the critic's sentence, for findings that carry one. */
  findings: ReadonlyMap<string, string>;
  /** Criterion id → the first sentence an evaluator gave for it. */
  criteria: ReadonlyMap<string, string>;
  /** Criterion id → what the contract asked for. */
  statements: ReadonlyMap<string, string>;
  /** Validator id → its problems, joined. */
  validators: ReadonlyMap<string, string>;
}

const firstSentencePerCriterion = (
  evaluators: readonly LensOutcome<EvaluationReport>[],
): Map<string, string> => {
  const notes = new Map<string, string>();
  for (const outcome of evaluators) {
    for (const raw of outcome.report?.results ?? []) {
      if (!notes.has(raw.criterionId)) notes.set(raw.criterionId, raw.rationale);
    }
  }
  return notes;
};

const noteFor = (subject: Remediation['subject'], notes: Notes): string => {
  if ('finding' in subject) return notes.findings.get(subject.finding) ?? subject.finding;
  if ('criterion' in subject) {
    const asked = notes.statements.get(subject.criterion) ?? subject.criterion;
    return `${asked}: ${notes.criteria.get(subject.criterion) ?? 'not met'}`;
  }
  if ('validator' in subject) return notes.validators.get(subject.validator) ?? subject.validator;
  // A schema refusal is noted where it is named, from the refused reply; the policy never selects one.
  return subject.schema;
};

/**
 * The lenses' own words on what the policy selected. `findings` are the
 * ledger's, already annotated, so a finding's note is the sentence it carries.
 */
export function noteRemediations<T>(
  selected: readonly Remediation[],
  findings: readonly ConfirmedFinding[],
  contract: TaskContract<T>,
  evaluators: readonly LensOutcome<EvaluationReport>[],
  validation: readonly ValidationReport[],
): RemediationNote[] {
  const notes: Notes = {
    findings: new Map(
      findings.flatMap((finding) =>
        finding.rationale === null ? [] : [[finding.key, finding.rationale] as const],
      ),
    ),
    criteria: firstSentencePerCriterion(evaluators),
    statements: new Map(contract.criteria.map((criterion) => [criterion.id, criterion.statement])),
    validators: new Map(
      validation.map((report) => [
        report.validatorId,
        report.problems.map((problem) => problem.message).join('; '),
      ]),
    ),
  };
  return selected.map((remediation) => ({
    ...remediation,
    note: noteFor(remediation.subject, notes),
  }));
}
