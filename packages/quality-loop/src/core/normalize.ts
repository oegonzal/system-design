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

import type { TaskContract } from './contracts';
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

/** Structural identity of a finding: its type and where it points, never its wording. */
export const findingKey = (type: string, locationRefs: readonly string[]): string =>
  `${type}|${unique(locationRefs).sort(compareStrings).join(',')}`;

/**
 * Whether two findings describe one defect: the same type, pointing at a common
 * location — or neither pointing anywhere.
 *
 * This is deliberately weaker than equal keys. Identity used to require the
 * *same set* of locations, which made agreement almost unreachable: two samples
 * describing one defect routinely cite overlapping but different evidence, so
 * one listing five locations and another listing four counted as two unrelated
 * singletons. Measured over 200 dumped iterations that discarded 60% of every
 * panel's findings as unconfirmed, and 88-100% on a pipeline whose artifact
 * exposes more locations to cite. Overlap is the honest test of "the same
 * defect"; the wording is still never compared.
 */
export const sameDefect = (
  a: { readonly type: string; readonly locationRefs: readonly string[] },
  b: { readonly type: string; readonly locationRefs: readonly string[] },
): boolean =>
  a.type === b.type &&
  (a.locationRefs.length === 0 || b.locationRefs.length === 0
    ? a.locationRefs.length === b.locationRefs.length
    : a.locationRefs.some((ref) => b.locationRefs.includes(ref)));

/** Keep only refs that exist — the enum should already guarantee it; this is the re-check. */
export const admitRefs = (refs: readonly string[], known: ReadonlySet<string>): string[] =>
  unique(refs.filter((ref) => known.has(ref))).sort(compareStrings);

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

  // ---- findings: admit → group into defects → agreement per lens → merge ----
  const admitted: Admitted[] = [];
  const lensOrder = new Map<string, number>();
  for (const outcome of input.critics) {
    if (!outcome.report) continue;
    const { criticId, sample, findings } = outcome.report;
    if (!lensOrder.has(criticId)) lensOrder.set(criticId, lensOrder.size);
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
      admitted.push({
        lens: criticId,
        sample,
        raw: {
          ...raw,
          locationRefs: admitRefs(raw.locationRefs, knownLocations),
          criterionIds: admitRefs(raw.criterionIds, knownCriteria),
        },
      });
    }
  }

  // A defect is confirmed when one lens saw it in `minHits` of its own samples.
  // That rule is unchanged: two lenses seeing it once each is still two
  // opinions, not agreement. Only what counts as "it" has been relaxed.
  const merged = new Map<
    string,
    { raws: RawFinding[]; hits: number; lenses: string[]; refs: string[] }
  >();
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
    merged.set(key, {
      raws: defect.members.filter((m) => lenses.includes(m.lens)).map((m) => m.raw),
      hits: confirming.reduce((total, [, seen]) => total + seen.size, 0),
      lenses,
      refs,
    });
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
        locationRefs: entry.refs,
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
