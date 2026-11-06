import { z } from 'zod';

import { bound, bounded, composedBound, type Bound } from './bounds';
import type { PlatformId } from './platforms/service';
import { PROMPT_TITLE_BOUND } from './prompts';
import { CRITERION_STATEMENT_BOUND, type SuccessCriterion } from './quality-loop/evidence';
import { withStandingCriteria, type CanvasCriterionKind } from './studio-pipelines';

/**
 * A system-design prompt as the `design-prompt` pipeline drafts it from an
 * engineer's experience — structured so every line is a part a lens can cite,
 * then rendered to the one markdown convention the studio stores and the
 * canvas pipeline reads as its goal. One renderer, so the prompt a panel
 * approved and the prompt a candidate designs against cannot differ.
 *
 * The sections are one declared table (`DRAFT_SECTIONS`): the renderer, the
 * rubric mapper and the pipeline's own render and locations iterate it, and
 * each section names the criterion kind its rows become. Kinds and targets
 * inside a row are open strings on purpose: the model chooses the words and
 * the numbers; nothing here is a closed vocabulary a grader keys on.
 *
 * The row targets sum to the room every standing criterion a rubric can carry
 * leaves in the canvas pipeline's cap, because a generated prompt's rubric is
 * its rows (`criteriaFromDraft`) closed by those: one criterion per row, never a
 * blank one, and never more than the grader can hold — a draft a little over
 * a row bound is kept whole, and the cap takes the first rows. And each row
 * fits a criterion statement whole — a row is one, or composes into one with
 * its separators — so no requirement is ever cut to become a criterion.
 *
 * The prose targets sit above what the drafting model has measurably written
 * (the spec holds the measurements); past a ceiling, the parse keeps the
 * prose and records it.
 */
const FUNCTIONAL_ROWS_BOUND = bound(6, 'list');
const DOMAIN_ROWS_BOUND = bound(4, 'list');
const INTERFACE_ROWS_BOUND = bound(4, 'list');
const REQUEST_PATH_ROWS_BOUND = bound(2, 'list');
const NON_FUNCTIONAL_ROWS_BOUND = bound(4, 'list');
const SCALE_ROWS_BOUND = bound(2, 'list');
const DECISION_ROWS_BOUND = bound(2, 'list');
const CONSTRAINT_ROWS_BOUND = bound(2, 'list');

export const DESIGN_PROMPT_SCENARIO_BOUND = bound(2400);
const NFR_KIND_BOUND = bound(24);
const NFR_REQUIREMENT_BOUND = bound(250);
const NFR_TARGET_BOUND = bound(70);
const SCALE_METRIC_BOUND = bound(64);
const SCALE_TARGET_BOUND = bound(56);

/** How a table row composes into one criterion statement: its cells, in order, joined by this. */
const STATEMENT_SEPARATOR = ' — ';

