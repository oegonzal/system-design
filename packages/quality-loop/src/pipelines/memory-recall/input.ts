/**
 * The input codec. A memory query is any markdown, verbatim, plus the chunks
 * an orchestrator recalled for it; this file turns that into the goal the
 * engine hands every stage, and reads its own bookkeeping back. The index the
 * validators read is the last fenced JSON block, so no rule parses prose.
 */
import {
  bound,
  bounded,
  DECISIONS,
  DOCUMENT_MEMORY_KINDS,
  exact,
  keptAtMost,
  KNOWLEDGE_ITEM_KINDS,
  LESSON_CHUNK_BOUND,
  RECALL_ORIGINS,
  type RecallOrigin,
} from '@sysdesign/contracts';
import { z } from 'zod';

import {
  FENCE_CLOSE,
  FENCE_OPEN,
  GOAL_MAX_BYTES,
  goalBytes,
  readFencedIndex,
} from '../../core/contracts';

export const MEMORY_RECALL_ID = 'memory-recall';

/**
 * How many candidates the curator is offered at most, and may keep. The
 * recorded recall queries were all offered sixteen; the goal budget decides
 * how many of them fit (`withinBudget`).
 */
export const MAX_CANDIDATES = 16;
export const MAX_KEPT = 8;
/**
 * The head of the goal a recall searches with and shows the curator, in
 * bytes. The 99 recall queries recorded (2026-09-07 → 2026-10-02) searched
 * with at most 5,954 bytes of goal, and no bare goal recorded was longer; the
 * rest of the goal budget is the candidates'.
 */
export const QUERY_MAX_BYTES = 8_000;
/** A candidate or probe alias: `m12`, `p3`. */
export const ALIAS_MAX = 8;
/**
 * A condition a recall searches under, as the probe deriver is asked to write
 * it — declared here once, for the deriver's reply and for the query that
 * lists what was searched. The recorded recall queries (2026-09-07 →
 * 2026-10-02, 516 probes) held none past 240 characters and 230 at p99, under
 * a strict 240 that refused a longer one with the whole reply. As many as the
 * deriver is asked for and the search slices to: past six, a probe adds
 * candidates without adding coverage, and the goal is searched besides.
 */
export const PROBE_BOUND = bound(240);
export const MAX_PROBES = 6;
export const PROBES_BOUND = exact(MAX_PROBES);
/**
 * Defects of the answer the query is about, one per lesson the curator may
 * keep, so each kept lesson can answer a different one. A focus line is
 * searched as a probe is, so it is capped at what a probe is asked for.
 */
export const MAX_FOCUS = MAX_KEPT;
export const FOCUS_LINE_MAX = PROBE_BOUND.target;
/**
 * What the producer the pack is for already holds: the remediation notes it
 * is handed for the answer it revises, one line each, in the order it reads
 * them. A line is a note capped as a probe is, so the curator compares a
 * candidate against the gist, not the whole note. The recorded coach bases
 * handed on up to 17; a maximal query has room for as many as it lists
 * defects, so the curator sees the first of them — the screen before it
 * compared every candidate against all of them.
 */
export const MAX_KNOWN = MAX_FOCUS;
export const KNOWN_LINE_MAX = FOCUS_LINE_MAX;

/*
 * A program writes every field of the query, never a model, so every bound
 * is exact: what the orchestrator caps, slices or states, at most. Where a
 * field holds what a lenient read returned it admits the longest such a read
 * returns (`keptAtMost`), so nothing is refused or cut a second time: a probe
 * as the deriver's reply was read, and a candidate's text as the store holds
 * it — a lesson whose halves a digest's reply kept past their ceilings,
 * joined — so a lesson the store holds always fits the query that recalls it.
 */
