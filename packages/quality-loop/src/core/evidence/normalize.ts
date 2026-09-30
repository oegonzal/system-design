/**
 * Reports → ledger. Everything a lens said is admitted against what exists,
 * keyed structurally, confirmed by agreement across samples, merged by a
 * conservative median, and reconciled so one shortfall is charged once. The
 * result carries ids, enums and counts only: the policy reads nothing else.
 */
import type {
  ArtifactLocation,
  ConfirmedFinding,
  CriterionEvidence,
  CriticReport,
  DecisionPolicy,
  Diagnostic,
  DiscardedItem,
  EvaluationReport,
  EvidenceLedger,
  LensOutcome,
  RawCriterionResult,
  RawFinding,
  ValidationReport,
} from '@sysdesign/contracts';

import type { TaskContract } from '../contracts';
import { unannotated } from './annotate';
import { admitRefs, findingKey, sameDefect } from './identity';
import {
  CONFIDENCE_LOW_FIRST,
  compareFindings,
  compareStrings,
  FIXABILITY_LOCAL_FIRST,
  medianLevel,
  RESULT_WORST_FIRST,
  SEVERITY_MILD_FIRST,
  unique,
} from './ordering';

export interface NormalizeInput<T> {
  contract: TaskContract<T>;
  artifactPresent: boolean;
  locations: readonly ArtifactLocation[];
  validation: ValidationReport[];
  critics: LensOutcome<CriticReport>[];
  evaluators: LensOutcome<EvaluationReport>[];
  diagnostics: Diagnostic[];
}

/** The ids that exist for this artifact and this contract: everything else is inadmissible. */
interface Known {
  locations: ReadonlySet<string>;
  criteria: ReadonlySet<string>;
  types: ReadonlySet<string>;
}

interface Admitted {
  lens: string;
  sample: number;
  raw: RawFinding;
}

interface Defect {
  type: string;
  refs: Set<string>;
  members: Admitted[];
}

/** A defect enough samples agreed on, with everything its confirming lenses said about it. */
interface Confirmed {
  raws: RawFinding[];
  hits: number;
  lenses: string[];
  refs: string[];
}

interface CriterionBucket {
  samples: Set<number>;
  raws: RawCriterionResult[];
}

const knownIn = <T>(input: NormalizeInput<T>): Known => ({
  locations: new Set(input.locations.map((location) => location.id)),
  criteria: new Set(input.contract.criteria.map((criterion) => criterion.id)),
  types: new Set(Object.keys(input.contract.findingTypes)),
});

/**
 * Admitted findings grouped into defects by `sameDefect`, as connected
 * components — so agreement is transitive through shared evidence. The input is
 * sorted first, and components are merged into the earliest survivor, so the
 * grouping is a function of the findings alone and not of the order lenses
 * happened to return.
 */
function defectsOf(items: readonly Admitted[]): Defect[] {
  const sorted = [...items].sort(
    (a, b) =>
      compareStrings(a.raw.type, b.raw.type) ||
      compareStrings(a.raw.locationRefs.join(','), b.raw.locationRefs.join(',')) ||
      compareStrings(a.lens, b.lens) ||
      a.sample - b.sample,
  );
  const defects: Defect[] = [];
  for (const item of sorted) {
    const here = { type: item.raw.type, locationRefs: item.raw.locationRefs };
    const touching = defects.filter((defect) =>
      sameDefect({ type: defect.type, locationRefs: [...defect.refs] }, here),
    );
    if (touching.length === 0) {
      defects.push({
        type: item.raw.type,
        refs: new Set(item.raw.locationRefs),
        members: [item],
      });
      continue;
    }
    const [head, ...rest] = touching;
    head.members.push(item);
    for (const ref of item.raw.locationRefs) head.refs.add(ref);
    for (const other of rest) {
      head.members.push(...other.members);
      for (const ref of other.refs) head.refs.add(ref);
      defects.splice(defects.indexOf(other), 1);
    }
  }
  return defects;
}

// ---- findings: admit → group into defects → agreement per lens → merge ----

