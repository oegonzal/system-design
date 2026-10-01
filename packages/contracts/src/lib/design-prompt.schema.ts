import { z } from 'zod';

import { PROMPT_TITLE_MAX_LENGTH } from './prompts';
import { CRITERION_STATEMENT_MAX_LENGTH, type SuccessCriterion } from './quality-loop/evidence';
import { CANVAS_CRITERION_KINDS, CANVAS_MAX_CRITERIA } from './studio-pipelines';

/**
 * A system-design prompt as the `design-prompt` pipeline drafts it from an
 * engineer's experience — structured so every line is a part a lens can cite,
 * then rendered to the one markdown convention the studio stores and the
 * canvas pipeline reads as its goal. One renderer, so the prompt a panel
 * approved and the prompt a candidate designs against cannot differ.
 *
 * Kinds and targets are open strings on purpose: the model chooses the words
 * and the numbers; nothing here is a closed vocabulary a grader keys on.
 *
 * The row bounds sum to the canvas pipeline's criteria cap, because a
 * generated prompt's rubric is its rows (`criteriaFromDraft`): one criterion
 * per row, never more than the grader can hold, never a blank one.
 */
const FUNCTIONAL_MAX_ROWS = 8;
const NON_FUNCTIONAL_MAX_ROWS = 6;
const SCALE_MAX_ROWS = 6;
const CONSTRAINT_MAX_ROWS = 4;

export const designPromptDraftSchema = z.strictObject({
  title: z.string().max(PROMPT_TITLE_MAX_LENGTH).describe('Imperative, brand-neutral, one line.'),
  scenario: z
    .string()
    .max(1600)
    .describe(
      "The situation in the second person, brand-neutral, drawn from the experience's real domain.",
    ),
  functionalRequirements: z.array(z.string().min(1).max(240)).max(FUNCTIONAL_MAX_ROWS),
  nonFunctionalRequirements: z
    .array(
      z.strictObject({
        kind: z
          .string()
          .min(1)
          .max(24)
          .describe(
            'latency, availability, consistency, durability, security, cost, throughput, observability, …',
          ),
        requirement: z.string().min(1).max(160),
        target: z
          .string()
          .min(1)
          .max(60)
          .describe('A figure with its unit or percentile, in words: "p99 ≤ 300 ms".'),
      }),
    )
    .max(NON_FUNCTIONAL_MAX_ROWS),
  scale: z
    .array(z.strictObject({ metric: z.string().min(1).max(40), target: z.string().min(1).max(40) }))
    .max(SCALE_MAX_ROWS),
  constraints: z.array(z.string().min(1).max(240)).max(CONSTRAINT_MAX_ROWS),
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

/**
 * Text made safe for one Markdown table cell: a pipe would open a column and a
 * line break would end the row, so the one is escaped and the other folded.
 */
export const markdownCell = (text: string): string =>
  text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

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
        .map(
          (row) =>
            `| ${markdownCell(row.kind)} | ${markdownCell(row.requirement)} | ${markdownCell(row.target)} |`,
        )
        .join('\n')}`,
    );
  }
  if (draft.scale.length > 0) {
    sections.push(
      `${DESIGN_PROMPT_HEADINGS.scale}\n\n| Metric | Target |\n| --- | --- |\n${draft.scale
        .map((row) => `| ${markdownCell(row.metric)} | ${markdownCell(row.target)} |`)
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

const statement = (text: string): string => text.trim().slice(0, CRITERION_STATEMENT_MAX_LENGTH);

/**
 * A generated prompt's rubric is its rows: one criterion per row, in the
 * order the markdown prints the sections, kinded by the section it came from
 * — the same four kinds the canvas pipeline declares. No model is asked to
 * read back what the draft already states, so the ids `c1…cN` are fixed the
 * moment the prompt is claimed, and there are never more than the grader's
 * cap because the row bounds sum to it.
 */
export function criteriaFromDraft(draft: DesignPromptDraft): SuccessCriterion[] {
  const [functional, nonFunctional, scale, constraint] = CANVAS_CRITERION_KINDS;
  const statements: { kind: string; statement: string }[] = [
    ...draft.functionalRequirements.map((text) => ({
      kind: functional,
      statement: statement(text),
    })),
    ...draft.nonFunctionalRequirements.map((row) => ({
      kind: nonFunctional,
      statement: statement(`${row.kind} — ${row.requirement} — ${row.target}`),
    })),
    ...draft.scale.map((row) => ({
      kind: scale,
      statement: statement(`${row.metric} — ${row.target}`),
    })),
    ...draft.constraints.map((text) => ({ kind: constraint, statement: statement(text) })),
  ];
  return statements
    .slice(0, CANVAS_MAX_CRITERIA)
    .map((item, index) => ({ id: `c${index + 1}`, ...item }));
}
