import type {
  AxisFactorLevel,
  ConfirmedFinding,
  CriterionResult,
  Diagnostic,
  DiscardedItem,
  EvidenceResult,
  Fixability,
  PipelineSummary,
  Severity,
} from '@sysdesign/contracts';

import { groupKeyFor } from './finding-identity';
import { lensCellKey, type InspectorState, type LensCell } from './state';

/**
 * What each lens contributed, and what became of every item it offered.
 *
 * This is the join that answers the question the loop's own output does not:
 * a critic sample reported eleven defects and the ledger confirmed five, so
 * which six went where, and why. Every part of it is on the wire already —
 * the declared bounds from the pipeline registry, what each sample answered
 * from the iteration, what survived from the ledger's findings, what did not
 * from its discards with the normaliser's own `"1 of 2 samples"` — except the
 * edge from a raw finding to its group, which is derived and marked as such.
 *
 * The agreement rule is printed beside the result because it is the thing most
 * worth understanding: a defect is confirmed when *one lens* saw it in `minHits`
 * of *its own* samples. Two lenses seeing it once each is two opinions, not
 * agreement — which is why a lost sample does not merely thin the evidence, it
 * silences the lens it came from.
 */

export interface FindingContribution {
  kind: 'finding';
  /**
   * True when the group this joined was confirmed by OTHER lenses only. Agreement
   * is counted within one lens, so this sample's own lens did not clear the bar —
   * saying "confirmed" without that distinction credits one lens's agreement to
   * another's sample.
   */
  confirmedElsewhere: boolean;
  /** The structural key for this sample's own refs. Not the group's. */
  ownKey: string;
  type: string;
  severity: Severity;
  confidence: AxisFactorLevel;
  fixability: Fixability;
  locationRefs: readonly string[];
  criterionIds: readonly string[];
  rationale: string;
  fate: 'confirmed' | 'reconciled' | 'discarded' | 'inadmissible' | 'unaccounted';
  /** The ledger's key for the merged defect this joined — a derived edge. */
  groupKey: string | null;
  /** The ledger's own words: `1 of 2 samples`, `unknown finding type x`. */
  detail: string | null;
  /** The criterion a confirmed finding was charged to instead, so it is not priced twice. */
  reconciledTo: string | null;
  /** Samples that saw the group, across its confirming lenses. */
  hits: number | null;
  /** Which lenses confirmed the group — how a reader sees agreement happen. */
  lenses: readonly string[];
}

export interface ResultContribution {
  kind: 'result';
  criterionId: string;
  result: CriterionResult;
  confidence: AxisFactorLevel;
  locationRefs: readonly string[];
  rationale: string;
  /** What the ledger settled on across every sample that judged this criterion. */
  settled: EvidenceResult | null;
  hits: number | null;
  fate: 'settled' | 'unassessed' | 'inadmissible' | 'unaccounted';
  detail: string | null;
}

export type Contribution = FindingContribution | ResultContribution;

export interface LensSample {
  /** 1-based within the lens; null for a lens that could not run at all. */
  sample: number | null;
  /** The iteration the cell came from — older than the current one means it did not report again. */
  iteration: number | null;
  /**
   * True when this cell was written by an EARLIER iteration than the one being
   * read. Its items are then shown as what that iteration said and are NOT
   * joined to the current ledger — joining them produced rows badged "no ledger
   * entry matches" for findings that were perfectly well accounted for, one
   * iteration ago.
   */
  stale: boolean;
  /** Why this sample produced nothing, when it produced nothing. */
  diagnostic: Diagnostic | null;
  /** True when the declaration expects this sample but nothing was recorded for it. */
  missing: boolean;
  items: Contribution[];
}

export interface DeclaredLens {
  samples: number;
  maxItems: number;
  maxTokens: number;
  consumes: readonly string[];
  /** Evaluators only: the criterion kinds this lens is asked to judge. */
  criterionKinds?: readonly string[];
}

export interface LensContribution {
  lens: string;
  kind: LensCell['kind'];
  /** What the pipeline declares; null for a lens the registry does not list. */
  declared: DeclaredLens | null;
  samples: LensSample[];
  /** The agreement bar this lens's findings had to clear. */
  minHits: number;
  /** Discards the ledger attributes to this lens that no recorded sample accounts for. */
  unexplainedDiscards: DiscardedItem[];
}

const fateOfFinding = (
  confirmed: ConfirmedFinding | undefined,
  discarded: DiscardedItem | undefined,
): FindingContribution['fate'] => {
  if (confirmed !== undefined) {
    return confirmed.reconciledTo === null ? 'confirmed' : 'reconciled';
  }
  if (discarded !== undefined) {
    return discarded.reason === 'inadmissible' ? 'inadmissible' : 'discarded';
  }
  return 'unaccounted';
};

function findingItems(cell: LensCell, state: InspectorState): FindingContribution[] {
  const report = cell.report;
  if (report === null || !('findings' in report)) return [];
  const { findings, discarded } = state.ledger;
  const mine = discarded.filter((item) => item.lens === cell.lens);
  const keys = [...findings.map((item) => item.key), ...mine.map((item) => item.key)];
  return report.findings.map((raw): FindingContribution => {
    const groupKey = groupKeyFor(raw, keys);
    const confirmed = findings.find((item) => item.key === groupKey);
    const discard = mine.find((item) => item.key === groupKey);
    return {
      kind: 'finding',
      ownKey: `${raw.type}|${[...raw.locationRefs].sort().join(',')}`,
      type: raw.type,
      severity: raw.severity,
      confidence: raw.confidence,
      fixability: raw.fixability,
      locationRefs: raw.locationRefs,
      criterionIds: raw.criterionIds,
      rationale: raw.rationale,
      fate: fateOfFinding(confirmed, discard),
      // The group's hits and confirming lenses belong to the group, not to this
      // sample: agreement is counted within one lens, so a group this lens did
      // not confirm was carried by somebody else.
      confirmedElsewhere: confirmed !== undefined && !confirmed.lenses.includes(cell.lens),
      groupKey,
      detail: discard?.detail ?? null,
      reconciledTo: confirmed?.reconciledTo ?? null,
      hits: confirmed?.hits ?? null,
      lenses: confirmed?.lenses ?? [],
    };
  });
}