/** Findings of a type the task knows, refs re-checked; lenses ranked by the order they reported in. */
function admitFindings(
  critics: readonly LensOutcome<CriticReport>[],
  known: Known,
  discarded: DiscardedItem[],
): { admitted: Admitted[]; lensOrder: Map<string, number> } {
  const admitted: Admitted[] = [];
  const lensOrder = new Map<string, number>();
  for (const outcome of critics) {
    if (!outcome.report) continue;
    const { criticId, sample, findings } = outcome.report;
    if (!lensOrder.has(criticId)) lensOrder.set(criticId, lensOrder.size);
    for (const raw of findings) {
      if (!known.types.has(raw.type)) {
        discarded.push({
          lens: criticId,
          key: findingKey(raw.type, raw.locationRefs),
          reason: 'inadmissible',
          detail: `unknown finding type ${raw.type}`,
        });
        continue;
      }
      admitted.push({
        lens: criticId,
        sample,
        raw: {
          ...raw,
          locationRefs: admitRefs(raw.locationRefs, known.locations),
          criterionIds: admitRefs(raw.criterionIds, known.criteria),
        },
      });
    }
  }
  return { admitted, lensOrder };
}

/**
 * A defect is confirmed when one lens saw it in `minHits` of its own samples.
 * Two lenses seeing it once each is still two opinions, not agreement; only
 * what counts as "it" is as loose as `sameDefect`.
 */
function confirmFindings(
  admitted: readonly Admitted[],
  lensOrder: ReadonlyMap<string, number>,
  minHits: number,
  discarded: DiscardedItem[],
): Map<string, Confirmed> {
  const confirmed = new Map<string, Confirmed>();
  for (const defect of defectsOf(admitted)) {
    const refs = [...defect.refs].sort(compareStrings);
    const key = findingKey(defect.type, refs);
    const samplesPerLens = new Map<string, Set<number>>();
    for (const member of defect.members) {
      const seen = samplesPerLens.get(member.lens) ?? new Set<number>();
      samplesPerLens.set(member.lens, seen);
      seen.add(member.sample);
    }
    const confirming = [...samplesPerLens]
      .filter(([, seen]) => seen.size >= minHits)
      .sort(([a], [b]) => (lensOrder.get(a) ?? 0) - (lensOrder.get(b) ?? 0));
    if (confirming.length === 0) {
      for (const [lens, seen] of samplesPerLens) {
        discarded.push({
          lens,
          key,
          reason: 'below-min-hits',
          detail: `${seen.size} of ${minHits} samples`,
        });
      }
      continue;
    }
    const lenses = confirming.map(([lens]) => lens);
    confirmed.set(key, {
      raws: defect.members.filter((m) => lenses.includes(m.lens)).map((m) => m.raw),
      hits: confirming.reduce((total, [, seen]) => total + seen.size, 0),
      lenses,
      refs,
    });
  }
  return confirmed;
}

// ---- criteria: admit → agreement within the sole judge → conservative median

/** Results on criteria the contract holds, bucketed per criterion, refs re-checked. */
function admitResults(
  evaluators: readonly LensOutcome<EvaluationReport>[],
  known: Known,
  discarded: DiscardedItem[],
): Map<string, CriterionBucket> {
  const buckets = new Map<string, CriterionBucket>();
  for (const outcome of evaluators) {
    if (!outcome.report) continue;
    const { evaluatorId, sample, results } = outcome.report;
    for (const raw of results) {
      if (!known.criteria.has(raw.criterionId)) {
        discarded.push({
          lens: evaluatorId,
          key: raw.criterionId,
          reason: 'inadmissible',
          detail: 'unknown criterion',
        });
        continue;
      }
      const bucket = buckets.get(raw.criterionId) ?? { samples: new Set<number>(), raws: [] };
      buckets.set(raw.criterionId, bucket);
      bucket.samples.add(sample);
      bucket.raws.push({ ...raw, locationRefs: admitRefs(raw.locationRefs, known.locations) });
    }
  }
  return buckets;
}

