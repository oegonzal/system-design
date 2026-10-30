/**
 * The register digest: the memories one text states, each filed under a
 * register the goal lists and resting on the sections that state it. A memory
 * carries one slot per kind a register can keep, and fills only the one of
 * its register's kind; every slot is the runtime's own candidate schema
 * (`REGISTER_KIND_DECLARATIONS`), so what the model is asked for, and measured against,
 * is the write contract every caller of the runtime is held to. The one field
 * it relaxes is each kind's valid time (its declared `validTime`): written as
 * nullable text, so a malformed time costs its memory — the candidate
 * validator withholds it — and never the whole reply.
 *
 * A location is a memory and nothing else, for the reason the document digest
 * learned: a finding is located at the memory it faults and names the
 * sections in its rationale, so a reader withholds that memory and no other,
 * and a gap is the capture evaluator's fail rather than a place to point at.
 * The render is generic over fields — no line knows a kind — and writes every
 * value as JSON, so no value can break its line or open another memory's.
 */
import {
  bound,
  bounded,
  REGISTER_KIND_DECLARATIONS,
  keptAtMost,
  quotedJson,
  REGISTER_DIGEST_MAX_EVIDENCE,
  REGISTER_DIGEST_MAX_MEMORIES,
  REGISTER_KINDS,
  REGISTER_NAME_BOUND,
  SECTION_ALIAS,
  type ArtifactLocation,
  type RegisterKind,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { OutputShape } from '../../core/contracts';

const MEMORIES_BOUND = bound(REGISTER_DIGEST_MAX_MEMORIES, 'list');
const EVIDENCE_BOUND = bound(REGISTER_DIGEST_MAX_EVIDENCE, 'list');
/** An instant with its offset runs 20 to 29 characters at millisecond precision. */
const VALID_TIME_BOUND = bound(40);

const TIME_USE =
  'When it happened, or since when it holds, as an ISO 8601 instant with its offset, e.g. 2026-03-14T09:30:00+01:00: a time a cited section states, or the time a cited section is dated where that section reports it as happening or holding then; null when no cited section dates it.';

/** A candidate's schema as the model is shown it: a closed object of the runtime's own fields. */
type CandidateSchema = z.ZodObject<Record<string, z.ZodType>, z.core.$strict>;

/** A value for every kind a register can keep, built from the kinds themselves. */
const byKind = <V>(valueOf: (kind: RegisterKind) => V): Record<RegisterKind, V> =>
  Object.fromEntries(REGISTER_KINDS.map((kind) => [kind, valueOf(kind)])) as Record<
    RegisterKind,
    V
  >;

/** The kind's candidate as the runtime declares it, its valid time — where it has one — relaxed to nullable text. */
const modelCandidate = (kind: RegisterKind): CandidateSchema => {
  const runtime: CandidateSchema = REGISTER_KIND_DECLARATIONS[kind].candidate;
  const validTime = REGISTER_KIND_DECLARATIONS[kind].validTime;
  if (validTime === null) return runtime;
  return z.strictObject({
    ...runtime.shape,
    [validTime]: bounded.text(VALID_TIME_BOUND, { description: TIME_USE }).nullable(),
  });
};

/** What the model writes for each kind: every field the runtime's own node but the valid time. */
export const MODEL_CANDIDATES: Readonly<Record<RegisterKind, CandidateSchema>> =
  byKind(modelCandidate);

const registerDigestSchema = z.strictObject({
  memories: bounded.list(
    MEMORIES_BOUND,
    z.strictObject({
      register: bounded.id(keptAtMost(REGISTER_NAME_BOUND), {
        min: 1,
        description:
          'The register the memory is filed under: its name exactly as listed under Registers, without the quotes.',
      }),
      evidence: bounded.list(
        EVIDENCE_BOUND,
        z
          .string()
          .regex(SECTION_ALIAS)
          .describe('A section alias exactly as listed, e.g. section.3.'),
        {
          min: 1,
          description: 'The sections this memory rests on; a section may back several memories.',
        },
      ),
      ...byKind((kind) =>
        MODEL_CANDIDATES[kind]
          .nullable()
          .describe(`The memory, when its register keeps ${kind} memories; null otherwise.`),
      ),
    }),
    {
      description:
        "One memory per thing the sections state that a listed register keeps, each filling only its register's kind; none when the sections state nothing a listed register keeps.",
    },
  ),
});
export type RegisterDigest = z.infer<typeof registerDigestSchema>;
export type DigestMemory = RegisterDigest['memories'][number];

/** A candidate a memory wrote, and the kind whose slot holds it. */
export interface FilledSlot {
  kind: RegisterKind;
  candidate: Record<string, unknown>;
}

/** Every kind slot a memory filled, in the order the kinds are declared. */
export const filledSlots = (memory: DigestMemory): FilledSlot[] =>
  REGISTER_KINDS.flatMap((kind) => {
    const candidate = memory[kind];
    return candidate === null ? [] : [{ kind, candidate }];
  });

/** The memory's one candidate, or null when it filled no slot or more than one. */
export const filledSlot = (memory: DigestMemory): FilledSlot | null => {
  const slots = filledSlots(memory);
  return slots.length === 1 ? slots[0] : null;
};

/** `memory.3`: where a memory is cited, by its position. */
export const memoryLocation = (position: number): string => `memory.${position + 1}`;

const cited = (aliases: readonly string[]): string =>
  aliases.map((alias) => `[${alias}]`).join(' ');

const kindsOf = (slots: readonly FilledSlot[]): string =>
  slots.length === 0 ? 'no kind' : slots.map((slot) => slot.kind).join(' + ');

/** `field: value · field: value`, every value written as JSON so none breaks its line. */
const fieldsOf = (candidate: Readonly<Record<string, unknown>>): string =>
  Object.entries(candidate)
    .map(([field, value]) => `${field}: ${JSON.stringify(value)}`)
    .join(' · ');

/** `"semantic_fact" · semantic on [section.1] — subject: "…" · …`: the register as listed, the kind, the sections, the fields. */
const memoryLine = (memory: DigestMemory): string => {
  const slots = filledSlots(memory);
  const fields = slots.map((slot) => ` — ${fieldsOf(slot.candidate)}`).join('');
  return `${quotedJson(memory.register)} · ${kindsOf(slots)} on ${cited(memory.evidence)}${fields}`;
};

const locationOf = (memory: DigestMemory, position: number): ArtifactLocation => ({
  id: memoryLocation(position),
  label: `${memory.register} · ${kindsOf(filledSlots(memory))}`,
});

export const registerDigestOutput: OutputShape<RegisterDigest> = {
  schema: registerDigestSchema,

  locate: (digest) => digest.memories.map(locationOf),

  render: (digest) =>
    digest.memories.length === 0
      ? '(no memories)'
      : digest.memories
          .map((memory, position) => `[${memoryLocation(position)}] ${memoryLine(memory)}`)
          .join('\n'),
};
