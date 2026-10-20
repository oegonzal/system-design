import { z } from 'zod';

import { bound, bounded, composedBound, type Bound } from './bounds';
import { PROMPT_TITLE_BOUND } from './prompts';
import { CRITERION_STATEMENT_BOUND, type SuccessCriterion } from './quality-loop/evidence';
import { withStandingCriteria } from './studio-pipelines';

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
 * The row targets sum to the room the standing criteria leave in the canvas
 * pipeline's cap, because a generated prompt's rubric is its rows
 * (`criteriaFromDraft`) closed by those: one criterion per row, never a
 * blank one, and never more than the grader can hold — a draft a little over
 * a row bound is kept whole, and the cap takes the first rows. And each row fits a criterion statement whole — a row is one, or
 * composes into one with its separators — so no requirement is ever cut to
 * become a criterion.
 *
 * The prose targets sit above what the drafting model has measurably written
 * (the spec holds the measurements); past a ceiling, the parse keeps the
 * prose and records it.
 */
const FUNCTIONAL_ROWS_BOUND = bound(8, 'list');
const NON_FUNCTIONAL_ROWS_BOUND = bound(6, 'list');
const SCALE_ROWS_BOUND = bound(6, 'list');
const CONSTRAINT_ROWS_BOUND = bound(4, 'list');

export const DESIGN_PROMPT_SCENARIO_BOUND = bound(2400);
const NFR_KIND_BOUND = bound(24);
const NFR_REQUIREMENT_BOUND = bound(160);
const NFR_TARGET_BOUND = bound(60);
const SCALE_METRIC_BOUND = bound(48);
const SCALE_TARGET_BOUND = bound(40);

/** How a table row composes into one criterion statement: its cells, in order, joined by this. */
const STATEMENT_SEPARATOR = ' — ';

/** The statement a row composes into — the spec holds each within `CRITERION_STATEMENT_BOUND`. */
export const DESIGN_PROMPT_ROW_STATEMENT_BOUNDS = {
  functional: CRITERION_STATEMENT_BOUND,
  nonFunctional: composedBound([
    NFR_KIND_BOUND,
    STATEMENT_SEPARATOR,
    NFR_REQUIREMENT_BOUND,
    STATEMENT_SEPARATOR,
    NFR_TARGET_BOUND,
  ]),
  scale: composedBound([SCALE_METRIC_BOUND, STATEMENT_SEPARATOR, SCALE_TARGET_BOUND]),
  constraint: CRITERION_STATEMENT_BOUND,
} as const satisfies Record<string, Bound>;

export const designPromptDraftSchema = z.strictObject({
  title: bounded.text(PROMPT_TITLE_BOUND, {
    description: 'Imperative, brand-neutral, one line.',
  }),
  scenario: bounded.text(DESIGN_PROMPT_SCENARIO_BOUND, {
    description: `The situation in the second person, brand-neutral, drawn from the experience's real domain — at most ${DESIGN_PROMPT_SCENARIO_BOUND.target} characters.`,
  }),
  functionalRequirements: bounded.list(
    FUNCTIONAL_ROWS_BOUND,
    bounded.text(CRITERION_STATEMENT_BOUND, { min: 1 }),
  ),
  nonFunctionalRequirements: bounded.list(
    NON_FUNCTIONAL_ROWS_BOUND,
    z.strictObject({
      kind: bounded.text(NFR_KIND_BOUND, {
        min: 1,
        description:
          'latency, availability, consistency, durability, security, cost, throughput, observability, …',
      }),
      requirement: bounded.text(NFR_REQUIREMENT_BOUND, { min: 1 }),
      target: bounded.text(NFR_TARGET_BOUND, {
        min: 1,
        description: 'A figure with its unit or percentile, in words: "p99 ≤ 300 ms".',
      }),
    }),
  ),
  scale: bounded.list(
    SCALE_ROWS_BOUND,
    z.strictObject({
      metric: bounded.text(SCALE_METRIC_BOUND, { min: 1 }),
      target: bounded.text(SCALE_TARGET_BOUND, { min: 1 }),
    }),
  ),
  constraints: bounded.list(
    CONSTRAINT_ROWS_BOUND,
    bounded.text(CRITERION_STATEMENT_BOUND, { min: 1 }),
  ),
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

/** A row's cells as one statement. The row bounds compose within a criterion statement; nothing is cut. */
const statement = (...cells: readonly string[]): string =>
  cells.map((cell) => cell.trim()).join(STATEMENT_SEPARATOR);

/**
 * A generated prompt's rubric is its rows: one criterion per row, in the
 * order the markdown prints the sections, kinded by the section it came from
 * — four of the kinds the canvas pipeline declares — and closed by the
 * standing criteria every canvas rubric carries. No model is asked to read
 * back what the draft already states, so the ids `c1…cN` are fixed the
 * moment the prompt is claimed, and there are never more than the grader's
 * cap: the row targets sum to the room the standing criteria leave, and a
 * draft kept past them yields its first rows.
 */
export function criteriaFromDraft(draft: DesignPromptDraft): SuccessCriterion[] {
  return withStandingCriteria([
    ...draft.functionalRequirements.map((text) => ({
      kind: 'functional',
      statement: statement(text),
    })),
    ...draft.nonFunctionalRequirements.map((row) => ({
      kind: 'non_functional',
      statement: statement(row.kind, row.requirement, row.target),
    })),
    ...draft.scale.map((row) => ({ kind: 'scale', statement: statement(row.metric, row.target) })),
    ...draft.constraints.map((text) => ({ kind: 'constraint', statement: statement(text) })),
  ]);
}