/** One entry per contract criterion: unassessed under `minHits`, otherwise the lower-middle median. */
function settleCriteria<T>(
  contract: TaskContract<T>,
  buckets: ReadonlyMap<string, CriterionBucket>,
  minHits: number,
): CriterionEvidence[] {
  return contract.criteria.map((criterion) => {
    const bucket = buckets.get(criterion.id);
    const hits = bucket?.samples.size ?? 0;
    if (!bucket || hits < minHits) {
      return {
        criterionId: criterion.id,
        kind: criterion.kind,
        result: 'unassessed',
        hits,
        confidence: null,
        locationRefs: [],
      };
    }
    const applicable = bucket.raws.filter((raw) => raw.result !== 'not_applicable');
    return {
      criterionId: criterion.id,
      kind: criterion.kind,
      result:
        applicable.length === 0
          ? 'not_applicable'
          : medianLevel(
              applicable.map((raw) => raw.result),
              RESULT_WORST_FIRST,
            ),
      hits,
      confidence: medianLevel(
        bucket.raws.map((raw) => raw.confidence),
        CONFIDENCE_LOW_FIRST,
      ),
      locationRefs: unique(bucket.raws.flatMap((raw) => raw.locationRefs)).sort(compareStrings),
    };
  });
}

// ---- reconciliation: a finding on a criterion already failed is not priced twice

/** Confirmed defects as ledger findings, worst first, each reconciled to the first short criterion it names. */
function reconcileFindings<T>(
  confirmed: ReadonlyMap<string, Confirmed>,
  criteria: readonly CriterionEvidence[],
  contract: TaskContract<T>,
): ConfirmedFinding[] {
  const resultOf = new Map(criteria.map((evidence) => [evidence.criterionId, evidence.result]));
  const contractOrder = new Map(contract.criteria.map((criterion, index) => [criterion.id, index]));
  return [...confirmed]
    .map(([key, entry]) => {
      const first = entry.raws[0];
      const criterionIds = unique(entry.raws.flatMap((raw) => raw.criterionIds)).sort(
        (a, b) => (contractOrder.get(a) ?? 0) - (contractOrder.get(b) ?? 0),
      );
      const reconciledTo =
        criterionIds.find((id) => {
          const result = resultOf.get(id);
          return result === 'fail' || result === 'partial';
        }) ?? null;
      return {
        key,
        type: first.type,
        severity: medianLevel(
          entry.raws.map((raw) => raw.severity),
          SEVERITY_MILD_FIRST,
        ),
        confidence: medianLevel(
          entry.raws.map((raw) => raw.confidence),
          CONFIDENCE_LOW_FIRST,
        ),
        fixability: medianLevel(
          entry.raws.map((raw) => raw.fixability),
          FIXABILITY_LOCAL_FIRST,
        ),
        locationRefs: entry.refs,
        criterionIds,
        hits: entry.hits,
        lenses: entry.lenses,
        ...unannotated(),
        reconciledTo,
      };
    })
    .sort(compareFindings);
}

/** What the stages reported about themselves, in stage order: the caller's, then every lens's. */
const gatheredDiagnostics = <T>(input: NormalizeInput<T>): Diagnostic[] => [
  ...input.diagnostics,
  ...input.critics.flatMap((outcome) => (outcome.diagnostic ? [outcome.diagnostic] : [])),
  ...input.evaluators.flatMap((outcome) => (outcome.diagnostic ? [outcome.diagnostic] : [])),
];

export function normalize<T>(input: NormalizeInput<T>, policy: DecisionPolicy): EvidenceLedger {
  const { contract } = input;
  const { minHits } = policy.evidence;
  const known = knownIn(input);
  const discarded: DiscardedItem[] = [];

  const { admitted, lensOrder } = admitFindings(input.critics, known, discarded);
  const confirmed = confirmFindings(admitted, lensOrder, minHits, discarded);
  const criteria = settleCriteria(
    contract,
    admitResults(input.evaluators, known, discarded),
    minHits,
  );
  const findings = reconcileFindings(confirmed, criteria, contract);

  return {
    artifactPresent: input.artifactPresent,
    validation: input.validation,
    criteria,
    findings,
    discarded: discarded.sort(
      (a, b) => compareStrings(a.lens, b.lens) || compareStrings(a.key, b.key),
    ),
    diagnostics: gatheredDiagnostics(input),
  };
}
