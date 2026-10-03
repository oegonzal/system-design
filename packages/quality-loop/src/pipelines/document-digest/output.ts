/**
 * The document digest: the facts a chunk states about its subject, each
 * resting on the sections that state it, and every other section under
 * `unused`. The item shape — `evidence`, `insight`, `appliesWhen` — is the
 * one the memory store consumes, so a fact is stored as the digest wrote it:
 * the insight is what a form field could take, the condition is the question
 * a form would ask, and the probes a form's labels become are searched in
 * that register.
 *
 * A location is a PLACE in the digest — the summary, each memory, each
 * unused slot — never a memory's citation, for the reason the experience
 * digest learned the hard way: a finding is located at the memory it faults
 * and names the sections in its rationale, so admission excludes that memory
 * and no other.
 */
import {
  bound,
  bounded,
  DOCUMENT_MAX_MEMORIES,
  DOCUMENT_MAX_PARTS,
  LESSON_APPLIES_WHEN_BOUND,
  LESSON_INSIGHT_BOUND,
  lessonText,
  SECTION_ALIAS,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { section, type OutputShape } from '../../core/contracts';

const SUMMARY_BOUND = bound(950);
const MEMORIES_BOUND = bound(DOCUMENT_MAX_MEMORIES, 'list');
const MEMORY_EVIDENCE_BOUND = bound(4, 'list');
const UNUSED_BOUND = bound(DOCUMENT_MAX_PARTS, 'list');

const evidence = z
  .string()
  .regex(SECTION_ALIAS)
  .describe('A section alias exactly as listed, e.g. section.3.');

export const documentDigestSchema = z.strictObject({
  summary: bounded.text(SUMMARY_BOUND, {
    min: 1,
    description:
      'What the chunk states about the subject that a form could ask for, in 2–4 sentences.',
  }),
  memories: bounded.list(
    MEMORIES_BOUND,
    z.strictObject({
      evidence: bounded.list(MEMORY_EVIDENCE_BOUND, evidence, {
        min: 1,
        description: 'The sections this fact rests on; a section may back several facts.',
      }),
      insight: bounded.text(LESSON_INSIGHT_BOUND, {
        min: 1,
        description:
          'One fact about the subject, named, complete as a form field could take or compute from it: absolute dates and figures, names as the document spells them.',
      }),
      appliesWhen: bounded.text(LESSON_APPLIES_WHEN_BOUND, {
        min: 1,
        description:
          'The form situation that calls for the fact — the field or question an applicant would be asked.',
      }),
    }),
  ),
  unused: bounded.list(UNUSED_BOUND, evidence, {
    description: 'Every listed section no memory rests on.',
  }),
});
export type DocumentDigest = z.infer<typeof documentDigestSchema>;

const cited = (aliases: readonly string[]): string => aliases.map((id) => `[${id}]`).join(' ');

export const documentDigestOutput: OutputShape<DocumentDigest> = {
  schema: documentDigestSchema,

  locate: (digest) => [
    { id: 'summary', label: 'Summary' },
    ...digest.memories.map((memory, index) => ({
      id: `memory.${index + 1}`,
      label: memory.insight,
    })),
    ...digest.unused.map((id) => ({ id, label: 'unused' })),
  ],

  render: (digest) =>
    [
      `[summary] ${digest.summary}`,
      ...section(
        'Memories',
        digest.memories.map(
          (memory, index) =>
            `[memory.${index + 1}] on ${cited(memory.evidence)}: ${lessonText(memory)}`,
        ),
      ),
      ...section('Unused', digest.unused.length > 0 ? [cited(digest.unused)] : []),
    ].join('\n'),
};
