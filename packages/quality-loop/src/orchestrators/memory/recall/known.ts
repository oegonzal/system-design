/**
 * What the producer a recall is for already holds, when it revises a judged
 * answer: the base iteration's confirmed findings and criterion results, and
 * the remediation notes the producer is handed for it — beside where that
 * answer comes from (its chain) and which prompt it answers (the hash of its
 * bare goal). The screen compares stored lessons against these as data; the
 * curator is shown the notes as lines. Read from engine facts — ledger keys,
 * remediation subjects — never from prose.
 */
import {
  tokenWords,
  type AdoptedIterationRef,
  type EvidenceResult,
  type Remediation,
  type Severity,
} from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import type { RecallBase } from '../../../modules/runs/recall/run-recall';
import { KNOWN_LINE_MAX, MAX_KNOWN } from '../../../pipelines/memory-recall/input';

/** A remediation note as the producer reads it: what it is about, how bad, and the lens's words. */
export interface KnownRemediation {
  subject: string;
  severity: Severity;
  note: string;
}

export interface RecallKnown {
  /** The pipeline that judged the base — the asker's own. */
  pipeline: string;
  /** sha-256 hex of the asker's bare goal: what a stored lesson's lineage is compared against. */
  goalHash: string;
  /** The base iteration first, then each iteration its run had adopted in turn (`resolveLineage`). */
  chain: AdoptedIterationRef[];
  /** The keys of the base iteration's confirmed findings. */
  findings: ReadonlySet<string>;
  /** The base iteration's criterion results, by id. Rubric-local, so never matched across runs. */
  criteria: ReadonlyMap<string, EvidenceResult>;
  /** The notes the producer is handed for the base, in the order it reads them. */
  remediations: KnownRemediation[];
}

/**
 * What a remediation is about, in words: a finding by its type — looked up by
 * key in the ledger, never read off the key — a criterion with its result, a
 * validator or a schema path by its id.
 */
function subjectOf(
  subject: Remediation['subject'],
  types: ReadonlyMap<string, string>,
  results: ReadonlyMap<string, EvidenceResult>,
): string {
  if ('finding' in subject) {
    const type = types.get(subject.finding);
    return type === undefined ? subject.finding : tokenWords(type);
  }
  if ('criterion' in subject) {
    const result = results.get(subject.criterion);
    return result === undefined ? subject.criterion : `${subject.criterion} ${result}`;
  }
  return 'validator' in subject ? subject.validator : subject.schema;
}

export function knownOf(
  base: RecallBase,
  chain: readonly AdoptedIterationRef[],
  goalHash: string,
): RecallKnown {
  const { ledger, remediations } = base.iteration;
  const types = new Map(ledger.findings.map((finding) => [finding.key, finding.type]));
  const criteria = new Map(ledger.criteria.map((row) => [row.criterionId, row.result]));
  return {
    pipeline: base.pipeline,
    goalHash,
    chain: [...chain],
    findings: new Set(types.keys()),
    criteria,
    remediations: remediations.map(({ subject, severity, note }) => ({
      subject: subjectOf(subject, types, criteria),
      severity,
      note,
    })),
  };
}

/**
 * What the curator is shown as already in hand: the first notes the producer
 * reads, each one line — `severity · subject: note` — capped as a probe is.
 */
export const knownLines = (known: RecallKnown): string[] =>
  known.remediations
    .slice(0, MAX_KNOWN)
    .map(
      ({ severity, subject, note }) =>
        capText(`${severity} · ${subject}: ${note}`.trim(), KNOWN_LINE_MAX).text,
    );
