/**
 * The memory kinds a strategy may keep, each declared once as data: what it is
 * for (the words the design pipeline is shown), the role its records play in
 * consolidation, the candidate a register of the kind accepts, and the
 * candidate field its valid time is declared in. Everything about a kind that
 * the design, the digest and the runtime share is read from here, so a new
 * kind is one entry beside these and one behavior in the runtime — never an
 * edit to the vocabulary's readers, and never a database constraint.
 */
import { z } from 'zod';

import { bound, bounded } from '../bounds';

const ref = (max: number) => bounded.id(max, { min: 1 });
/** An instant with its offset, as every time a memory carries is written. */
export const instantSchema = z.iso.datetime({ offset: true });

const workingCandidateSchema = z.strictObject({
  key: ref(160),
  value: bounded.text(bound(2000), { min: 1 }),
});

const semanticCandidateSchema = z.strictObject({
  subject: ref(160),
  predicate: ref(80),
  value: bounded.text(bound(800), { min: 1 }),
  validFrom: instantSchema.nullable(),
});

const lessonSchema = z.strictObject({
  key: ref(160),
  text: bounded.text(bound(400), { min: 1 }),
  playbook: ref(160).nullable(),
});
export type MemoryLesson = z.infer<typeof lessonSchema>;

const episodicCandidateSchema = z.strictObject({
  subject: ref(160),
  situation: bounded.text(bound(400), { min: 1 }),
  action: bounded.text(bound(400), { min: 1 }),
  outcome: bounded.text(bound(400), { min: 1 }),
  outcomeVerified: z.boolean(),
  occurredAt: instantSchema,
  lesson: lessonSchema.nullable(),
});

const proceduralCandidateSchema = z.strictObject({
  name: ref(160),
  description: bounded.text(bound(600)).nullable(),
  rules: bounded.list(
    bound(24, 'list'),
    z.strictObject({ key: ref(160), text: bounded.text(bound(400), { min: 1 }) }),
    { min: 1 },
  ),
});

const relationalCandidateSchema = z.strictObject({
  subject: ref(160),
  relation: ref(80),
  object: ref(160),
  validFrom: instantSchema.nullable(),
});

/**
 * What a kind's records do in consolidation: episodes are the evidence,
 * semantic registers keep the lessons, procedural registers keep the
 * playbooks — the promotion the consolidation workflow kind describes.
 */
export type ConsolidationRole = 'source' | 'lesson' | 'playbook';

/**
 * One kind as data, checked against its own candidate where it is written: its
 * valid time is a field of that candidate, or null where it is the moment of
 * recording.
 */
const declareKind = <
  C extends z.ZodType<Record<string, unknown>>,
  V extends (keyof z.infer<C> & string) | null,
>(declaration: {
  readonly use: string;
  readonly role: ConsolidationRole | null;
  readonly candidate: C;
  readonly validTime: V;
}) => declaration;

/** The five memory patterns a design keeps apart; each is written, recalled and retained differently. */
export const REGISTER_KIND_DECLARATIONS = {
  working: declareKind({
    use: 'the task in flight — current objective, recent tool results, scratch reasoning state',
    role: null,
    candidate: workingCandidateSchema,
    validTime: null,
  }),
  episodic: declareKind({
    use: 'specific past events — runs, the action taken and the outcome observed, distilled into lessons',
    role: 'source',
    candidate: episodicCandidateSchema,
    validTime: 'occurredAt',
  }),
  semantic: declareKind({
    use: 'durable learned facts — preferences, decisions, verified entity facts',
    role: 'lesson',
    candidate: semanticCandidateSchema,
    validTime: 'validFrom',
  }),
  procedural: declareKind({
    use: 'how the agent does things — validated playbooks and tool recipes, versioned',
    role: 'playbook',
    candidate: proceduralCandidateSchema,
    validTime: null,
  }),
  relational: declareKind({
    use: 'entities and how they connect — contacts, accounts, contracts, and facts that change over time',
    role: null,
    candidate: relationalCandidateSchema,
    validTime: 'validFrom',
  }),
};
export type RegisterKind = keyof typeof REGISTER_KIND_DECLARATIONS;

/** Every declared kind, in declaration order — the order a model is shown them in. */
export const REGISTER_KINDS = Object.keys(REGISTER_KIND_DECLARATIONS) as [
  RegisterKind,
  ...RegisterKind[],
];

/** The candidate a register of a kind accepts — the typed memory a caller remembers. */
export type CandidateOf<K extends RegisterKind> = z.infer<
  (typeof REGISTER_KIND_DECLARATIONS)[K]['candidate']
>;
