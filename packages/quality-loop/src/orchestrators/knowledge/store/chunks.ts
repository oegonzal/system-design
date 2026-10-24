/**
 * The two kinds of chunk this orchestrator writes, and the facets both carry.
 *
 * An **item** chunk is what the digest endorsed: typed knowledge, indexed by the
 * same two halves a lesson is — the condition it applies under, and the
 * statement itself — so it competes with lessons in one vector space rather than
 * in a second collection.
 *
 * A **finding** chunk is written from the ledger with no model call at all. It
 * exists because the digest's cap binds: a record carries a median of nine
 * confirmed findings and up to thirty-two, and twelve items cannot hold them.
 * The chunk keeps the defect in the register the engine recorded it in, which is
 * the same register a focused recall searches with, so the two meet as like with
 * like instead of through a lesson's paraphrase. Location ids inside a critic's
 * sentence stay as they are: the focus lines compared against them carry the
 * same ids, stripping them would mean parsing prose, and a finding chunk is this
 * run's precedent rather than a claim of generality.
 *
 * Facets are derived here, never written by a model: the dimension from the
 * source pipeline's policy, the transition from the engine's own lessons, the
 * polarity from the item's kind.
 */
import {
  tokenWords,
  type ChunkFacetsDto,
  type DecisionPolicy,
  type IterationTrace,
  type Lesson,
  type RunTrace,
  type TransitionKind,
} from '@sysdesign/contracts';
import { capText } from '@sysdesign/run-dump';

import { annotate } from '../../../core/evidence/annotate';
import type { ChunkSource } from '../../../pipelines/memory-recall/input';
import { contentHash, type IndexedChunk } from '../../memory/ports';
import type { ChunkOrigin } from '../../memory/store/chunks';
import type { KnowledgeToStore } from '../digest/read-knowledge-digest';

/** The two indexed texts, bounded as the curator's own candidate text is. */
const TEXT_MAX = 1_200;
const KEY_MAX = 500;

const cap = (text: string, max: number): string => capText(text.trim(), max).text;

/** The dimension a criterion kind or a finding type lands on, read from the source pipeline's policy. */
export interface DimensionMap {
  criterionKinds: Readonly<Record<string, string>>;
  findingTypes: Readonly<Record<string, string>>;
}

/** The policy's two maps, reduced to the one question a facet asks of them. */
export const dimensionMapOf = (
  policy: Pick<DecisionPolicy, 'criterionKinds' | 'findingTypes'>,
): DimensionMap => ({
  criterionKinds: Object.fromEntries(
    Object.entries(policy.criterionKinds ?? {}).map(([kind, mapped]) => [kind, mapped.dimension]),
  ),
  findingTypes: Object.fromEntries(
    Object.entries(policy.findingTypes ?? {}).map(([type, mapped]) => [type, mapped.dimension]),
  ),
});

/** Strongest first: a resolution outranks an improvement, which outranks what merely held or slipped. */
const TRANSITION_RANK: readonly TransitionKind[] = [
  'resolved',
  'improved',
  'persisted',
  'regressed',
];

/** The strongest transition the engine recorded for any of these subjects, or null for none. */
export function transitionOf(
  lessons: readonly Lesson[],
  subjects: readonly string[],
): TransitionKind | null {
  const kinds = new Set(
    lessons.filter((lesson) => subjects.includes(lesson.subject)).map((lesson) => lesson.kind),
  );
  return TRANSITION_RANK.find((kind) => kinds.has(kind)) ?? null;
}

/** How strongly an item is grounded: proven by a resolution, held by a pass, else merely observed. */
const groundingOf = (
  transition: TransitionKind | null,
  held: boolean,
): ChunkFacetsDto['grounding'] =>
  transition === 'resolved' ? 'proven' : held ? 'held' : 'observed';

/** What a run's criteria were judged as, by id — what `held` and the criterion facets read. */
interface JudgedCriterion {
  kind: string;
  held: boolean;
}

/** Every criterion of the run with its kind and whether it passed in every iteration that judged it. */
export function judgedCriteria(trace: RunTrace): Map<string, JudgedCriterion> {
  const kindOf = new Map(
    trace.contract.criteria.map((criterion) => [criterion.id, criterion.kind]),
  );
  const results = new Map<string, string[]>();
  for (const iteration of trace.iterations) {
    for (const row of iteration.ledger.criteria) {
      results.set(row.criterionId, [...(results.get(row.criterionId) ?? []), row.result]);
    }
  }
  return new Map(
    [...kindOf.entries()].map(([id, kind]) => {
      const judged = results.get(id) ?? [];
      return [id, { kind, held: judged.length > 0 && judged.every((result) => result === 'pass') }];
    }),
  );
}