const QUERY_BOUND = exact(QUERY_MAX_BYTES);
const RULE_BOUND = exact(300);
const RULES_BOUND = exact(8);
const FOCUS_LINE_BOUND = exact(FOCUS_LINE_MAX);
const KNOWN_LINE_BOUND = exact(KNOWN_LINE_MAX);
const QUERY_PROBE_BOUND = exact(keptAtMost(PROBE_BOUND));
const CANDIDATE_TEXT_BOUND = exact(keptAtMost(LESSON_CHUNK_BOUND));
const FOCUS_BOUND = exact(MAX_FOCUS);
const KNOWN_BOUND = exact(MAX_KNOWN);
const CANDIDATES_BOUND = exact(MAX_CANDIDATES);
const MATCHED_BOUND = exact(MAX_FOCUS + MAX_PROBES);
const SOURCE_ID_MAX_LENGTH = 80;
const SOURCE_REF_MAX_LENGTH = 200;
const SOURCE_WHEN_MAX_LENGTH = 40;

/**
 * What a stored chunk is. `lesson` is what to do next time and `section` a
 * passage of a document; `finding` and `criterion` are a run's own evidence,
 * kept in the register the engine recorded it in; the knowledge kinds are what
 * a run was found to teach. A candidate of any kind is judged the same way —
 * on its own text — so the list is open to the next kind of thing worth
 * remembering, and widening it leaves every stored point parsing.
 */
export const CHUNK_KINDS = [
  'section',
  'finding',
  'criterion',
  'lesson',
  // What a document digest writes about the person it is about: a fact a field
  // can take, a course of events kept whole for a field asking them to recount
  // one, and a bound on what they may claim. Named apart from the knowledge
  // kinds below, which are an agent's own knowledge about its own work: a
  // writer owns a run's points by kind, so a shared kind would have two writers
  // erase each other, and a probe for this person's career must not return
  // engineering knowledge.
  ...DOCUMENT_MEMORY_KINDS,
  ...KNOWLEDGE_ITEM_KINDS,
] as const;
export type ChunkKind = (typeof CHUNK_KINDS)[number];

export const chunkSourceSchema = z.strictObject({
  runId: bounded.id(SOURCE_ID_MAX_LENGTH, { min: 1 }),
  pipeline: bounded.id(SOURCE_ID_MAX_LENGTH, { min: 1 }),
  kind: z.enum(CHUNK_KINDS),
  /** The engine id the chunk carries: a location id, a finding key or a criterion id. */
  ref: bounded.id(SOURCE_REF_MAX_LENGTH, { min: 1 }),
  decision: z.enum(DECISIONS),
  iteration: z.number().int().min(1),
  when: bounded.id(SOURCE_WHEN_MAX_LENGTH, { min: 1 }),
});
export type ChunkSource = z.infer<typeof chunkSourceSchema>;

const queryShape = z.strictObject({
  /** The prompt as a producer would receive it — any markdown. */
  query: bounded.text(QUERY_BOUND, { min: 1 }),
  /** Prose rules about what may be kept; each derives an admissibility criterion. */
  rules: bounded.list(RULES_BOUND, bounded.text(RULE_BOUND, { min: 1 })),
  /**
   * What is wrong with the answer the query is about, when it was judged
   * before: its confirmed defects and the criteria it fell short on, worst
   * first. Searched under as the probes are, and cited by alias the same way.
   */
  focus: bounded.list(FOCUS_BOUND, bounded.text(FOCUS_LINE_BOUND, { min: 1 })).default([]),
  /**
   * What the producer that reads the pack already holds, when the recall was
   * asked for one that revises a judged answer: candidates that only restate
   * one of these add nothing. Empty for a recall over the goal alone.
   */
  known: bounded.list(KNOWN_BOUND, bounded.text(KNOWN_LINE_BOUND, { min: 1 })).default([]),
  /** The conditions the retriever searched under, listed once and cited by alias. */
  probes: bounded.list(PROBES_BOUND, bounded.text(QUERY_PROBE_BOUND, { min: 1 })).default([]),
  maxKept: z.number().int().min(1).max(MAX_KEPT),
  candidates: bounded.list(
    CANDIDATES_BOUND,
    z.strictObject({
      text: bounded.text(CANDIDATE_TEXT_BOUND, { min: 1 }),
      source: chunkSourceSchema,
      /**
       * Aliases of the defects and probes that surfaced this chunk. Empty
       * means it came back on the query as a whole. It says why the chunk
       * is here, never that it is useful — that is the pipeline's
       * judgement, and the retriever has no opinion worth deferring to.
       */
      matched: bounded.list(MATCHED_BOUND, bounded.id(ALIAS_MAX, { min: 1 })).default([]),
      /**
       * Where the chunk was learned relative to the answer the pack is for,
       * when the recall screened what that answer's producer already holds;
       * absent otherwise.
       */
      origin: z.enum(RECALL_ORIGINS).optional(),
    }),
    { min: 1 },
  ),
});
export type MemoryQuery = z.infer<typeof queryShape>;