/** The statement a row composes into — the spec holds each within `CRITERION_STATEMENT_BOUND`. */
export const DESIGN_PROMPT_ROW_STATEMENT_BOUNDS = {
  functional: CRITERION_STATEMENT_BOUND,
  domainAndData: CRITERION_STATEMENT_BOUND,
  interfaces: CRITERION_STATEMENT_BOUND,
  requestPaths: CRITERION_STATEMENT_BOUND,
  nonFunctional: composedBound([
    NFR_KIND_BOUND,
    STATEMENT_SEPARATOR,
    NFR_REQUIREMENT_BOUND,
    STATEMENT_SEPARATOR,
    NFR_TARGET_BOUND,
  ]),
  scale: composedBound([SCALE_METRIC_BOUND, STATEMENT_SEPARATOR, SCALE_TARGET_BOUND]),
  decisions: CRITERION_STATEMENT_BOUND,
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
    { description: 'What the system must do, each row a capability a grader can check.' },
  ),
  domainAndData: bounded.list(
    DOMAIN_ROWS_BOUND,
    bounded.text(CRITERION_STATEMENT_BOUND, { min: 1 }),
    {
      description:
        'What the data must hold: an entity and who owns it, a relationship, an invariant, a lifecycle, an access pattern the experience lived with.',
    },
  ),
  interfaces: bounded.list(
    INTERFACE_ROWS_BOUND,
    bounded.text(CRITERION_STATEMENT_BOUND, { min: 1 }),
    {
      description:
        'A contract the system must expose or honour: an operation and its idempotency, pagination or versioning, an event published, an integration that only behaves one way.',
    },
  ),
  requestPaths: bounded.list(
    REQUEST_PATH_ROWS_BOUND,
    bounded.text(CRITERION_STATEMENT_BOUND, { min: 1 }),
    {
      description:
        'A request or message the design must carry from where it enters — a client, a partner system, a schedule, or a message already inside — to where it comes to rest — who calls whom, sync or async — and what must hold on the way: a timeout, a retry, an ordering, a delivery guarantee, a failure handled. Never the mechanism the candidate should choose.',
    },
  ),
  nonFunctionalRequirements: bounded.list(
    NON_FUNCTIONAL_ROWS_BOUND,
    z.strictObject({
      kind: bounded.text(NFR_KIND_BOUND, {
        min: 1,
        description:
          'latency, availability, consistency, durability, security, privacy, cost, observability, …',
      }),
      requirement: bounded.text(NFR_REQUIREMENT_BOUND, { min: 1 }),
      target: bounded
        .text(NFR_TARGET_BOUND, {
          min: 1,
          description:
            'A figure with its unit or percentile, in words: "p99 ≤ 300 ms" — only where the experience had one; a checkable property needs none.',
        })
        .optional(),
    }),
    { description: 'Quality targets other than load, each a property a grader can check.' },
  ),
  scale: bounded.list(
    SCALE_ROWS_BOUND,
    z.strictObject({
      metric: bounded.text(SCALE_METRIC_BOUND, { min: 1 }),
      target: bounded.text(SCALE_TARGET_BOUND, { min: 1 }),
    }),
    {
      description:
        "The load the design is sized for, in the experience's own figures — only when load shaped the system; empty otherwise.",
    },
  ),
  decisions: bounded.list(
    DECISION_ROWS_BOUND,
    bounded.text(CRITERION_STATEMENT_BOUND, { min: 1 }),
    {
      description:
        'A decision the candidate must make and defend — a choice between named options whose cost the experience knows.',
    },
  ),
  constraints: bounded.list(
    CONSTRAINT_ROWS_BOUND,
    bounded.text(CRITERION_STATEMENT_BOUND, { min: 1 }),
    { description: 'Hard rules the design may not break.' },
  ),
});
export type DesignPromptDraft = z.infer<typeof designPromptDraftSchema>;

type RowOf<K extends keyof DesignPromptDraft> = DesignPromptDraft[K] extends readonly (infer R)[]
  ? R
  : never;

/** One section of a draft: its heading, the kind its rows become, how a row prints and the cells a criterion composes from. */
export interface DraftSection<K extends SectionKey = SectionKey> {
  heading: string;
  kind: CanvasCriterionKind;
  /** The positional location prefix the pipeline cites rows by: `functional.3`. */
  locationPrefix: string;
  layout: 'numbered' | 'bullets' | 'table';
  /** Table columns, for a table layout. */
  columns?: readonly string[];
  /** A row's cells, in order — one cell for a plain row; a blank cell renders empty and composes to nothing. */
  cells: (row: RowOf<K>) => string[];
}

export type SectionKey = Exclude<keyof DesignPromptDraft, 'title' | 'scenario'>;

/**
 * The sections, in the order the markdown prints them and a rubric numbers
 * them. Everything that reads or writes a draft by section — the renderer
 * below, `criteriaFromDraft`, the pipeline's render and locations, the test
 * fake's heading reader — iterates this table rather than naming a section.
 */
export const DRAFT_SECTIONS = {
  functionalRequirements: {
    heading: '## Functional requirements',
    kind: 'functional',
    locationPrefix: 'functional',
    layout: 'numbered',
    cells: (row) => [row],
  },
  domainAndData: {
    heading: '## Domain and data',
    kind: 'domain_model',
    locationPrefix: 'domain',
    layout: 'bullets',
    cells: (row) => [row],
  },
  interfaces: {
    heading: '## Interfaces',
    kind: 'interface',
    locationPrefix: 'interface',
    layout: 'bullets',
    cells: (row) => [row],
  },
  requestPaths: {
    heading: '## Request paths',
    kind: 'communication',
    locationPrefix: 'request',
    layout: 'bullets',
    cells: (row) => [row],
  },
  nonFunctionalRequirements: {
    heading: '## Non-functional requirements',
    kind: 'non_functional',
    locationPrefix: 'nfr',
    layout: 'table',
    columns: ['Kind', 'Requirement', 'Target'],
    cells: (row) => [row.kind, row.requirement, row.target ?? ''],
  },
  scale: {
    heading: '## Scale targets',
    kind: 'scale',
    locationPrefix: 'scale',
    layout: 'table',
    columns: ['Metric', 'Target'],
    cells: (row) => [row.metric, row.target],
  },
  decisions: {
    heading: '## Decisions to make',
    kind: 'tradeoff',
    locationPrefix: 'decision',
    layout: 'bullets',
    cells: (row) => [row],
  },
  constraints: {
    heading: '## Constraints',
    kind: 'constraint',
    locationPrefix: 'constraint',
    layout: 'bullets',
    cells: (row) => [row],
  },
} as const satisfies { [K in SectionKey]: DraftSection<K> };