function resultItems(cell: LensCell, state: InspectorState): ResultContribution[] {
  const report = cell.report;
  if (report === null || !('results' in report)) return [];
  const { criteria, discarded } = state.ledger;
  const mine = discarded.filter((item) => item.lens === cell.lens);
  return report.results.map((raw): ResultContribution => {
    const settled = criteria.find((entry) => entry.criterionId === raw.criterionId);
    const discard = mine.find((item) => item.key === raw.criterionId);
    const fate: ResultContribution['fate'] =
      discard !== undefined
        ? 'inadmissible'
        : settled === undefined
          ? 'unaccounted'
          : settled.result === 'unassessed'
            ? 'unassessed'
            : 'settled';
    return {
      kind: 'result',
      criterionId: raw.criterionId,
      result: raw.result,
      confidence: raw.confidence,
      locationRefs: raw.locationRefs,
      rationale: raw.rationale,
      settled: settled?.result ?? null,
      hits: settled?.hits ?? null,
      fate,
      detail: discard?.detail ?? null,
    };
  });
}

/** One lens's row: its declaration, every sample of it, and what each sample's items became. */
function contributionOf(
  lens: string,
  kind: LensCell['kind'],
  declared: DeclaredLens | null,
  cells: ReadonlyMap<string, LensCell>,
  state: InspectorState,
  minHits: number,
): LensContribution {
  const expected = declared?.samples ?? 0;
  const observed = [...cells.values()].filter((cell) => cell.lens === lens);
  const numbers = new Set<number | null>();
  for (let sample = 1; sample <= expected; sample += 1) numbers.add(sample);
  for (const cell of observed) numbers.add(cell.sample);

  const current = state.iteration?.number ?? null;
  const samples = [...numbers]
    .sort((a, b) => (a ?? 0) - (b ?? 0))
    .map((sample): LensSample => {
      const cell = cells.get(lensCellKey(lens, sample));
      if (cell === undefined) {
        return {
          sample,
          iteration: null,
          diagnostic: null,
          missing: true,
          stale: false,
          items: [],
        };
      }
      const stale = current !== null && cell.iteration < current;
      return {
        sample,
        iteration: cell.iteration,
        diagnostic: cell.diagnostic,
        missing: false,
        stale,
        // A cell from an earlier iteration is not joined to this iteration's
        // ledger: nothing in that ledger was built from it.
        items: stale
          ? []
          : kind === 'critic'
            ? findingItems(cell, state)
            : resultItems(cell, state),
      };
    });

  const explained = new Set(
    samples.flatMap((sample) =>
      sample.items.flatMap((item) =>
        item.kind === 'finding' && item.groupKey !== null ? [item.groupKey] : [],
      ),
    ),
  );
  return {
    lens,
    kind,
    declared,
    samples,
    minHits,
    unexplainedDiscards: state.ledger.discarded.filter(
      (item) => item.lens === lens && !explained.has(item.key),
    ),
  };
}

export interface LensContributions {
  critics: LensContribution[];
  evaluators: LensContribution[];
  /** The agreement bar, from the pipeline's own policy. */
  minHits: number;
  /** True when no pipeline summary was available, so the declared columns are empty. */
  undeclared: boolean;
}

/**
 * Every lens the pipeline declares, in declared order, followed by any lens the
 * run recorded that the registry does not list — which is a real condition worth
 * seeing rather than one to hide.
 */
export function lensContributions(
  state: InspectorState,
  pipeline: PipelineSummary | null,
): LensContributions {
  const minHits = pipeline?.policy.evidence.minHits ?? 1;
  const critics = new Map(Object.entries(state.lenses.critics));
  const evaluators = new Map(Object.entries(state.lenses.evaluators));

  const rows = (
    kind: LensCell['kind'],
    cells: ReadonlyMap<string, LensCell>,
    declared: readonly { id: string }[],
    declaredOf: (id: string) => DeclaredLens | null,
  ): LensContribution[] => {
    const named = declared.map((lens) => lens.id);
    const recorded = [...new Set([...cells.values()].map((cell) => cell.lens))];
    const order = [...named, ...recorded.filter((lens) => !named.includes(lens))];
    return order.map((lens) => contributionOf(lens, kind, declaredOf(lens), cells, state, minHits));
  };

  return {
    minHits,
    undeclared: pipeline === null,
    critics: rows('critic', critics, pipeline?.critics ?? [], (id) => {
      const declared = pipeline?.critics.find((lens) => lens.id === id);
      return declared === undefined
        ? null
        : {
            samples: declared.samples,
            maxItems: declared.maxItems,
            maxTokens: declared.maxTokens,
            consumes: declared.consumes,
          };
    }),
    evaluators: rows('evaluator', evaluators, pipeline?.evaluators ?? [], (id) => {
      const declared = pipeline?.evaluators.find((lens) => lens.id === id);
      return declared === undefined
        ? null
        : {
            samples: declared.samples,
            maxItems: declared.maxItems,
            maxTokens: declared.maxTokens,
            consumes: declared.consumes,
            criterionKinds: declared.criterionKinds,
          };
    }),
  };
}
