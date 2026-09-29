import { z } from 'zod';

import { PROMPT_TITLE_MAX_LENGTH } from './prompts';

/**
 * A system-design prompt as the `design-prompt` pipeline drafts it from an
 * engineer's experience — structured so every line is a part a lens can cite,
 * then rendered to the one markdown convention the studio stores and the
 * canvas pipeline reads as its goal. One renderer, so the prompt a panel
 * approved and the prompt a candidate designs against cannot differ.
 *
 * Kinds and targets are open strings on purpose: the model chooses the words
 * and the numbers; nothing here is a closed vocabulary a grader keys on.
 */
export const designPromptDraftSchema = z.strictObject({
  title: z.string().max(PROMPT_TITLE_MAX_LENGTH).describe('Imperative, brand-neutral, one line.'),
  scenario: z
    .string()
    .max(1600)
    .describe(
      "The situation in the second person, brand-neutral, drawn from the experience's real domain.",
    ),
  functionalRequirements: z.array(z.string().max(240)).max(8),
  nonFunctionalRequirements: z
    .array(
      z.strictObject({
        kind: z
          .string()
          .max(24)
          .describe(
            'latency, availability, consistency, durability, security, cost, throughput, observability, …',
          ),
        requirement: z.string().max(160),
        target: z
          .string()
          .max(60)
          .describe('A figure with its unit or percentile, in words: "p99 ≤ 300 ms".'),
      }),
    )
    .max(8),
  scale: z
    .array(z.strictObject({ metric: z.string().max(40), target: z.string().max(40) }))
    .max(10),
  constraints: z.array(z.string().max(240)).max(6),
});
export type DesignPromptDraft = z.infer<typeof designPromptDraftSchema>;

/** The section headings of the house convention, shared by the renderer and anything that reads a prompt back. */
export const DESIGN_PROMPT_HEADINGS = {
  scenario: '## Scenario',
  functional: '## Functional requirements',
  nonFunctional: '## Non-functional requirements',
  scale: '## Scale targets',
  constraints: '## Constraints',
} as const;

const cell = (text: string): string => text.replace(/\|/g, '\\|').trim();

/**
 * The house convention: `# Title`, then the scenario, numbered functional
 * requirements, a `Kind | Requirement | Target` table, a `Metric | Target`
 * table and the constraints as bullets. Empty sections are left out.
 */
export function renderDesignPromptMarkdown(draft: DesignPromptDraft): string {
  const sections: string[] = [`# ${draft.title.trim()}`];

  if (draft.scenario.trim().length > 0) {
    sections.push(`${DESIGN_PROMPT_HEADINGS.scenario}\n\n${draft.scenario.trim()}`);
  }
  if (draft.functionalRequirements.length > 0) {
    sections.push(
      `${DESIGN_PROMPT_HEADINGS.functional}\n\n${draft.functionalRequirements
        .map((requirement, index) => `${index + 1}. ${requirement.trim()}`)
        .join('\n')}`,
    );
  }
  if (draft.nonFunctionalRequirements.length > 0) {
    sections.push(
      `${DESIGN_PROMPT_HEADINGS.nonFunctional}\n\n| Kind | Requirement | Target |\n| --- | --- | --- |\n${draft.nonFunctionalRequirements
        .map((row) => `| ${cell(row.kind)} | ${cell(row.requirement)} | ${cell(row.target)} |`)
        .join('\n')}`,
    );
  }
  if (draft.scale.length > 0) {
    sections.push(
      `${DESIGN_PROMPT_HEADINGS.scale}\n\n| Metric | Target |\n| --- | --- |\n${draft.scale
        .map((row) => `| ${cell(row.metric)} | ${cell(row.target)} |`)
        .join('\n')}`,
    );
  }
  if (draft.constraints.length > 0) {
    sections.push(
      `${DESIGN_PROMPT_HEADINGS.constraints}\n\n${draft.constraints
        .map((constraint) => `- ${constraint.trim()}`)
        .join('\n')}`,
    );
  }

  return `${sections.join('\n\n')}\n`;
}
