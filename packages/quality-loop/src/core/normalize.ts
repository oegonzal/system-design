/**
 * Reports → ledger. Everything a lens said is admitted against what exists,
 * keyed structurally, confirmed by agreement across samples, merged by a
 * conservative median, and reconciled so one shortfall is charged once. The
 * result carries ids, enums and counts only: the policy reads nothing else.
 */
import type {
  ConfirmedFinding,
  CriterionEvidence,
  CriticReport,
  Diagnostic,
  DiscardedItem,
  EvaluationReport,
  EvidenceLedger,
  LensOutcome,
  Location,
  RawCriterionResult,
  RawFinding,
  TaskContract,
  ValidationReport,
} from './contracts';
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
import type { DecisionPolicy } from './policy';

export interface NormalizeInput<T> {
  contract: TaskContract<T>;
  artifactPresent: boolean;
  locations: readonly Location[];
  validation: ValidationReport[];
  critics: LensOutcome<CriticReport>[];
  evaluators: LensOutcome<EvaluationReport>[];
  diagnostics: Diagnostic[];
}

/** Structural identity of a finding: its type and where it points, never its wording. */
export const findingKey = (type: string, locationRefs: readonly string[]): string =>
  `${type}|${unique(locationRefs).sort(compareStrings).join(',')}`;

/** Keep only refs that exist — the enum should already guarantee it; this is the re-check. */
export const admitRefs = (refs: readonly string[], known: ReadonlySet<string>): string[] =>
  unique(refs.filter((ref) => known.has(ref))).sort(compareStrings);

interface FindingBucket {
  samples: Set<number>;
  raws: RawFinding[];
}

interface CriterionBucket {
  samples: Set<number>;
  raws: RawCriterionResult[];
}

export function normalize<T>(input: NormalizeInput<T>, policy: DecisionPolicy): EvidenceLedger {
  const { contract } = input;
  const { minHits } = policy.evidence;
  const knownLocations = new Set(input.locations.map((location) => location.id));
  const knownCriteria = new Set(contract.criteria.map((criterion) => criterion.id));
  const knownTypes = new Set(Object.keys(contract.findingTypes));
  const discarded: DiscardedItem[] = [];

  // ---- findings: admit → key → agreement per lens → merge across lenses ----
  const perLens = new Map<string, Map<string, FindingBucket>>();
  for (const outcome of input.critics) {
    if (!outcome.report) continue;
    const { criticId, sample, findings } = outcome.report;
    const buckets = perLens.get(criticId) ?? new Map<string, FindingBucket>();
    perLens.set(criticId, buckets);
    for (const raw of findings) {
      if (!knownTypes.has(raw.type)) {
        discarded.push({
          lens: criticId,
          key: findingKey(raw.type, raw.locationRefs),
          reason: 'inadmissible',
          detail: `unknown finding type ${raw.type}`,
        });
        continue;
      }
      const admitted: RawFinding = {
        ...raw,
        locationRefs: admitRefs(raw.locationRefs, knownLocations),
        criterionIds: admitRefs(raw.criterionIds, knownCriteria),
      };
      const key = findingKey(admitted.type, admitted.locationRefs);
      const bucket = buckets.get(key) ?? { samples: new Set<number>(), raws: [] };
      buckets.set(key, bucket);
      bucket.samples.add(sample);
      bucket.raws.push(admitted);
    }
  }

  const merged = new Map<string, { raws: RawFinding[]; hits: number; lenses: string[] }>();
  for (const [lens, buckets] of perLens) {
    for (const [key, bucket] of buckets) {
      if (bucket.samples.size < minHits) {
        discarded.push({
          lens,
          key,
          reason: 'below-min-hits',
          detail: `${bucket.samples.size} of ${minHits} samples`,
        });
        continue;
      }
      const entry = merged.get(key) ?? { raws: [], hits: 0, lenses: [] };
      merged.set(key, entry);
      entry.raws.push(...bucket.raws);
      entry.hits += bucket.samples.size;
      entry.lenses.push(lens);
    }
  }

  // ---- criteria: admit → agreement within the sole judge → conservative median
  const judged = new Map<string, CriterionBucket>();
  for (const outcome of input.evaluators) {
    if (!outcome.report) continue;
    const { evaluatorId, sample, results } = outcome.report;
    for (const raw of results) {
      if (!knownCriteria.has(raw.criterionId)) {
        discarded.push({
          lens: evaluatorId,
          key: raw.criterionId,
          reason: 'inadmissible',
          detail: 'unknown criterion',
        });
        continue;
      }
      const bucket = judged.get(raw.criterionId) ?? { samples: new Set<number>(), raws: [] };
      judged.set(raw.criterionId, bucket);
      bucket.samples.add(sample);
      bucket.raws.push({ ...raw, locationRefs: admitRefs(raw.locationRefs, knownLocations) });
    }
  }

  const criteria: CriterionEvidence[] = contract.criteria.map((criterion) => {
    const bucket = judged.get(criterion.id);
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

  // ---- reconciliation: a finding on a criterion already failed is not priced twice
  const resultOf = new Map(criteria.map((evidence) => [evidence.criterionId, evidence.result]));
  const contractOrder = new Map(contract.criteria.map((criterion, index) => [criterion.id, index]));
  const findings: ConfirmedFinding[] = [...merged]
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
        locationRefs: first.locationRefs,
        criterionIds,
        hits: entry.hits,
        lenses: entry.lenses,
        reconciledTo,
      };
    })
    .sort(compareFindings);

  const diagnostics = [
    ...input.diagnostics,
    ...input.critics.flatMap((outcome) => (outcome.diagnostic ? [outcome.diagnostic] : [])),
    ...input.evaluators.flatMap((outcome) => (outcome.diagnostic ? [outcome.diagnostic] : [])),
  ];

  return {
    artifactPresent: input.artifactPresent,
    validation: input.validation,
    criteria,
    findings,
    discarded: discarded.sort(
      (a, b) => compareStrings(a.lens, b.lens) || compareStrings(a.key, b.key),
    ),
    diagnostics,
  };
}
