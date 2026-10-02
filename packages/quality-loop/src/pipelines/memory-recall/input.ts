/**
 * The input codec. A memory query is any markdown, verbatim, plus the chunks
 * an orchestrator recalled for it; this file turns that into the goal the
 * engine hands every stage, and reads its own bookkeeping back. The index the
 * validators read is the last fenced JSON block, so no rule parses prose.
 */
import { DECISIONS } from '@sysdesign/contracts';
import { z } from 'zod';

import {
  FENCE_CLOSE,
  FENCE_OPEN,
  GOAL_MAX_BYTES,
  goalBytes,
  readFencedIndex,
} from '../../core/contracts';

export const MEMORY_RECALL_ID = 'memory-recall';

/** Caps chosen so a maximal query renders well under the engine's goal budget. */
export const MAX_CANDIDATES = 16;
export const MAX_KEPT = 8;
/** A candidate or probe alias: `m12`, `p3`. */
export const ALIAS_MAX = 8;
const QUERY_MAX = 16_000;
const CHUNK_MAX = 1_200;
const RULE_MAX = 300;
const MAX_RULES = 8;
export const PROBE_MAX = 240;
const MAX_QUERY_PROBES = 6;
/**
 * Defects of the answer the query is about, one per lesson the curator may
 * keep, so each kept lesson can answer a different one. A focus line is
 * searched as a probe is, so it is bounded as one.
 */
export const MAX_FOCUS = MAX_KEPT;

export const CHUNK_KINDS = ['section', 'finding', 'criterion', 'lesson'] as const;

export const chunkSourceSchema = z.strictObject({
  runId: z.string().min(1).max(80),
  pipeline: z.string().min(1).max(80),
  kind: z.enum(CHUNK_KINDS),
  /** The engine id the chunk carries: a location id, a finding key or a criterion id. */
  ref: z.string().min(1).max(200),
  decision: z.enum(DECISIONS),
  iteration: z.number().int().min(1),
  when: z.string().min(1).max(40),
});
export type ChunkSource = z.infer<typeof chunkSourceSchema>;

const queryShape = z.strictObject({
  /** The prompt as a producer would receive it — any markdown. */
  query: z.string().min(1).max(QUERY_MAX),
  /** Prose rules about what may be kept; each derives an admissibility criterion. */
  rules: z.array(z.string().min(1).max(RULE_MAX)).max(MAX_RULES),
  /**
   * What is wrong with the answer the query is about, when it was judged
   * before: its confirmed defects and the criteria it fell short on, worst
   * first. Searched under as the probes are, and cited by alias the same way.
   */
  focus: z.array(z.string().min(1).max(PROBE_MAX)).max(MAX_FOCUS).default([]),
  /** The conditions the retriever searched under, listed once and cited by alias. */
  probes: z.array(z.string().min(1).max(PROBE_MAX)).max(MAX_QUERY_PROBES).default([]),
  maxKept: z.number().int().min(1).max(MAX_KEPT),
  candidates: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(CHUNK_MAX),
        source: chunkSourceSchema,
        /**
         * Aliases of the defects and probes that surfaced this chunk. Empty
         * means it came back on the query as a whole. It says why the chunk
         * is here, never that it is useful — that is the pipeline's
         * judgement, and the retriever has no opinion worth deferring to.
         */
        matched: z
          .array(z.string().min(1).max(ALIAS_MAX))
          .max(MAX_FOCUS + MAX_QUERY_PROBES)
          .default([]),
      }),
    )
    .min(1)
    .max(MAX_CANDIDATES),
});
export type MemoryQuery = z.infer<typeof queryShape>;

/**
 * The shape plus the one invariant the caps alone cannot state: a query must
 * render under the engine's goal budget, or every stage would read a clipped
 * goal while the validators read the whole one. The caps are sized so a
 * maximal query fits; an orchestrator handing over more gets a refusal.
 */
export const memoryQuerySchema = queryShape.refine(
  (query) => goalBytes(renderGoal(query)) <= GOAL_MAX_BYTES,
  { message: `the query renders beyond the goal budget of ${GOAL_MAX_BYTES} bytes` },
);

/** Rules an orchestrator can state as they are. */
export const RECALL_RULES: readonly string[] = [
  'Keep a chunk only for what its own text says; an insight the chunk does not state may not be attributed to it.',
  "Every kept chunk is cited by its alias, and its caveat names any way the chunk's context differs from the query.",
  'A chunk whose own iteration was decided reject or escalate may inform a risk, never a recommendation.',
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

/**
 * The marker of the focus section, wherever a model is shown one — the
 * curator's query here, and the probe deriver's task; the lead says what it
 * is for.
 */
export const FOCUS_HEADING = '## What is wrong now';
const FOCUS_LEAD =
  'The query is about an answer that was judged before. These are its confirmed defects and the criteria it fell short on, worst first: a candidate that bears on one of them serves the query.';

const provenance = (id: string, source: ChunkSource): string =>
  `### [${id}] ${source.kind} · run ${source.runId} · ${source.pipeline} · iteration ${source.iteration} · decided ${source.decision} · ${source.when} · ref ${source.ref}`;

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
    '## Candidates',
    '',
    ...input.candidates.flatMap((candidate, position) => [
      provenance(alias(position), candidate.source),
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