const withinGoalBudget = (query: MemoryQuery): boolean =>
  goalBytes(renderGoal(query)) <= GOAL_MAX_BYTES;

/**
 * The shape plus the one invariant the caps alone cannot state: a query must
 * render under the engine's goal budget, or every stage would read a clipped
 * goal while the validators read the whole one. The caps are sized so a
 * query with every other field at its longest still fits one candidate at
 * the longest lesson the store holds, and sixteen at the length a digest is
 * asked for; an orchestrator offers candidates through `withinBudget`, and
 * one handing over more gets a refusal.
 */
export const memoryQuerySchema = queryShape.refine(withinGoalBudget, {
  message: `the query renders beyond the goal budget of ${GOAL_MAX_BYTES} bytes`,
});

/**
 * The query with as many of its candidates as fit the goal budget, in the
 * order they were ranked. Every query recorded was offered all it was
 * handed; only stored lessons kept well past what a digest was asked for can
 * leave the lowest-ranked of them out, and never the first (see
 * `memoryQuerySchema`) — they stay in the store for the next recall.
 */
export function withinBudget(query: MemoryQuery): MemoryQuery {
  const first = (count: number): MemoryQuery => ({
    ...query,
    candidates: query.candidates.slice(0, count),
  });
  let count = query.candidates.length;
  while (count > 1 && !withinGoalBudget(first(count))) count -= 1;
  return count === query.candidates.length ? query : first(count);
}

/** Rules an orchestrator can state as they are. */
export const RECALL_RULES: readonly string[] = [
  'Keep a chunk only for what its own text says; an insight the chunk does not state may not be attributed to it.',
  "Every kept chunk is cited by its alias, and its caveat names any way the chunk's context differs from the query.",
  'A chunk whose own iteration was decided reject or escalate may inform a risk, never a recommendation.',
];

/** The rule a query states only when it lists what is already in hand — there is nothing to restate otherwise. */
export const NOVELTY_RULE =
  'A chunk that only restates a defect listed under Already in hand is dropped, naming which; it is kept only when it adds a tried fix, a mechanism or a risk that list lacks, and its insight names what it adds.';

/** The rules a query states: the standing ones, and the novelty rule when something is already in hand. */
export const recallRules = (known: readonly string[]): string[] => [
  ...RECALL_RULES,
  ...(known.length > 0 ? [NOVELTY_RULE] : []),
];

const indexSchema = z.strictObject({
  pipeline: z.literal(MEMORY_RECALL_ID),
  maxKept: z.number().int().min(1),
  candidates: z.array(z.strictObject({ alias: z.string().min(1), source: chunkSourceSchema })),
});
export type MemoryIndex = z.infer<typeof indexSchema>;

/** Engine-assigned: the candidate's position, never anything the model wrote. */
export const alias = (position: number): string => `m${position + 1}`;

/** The same, for the conditions a search ran under. */
export const probeAlias = (position: number): string => `p${position + 1}`;

/** The same, for the defects a search was focused on. */
export const focusAlias = (position: number): string => `d${position + 1}`;

/** The same, for what the producer already holds. */
export const knownAlias = (position: number): string => `k${position + 1}`;

