/**
 * The experience digest: the memories a run is worth, each resting on the
 * findings and criteria that show it, and every other evidence alias under
 * `unused`.
 *
 * A location is a PLACE in the digest — the summary, each memory, each unused
 * slot — never a memory's citation. The citations used to be locations too
 * ("evidence of memory.N"), and since critic refs are enum-locked to
 * locations, every finding carried a memory plus the aliases it argued from.
 * The normaliser groups findings of one type by overlapping refs, so two
 * defects on two memories that both argued from `f5` chained into one 13-ref
 * finding, and admission — which excludes every memory a confirmed finding
 * names — dropped 7 of 8 memories. Measured over 50 digests, admission fell
 * from ~59% to ~42% of proposed memories once overlap grouping landed. With
 * places only, a finding is located at the memory it faults and names the
 * aliases in its rationale; a memory is excluded only when a finding is
 * located at it.
 */
import {
  bound,
  bounded,
  LESSON_APPLIES_WHEN_BOUND,
  LESSON_INSIGHT_BOUND,
  lessonText,
} from '@sysdesign/contracts';
import { z } from 'zod';

import { section, type OutputShape } from '../../core/contracts';
import { ALIAS_MAX, MAX_EVIDENCE, MAX_MEMORIES } from './input';

/** Above the 99th percentile the producer has measurably written (`measured.json`). */
const SUMMARY_BOUND = bound(1050);
const MEMORIES_BOUND = bound(MAX_MEMORIES, 'list');
const MEMORY_EVIDENCE_BOUND = bound(8, 'list');
const UNUSED_BOUND = bound(MAX_EVIDENCE, 'list');

const evidence = () =>
  bounded.id(ALIAS_MAX, { min: 1, description: 'An evidence alias exactly as listed.' });

export const experienceDigestSchema = z.strictObject({
  summary: bounded.text(SUMMARY_BOUND, {
    min: 1,
    description: "What the record shows moved the output's quality, in 2–4 sentences.",
  }),
  memories: bounded.list(
    MEMORIES_BOUND,
    z.strictObject({
      evidence: bounded.list(MEMORY_EVIDENCE_BOUND, evidence(), {
        min: 1,
        description: 'The findings and criteria this memory rests on.',
      }),
      insight: bounded.text(LESSON_INSIGHT_BOUND, {
        min: 1,
        description:
          'What to do or avoid next time, as an instruction a different prompt could use.',
      }),
      appliesWhen: bounded.text(LESSON_APPLIES_WHEN_BOUND, {
        min: 1,
        description: 'The conditions under which the insight applies.',
      }),
    }),
  ),
  unused: bounded.list(UNUSED_BOUND, evidence(), {
    description: 'Every listed alias no memory rests on.',
  }),
});
export type ExperienceDigest = z.infer<typeof experienceDigestSchema>;

const cited = (aliases: readonly string[]): string => aliases.map((id) => `[${id}]`).join(' ');

export const experienceDigestOutput: OutputShape<ExperienceDigest> = {
  schema: experienceDigestSchema,

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
