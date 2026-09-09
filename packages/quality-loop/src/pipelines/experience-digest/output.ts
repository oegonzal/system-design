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
import { z } from 'zod';

import type { OutputShape } from '../../core/contracts';
import { MAX_EVIDENCE, MAX_MEMORIES } from './input';

const evidence = z.string().min(1).max(8).describe('An evidence alias exactly as listed.');

export const experienceDigestSchema = z.strictObject({
  summary: z
    .string()
    .min(1)
    .max(500)
    .describe("What the record shows moved the output's quality, in 2–4 sentences."),
  memories: z
    .array(
      z.strictObject({
        evidence: z
          .array(evidence)
          .min(1)
          .max(8)
          .describe('The findings and criteria this memory rests on.'),
        insight: z
          .string()
          .min(1)
          .max(1000)
          .describe(
            'What to do or avoid next time, as an instruction a different prompt could use.',
          ),
        appliesWhen: z
          .string()
          .min(1)
          .max(500)
          .describe('The conditions under which the insight applies.'),
      }),
    )
    .max(MAX_MEMORIES),
  unused: z.array(evidence).max(MAX_EVIDENCE).describe('Every listed alias no memory rests on.'),
});
export type ExperienceDigest = z.infer<typeof experienceDigestSchema>;

const section = (title: string, lines: readonly string[]): string[] =>
  lines.length === 0 ? [] : ['', `## ${title}`, ...lines];

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
            `[memory.${index + 1}] on ${cited(memory.evidence)}: ${memory.insight} — applies when ${memory.appliesWhen}`,
        ),
      ),
      ...section('Unused', digest.unused.length > 0 ? [cited(digest.unused)] : []),
    ].join('\n'),
};