/** The facets an endorsed item carries, every one derived from what the engine recorded. */
function itemFacets(
  item: KnowledgeToStore,
  trace: RunTrace,
  dimensions: DimensionMap,
  criteria: Map<string, JudgedCriterion>,
): ChunkFacetsDto {
  const findingRefs = item.evidence
    .filter((reference) => reference.kind === 'finding')
    .map((reference) => reference.ref);
  const criterionRefs = item.evidence
    .filter((reference) => reference.kind === 'criterion')
    .map((reference) => reference.ref);
  const transition = transitionOf(trace.lessons, [...findingRefs, ...criterionRefs]);
  const held = criterionRefs.some((ref) => criteria.get(ref)?.held === true);
  const findingTypes = [
    ...new Set(
      trace.iterations.flatMap((iteration) =>
        iteration.ledger.findings
          .filter((finding) => findingRefs.includes(finding.key))
          .map((finding) => finding.type),
      ),
    ),
  ];
  const criterionKinds = [
    ...new Set(
      criterionRefs.flatMap((ref) => {
        const judged = criteria.get(ref);
        return judged === undefined ? [] : [judged.kind];
      }),
    ),
  ];
  // The dimensions this item's own evidence earns under the source policy. The
  // digest's answer is honoured when the evidence earns it — a validator already
  // held it to that — and otherwise the derivation wins, because what a search
  // filters on must be a fact about the evidence and not a model's word for it.
  const earned = [
    ...findingTypes.map((type) => dimensions.findingTypes[type]),
    ...criterionKinds.map((kind) => dimensions.criterionKinds[kind]),
  ].filter((dimension): dimension is string => typeof dimension === 'string');
  return {
    ...(item.polarity === null ? {} : { polarity: item.polarity }),
    dimension: earned.includes(item.dimension) ? item.dimension : (earned[0] ?? null),
    topics: item.topics,
    criterionKinds,
    findingTypes,
    transition,
    grounding: groundingOf(transition, held),
  };
}

/** The ref an item is addressed by within its source run, which fixes its point id. */
const itemRef = (position: number): string => `knowledge.${position}`;

/** The ref a finding chunk is addressed by: its position in the judged iteration's ledger. */
const findingRef = (position: number): string => `finding.${position + 1}`;

/**
 * One chunk per endorsed item. The dimension on the facet is the one the
 * evidence earns under the source policy, not the one the digest wrote: the
 * model's answer was checked by a validator, and what the store indexes is the
 * derivation.
 */
export function itemChunks(
  items: readonly KnowledgeToStore[],
  origin: ChunkOrigin,
  trace: RunTrace,
  dimensions: DimensionMap,
  digestRunId: string,
  model: string,
): IndexedChunk[] {
  const criteria = judgedCriteria(trace);
  return items.map((item) => {
    const text = cap(`${item.insight} — applies when ${item.appliesWhen}`, TEXT_MAX);
    return {
      text,
      keys: {
        condition: cap(item.appliesWhen, KEY_MAX),
        lesson: cap(item.insight, KEY_MAX),
      },
      contentHash: contentHash(text),
      source: {
        ...origin.source,
        kind: item.kind,
        ref: itemRef(item.position),
      } satisfies ChunkSource,
      evidence: item.evidence,
      digestRunId,
      lineage: origin.lineage,
      model,
      facets: itemFacets(item, trace, dimensions, criteria),
    };
  });
}

/** The judged iteration of a trace, or the last one that ran. */
const judgedIteration = (trace: RunTrace): IterationTrace | undefined =>
  trace.iterations.find((iteration) => iteration.iteration === trace.bestIteration) ??
  trace.iterations[trace.iterations.length - 1];

/**
 * One chunk per confirmed finding of the judged iteration, written from the
 * ledger alone. The condition is what the finding weakened — a criterion is the
 * situation a defect occurs in — and falls back to the defect itself, because an
 * empty indexed text would lose the whole embedding batch.
 */
export function findingChunks(
  trace: RunTrace,
  origin: ChunkOrigin,
  dimensions: DimensionMap,
  model: string,
): IndexedChunk[] {
  const iteration = judgedIteration(trace);
  if (iteration === undefined) return [];
  const criteria = judgedCriteria(trace);
  const statementOf = new Map(
    trace.contract.criteria.map((criterion) => [criterion.id, criterion.statement]),
  );
  const annotated = annotate(iteration.ledger.findings, iteration.critics, iteration.locations);
  return iteration.ledger.findings.map((finding, position) => {
    const rationale = finding.rationale ?? annotated[position]?.rationale ?? null;
    const lesson = cap(
      `${tokenWords(finding.type)} (${finding.severity})${rationale === null ? '' : `: ${rationale}`}`,
      KEY_MAX,
    );
    const statements = finding.criterionIds.flatMap((id) => {
      const statement = statementOf.get(id);
      return statement === undefined ? [] : [statement];
    });
    const condition = statements.length > 0 ? cap(statements.join(' · '), KEY_MAX) : lesson;
    const text = cap(`${lesson} — applies when ${condition}`, TEXT_MAX);
    const transition = transitionOf(trace.lessons, [finding.key]);
    return {
      text,
      keys: { condition, lesson },
      contentHash: contentHash(text),
      source: {
        ...origin.source,
        kind: 'finding',
        ref: findingRef(position),
      } satisfies ChunkSource,
      evidence: [
        { kind: 'finding' as const, ref: finding.key },
        ...finding.criterionIds.map((ref) => ({ kind: 'criterion' as const, ref })),
      ],
      digestRunId: null,
      lineage: origin.lineage,
      model,
      facets: {
        polarity: 'avoid' as const,
        dimension: dimensions.findingTypes[finding.type] ?? null,
        topics: [],
        criterionKinds: [
          ...new Set(
            finding.criterionIds.flatMap((id) => {
              const judged = criteria.get(id);
              return judged === undefined ? [] : [judged.kind];
            }),
          ),
        ],
        findingTypes: [finding.type],
        transition,
        grounding: groundingOf(transition, false),
        severity: finding.severity,
      },
    };
  });
}