/** The section keys in print order — the one ordering every reader of a draft shares. */
export const DRAFT_SECTION_KEYS = Object.keys(DRAFT_SECTIONS) as readonly SectionKey[];

/** The rows of one section, typed by the section. */
export const draftRows = <K extends SectionKey>(
  draft: DesignPromptDraft,
  key: K,
): readonly RowOf<K>[] => draft[key] as unknown as readonly RowOf<K>[];

/** A section's cells for one of its rows, typed by the section. */
export const sectionCells = <K extends SectionKey>(key: K, row: RowOf<K>): string[] =>
  (DRAFT_SECTIONS[key] as DraftSection<K>).cells(row);

/** The section headings of the house convention, by section — kept for readers that name one. */
export const DESIGN_PROMPT_HEADINGS = {
  scenario: '## Scenario',
  functional: DRAFT_SECTIONS.functionalRequirements.heading,
  domainAndData: DRAFT_SECTIONS.domainAndData.heading,
  interfaces: DRAFT_SECTIONS.interfaces.heading,
  requestPaths: DRAFT_SECTIONS.requestPaths.heading,
  nonFunctional: DRAFT_SECTIONS.nonFunctionalRequirements.heading,
  scale: DRAFT_SECTIONS.scale.heading,
  decisions: DRAFT_SECTIONS.decisions.heading,
  constraints: DRAFT_SECTIONS.constraints.heading,
} as const;

/**
 * Text made safe for one Markdown table cell: a pipe would open a column and a
 * line break would end the row, so the one is escaped and the other folded.
 */
export const markdownCell = (text: string): string =>
  text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** One section as markdown: its heading and its rows in the section's layout; nothing for an empty section. */
function renderSection<K extends SectionKey>(draft: DesignPromptDraft, key: K): string | null {
  const section = DRAFT_SECTIONS[key] as DraftSection<K>;
  const rows = draftRows(draft, key);
  if (rows.length === 0) return null;
  const lines: string[] = [];
  if (section.layout === 'table') {
    const columns = section.columns ?? [];
    lines.push(`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`);
    for (const row of rows) {
      lines.push(
        `| ${section
          .cells(row)
          .map((cell) => markdownCell(cell))
          .join(' | ')} |`,
      );
    }
  } else {
    rows.forEach((row, index) => {
      const marker = section.layout === 'numbered' ? `${index + 1}.` : '-';
      lines.push(`${marker} ${section.cells(row).join(STATEMENT_SEPARATOR).trim()}`);
    });
  }
  return `${section.heading}\n\n${lines.join('\n')}`;
}

/**
 * The house convention: `# Title`, then the scenario, then every section of
 * `DRAFT_SECTIONS` in order — numbered requirements, bullets, or a table with
 * the section's columns. Empty sections are left out.
 */
export function renderDesignPromptMarkdown(draft: DesignPromptDraft): string {
  const sections: string[] = [`# ${draft.title.trim()}`];
  if (draft.scenario.trim().length > 0) {
    sections.push(`${DESIGN_PROMPT_HEADINGS.scenario}\n\n${draft.scenario.trim()}`);
  }
  for (const key of DRAFT_SECTION_KEYS) {
    const rendered = renderSection(draft, key);
    if (rendered !== null) sections.push(rendered);
  }
  return `${sections.join('\n\n')}\n`;
}

/** A row's non-blank cells as one statement. The row bounds compose within a criterion statement; nothing is cut. */
const statement = (cells: readonly string[]): string =>
  cells
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .join(STATEMENT_SEPARATOR);

/**
 * A generated prompt's rubric is its rows: one criterion per row, in the
 * order the markdown prints the sections, kinded by the section it came from,
 * and closed by the standing criteria every canvas rubric carries — the
 * platform's too, when the prompt declares one. No model is asked to read
 * back what the draft already states, so the ids `c1…cN` are fixed the
 * moment the prompt is claimed, and there are never more than the grader's
 * cap: the row targets sum to the room the standing criteria leave, and a
 * draft kept past them yields its first rows.
 */
export function criteriaFromDraft(
  draft: DesignPromptDraft,
  platform: PlatformId | null,
): SuccessCriterion[] {
  return withStandingCriteria(
    DRAFT_SECTION_KEYS.flatMap((key) =>
      draftRows(draft, key).map((row) => ({
        kind: DRAFT_SECTIONS[key].kind,
        statement: statement(sectionCells(key, row)),
      })),
    ),
    platform,
  );
}