/**
 * The marker of the focus section, wherever a model is shown one — the
 * curator's query here, and the probe deriver's task; the lead says what it
 * is for.
 */
export const FOCUS_HEADING = '## What is wrong now';
const FOCUS_LEAD =
  'The query is about an answer that was judged before. These are its confirmed defects and the criteria it fell short on, worst first: a candidate that bears on one of them serves the query.';

/**
 * The marker of what the producer already holds, and what it is for: the
 * curator keeps a chunk that only restates one of these for nothing.
 */
export const KNOWN_HEADING = '## Already in hand — do not restate';
const KNOWN_LEAD =
  'The producer that reads this pack already holds these remediation notes for the answer it is about to revise. A candidate that only restates one adds nothing: keep it only for a tried fix, a mechanism, or a risk this list lacks.';

/** What a candidate's origin says, stated once above the candidates that carry one. */
const ORIGIN_LEAD =
  "A candidate's origin says how near to this answer it was learned: chain — a run this answer descends from, at an iteration past the one in hand; same-prompt — another attempt at this prompt; same-pipeline — another prompt of the same kind of work; other-pipeline — another kind of work.";

const provenance = (id: string, source: ChunkSource, origin: RecallOrigin | undefined): string =>
  `### [${id}] ${source.kind} · run ${source.runId} · ${source.pipeline} · iteration ${source.iteration} · decided ${source.decision} · ${source.when} · ref ${source.ref}${origin === undefined ? '' : ` · origin ${origin}`}`;

/** The index the validators read back: each candidate's alias and where it came from. */
const indexOf = (input: MemoryQuery): MemoryIndex => ({
  pipeline: MEMORY_RECALL_ID,
  maxKept: input.maxKept,
  candidates: input.candidates.map((candidate, position) => ({
    alias: alias(position),
    source: candidate.source,
  })),
});

export function renderGoal(input: MemoryQuery): string {
  return [
    '# Memory query',
    '',
    input.query.trim(),
    '',
    ...(input.focus.length > 0
      ? [
          FOCUS_HEADING,
          '',
          FOCUS_LEAD,
          '',
          ...input.focus.map((line, position) => `- [${focusAlias(position)}] ${line.trim()}`),
          '',
        ]
      : []),
    ...(input.known.length > 0
      ? [
          KNOWN_HEADING,
          '',
          KNOWN_LEAD,
          '',
          ...input.known.map((line, position) => `- [${knownAlias(position)}] ${line.trim()}`),
          '',
        ]
      : []),
    '## Candidates',
    '',
    ...(input.candidates.some((candidate) => candidate.origin !== undefined)
      ? [ORIGIN_LEAD, '']
      : []),
    ...input.candidates.flatMap((candidate, position) => [
      provenance(alias(position), candidate.source, candidate.origin),
      '',
      candidate.text.trim(),
      '',
      ...(candidate.matched.length > 0
        ? [`Retrieved under ${candidate.matched.join(', ')}.`, '']
        : []),
    ]),
    ...(input.probes.length > 0
      ? [
          '## Retrieved under',
          '',
          ...input.probes.map((probe, position) => `- [${probeAlias(position)}] ${probe.trim()}`),
          '',
        ]
      : []),
    '## Rules',
    '',
    ...(input.rules.length > 0 ? input.rules.map((rule) => `- ${rule}`) : ['(none)']),
    '',
    '## Limits',
    '',
    `- Keep at most ${input.maxKept} of the ${input.candidates.length} candidates.`,
    '- Give every candidate exactly one verdict, kept or dropped.',
    '- Validators check these limits; they are not criteria.',
    '',
    '## Index',
    '',
    `${FENCE_OPEN}${JSON.stringify(indexOf(input), null, 2)}${FENCE_CLOSE}`,
  ].join('\n');
}

/** The index this codec wrote, or null for a goal that is not a memory query. */
export const readIndex = (goal: string): MemoryIndex | null => readFencedIndex(goal, indexSchema);
