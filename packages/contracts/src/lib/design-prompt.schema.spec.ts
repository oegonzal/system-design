import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { keptAtMost, modelSchema } from './bounds';
import { boundsAgainstMeasured } from './measured-bounds';
import measured from './measured/design-prompt.json';
import {
  criteriaFromDraft,
  DESIGN_PROMPT_HEADINGS,
  DRAFT_SECTION_KEYS,
  DRAFT_SECTIONS,
  DESIGN_PROMPT_ROW_STATEMENT_BOUNDS,
  DESIGN_PROMPT_SCENARIO_BOUND,
  designPromptDraftSchema,
  renderDesignPromptMarkdown,
  type DesignPromptDraft,
} from './design-prompt.schema';
import { CRITERION_STATEMENT_BOUND } from './quality-loop/evidence';
import {
  CANVAS_CRITERION_KINDS,
  CANVAS_MAX_CRITERIA,
  CANVAS_STANDING_CRITERIA,
} from './studio-pipelines';

export function draftFixture(): DesignPromptDraft {
  return {
    title: 'Design an order history service',
    scenario:
      'You run the storefront of a retail brand whose online and in-store orders live in two systems.',
    functionalRequirements: [
      'Show one order list per signed-in customer',
      'Merge online and in-store orders',
    ],
    nonFunctionalRequirements: [
      { kind: 'freshness', requirement: 'An online order appears in the list', target: '≤ 60 s' },
      {
        kind: 'security',
        requirement: 'A customer sees only their own orders',
        target: '0 cross-customer reads',
      },
    ],
    scale: [{ metric: 'Peak requests', target: '150 req/s' }],
    constraints: ['The point-of-sale system only answers polling'],
    domainAndData: ['An order is owned by the history store once, whichever source it came from'],
    interfaces: ['The storefront webhook is accepted idempotently'],
    decisions: ['Own a read model, or query both sources live on each request'],
  };
}

/** Every section at its target: 6 + 4 + 4 + 4 + 2 + 2 + 2 rows, the room the standing criteria leave — or at its ceiling, a little over each. */
function maximalDraft(at: 'target' | 'ceiling' = 'target'): DesignPromptDraft {
  const row = (n: number) => `requirement ${n}`;
  const rows = { target: [6, 4, 4, 4, 2, 2, 2], ceiling: [8, 6, 6, 6, 4, 4, 4] }[at];
  const list = (count: number) => Array.from({ length: count }, (_, i) => row(i));
  return {
    ...draftFixture(),
    functionalRequirements: list(rows[0]),
    domainAndData: list(rows[1]),
    interfaces: list(rows[2]),
    nonFunctionalRequirements: Array.from({ length: rows[3] }, (_, i) => ({
      kind: 'latency',
      requirement: row(i),
      target: `${i} ms`,
    })),
    scale: Array.from({ length: rows[4] }, (_, i) => ({ metric: `metric ${i}`, target: `${i}` })),
    decisions: list(rows[5]),
    constraints: list(rows[6]),
  };
}

describe('designPromptDraftSchema', () => {
  it('accepts a draft and converts to JSON Schema', () => {
    expect(designPromptDraftSchema.parse(draftFixture())).toEqual(draftFixture());
    expect(() => z.toJSONSchema(designPromptDraftSchema)).not.toThrow();
  });

  it('[GEN-1] asks for rows that sum to the room the standing criteria leave in the canvas cap, accepts a few over, refuses past the ceiling and refuses a blank row', () => {
    expect(designPromptDraftSchema.safeParse(maximalDraft()).success).toBe(true);
    expect(designPromptDraftSchema.safeParse(maximalDraft('ceiling')).success).toBe(true);
    const { bounds } = modelSchema(designPromptDraftSchema);
    expect(DRAFT_SECTION_KEYS.reduce((sum, path) => sum + bounds[path].target, 0)).toBe(
      CANVAS_MAX_CRITERIA - CANVAS_STANDING_CRITERIA.length,
    );
    const over = (draft: DesignPromptDraft) => designPromptDraftSchema.safeParse(draft).success;
    const max = maximalDraft('ceiling');
    expect(
      over({ ...max, functionalRequirements: [...max.functionalRequirements, 'one more'] }),
    ).toBe(false);
    expect(
      over({
        ...max,
        nonFunctionalRequirements: [
          ...max.nonFunctionalRequirements,
          { kind: 'k', requirement: 'r', target: 't' },
        ],
      }),
    ).toBe(false);
    expect(over({ ...max, scale: [...max.scale, { metric: 'm', target: 't' }] })).toBe(false);
    expect(over({ ...max, constraints: [...max.constraints, 'one more'] })).toBe(false);
    expect(over({ ...draftFixture(), functionalRequirements: [''] })).toBe(false);
    expect(over({ ...draftFixture(), scale: [{ metric: '', target: '1' }] })).toBe(false);
  });
});

describe('the draft’s bounds', () => {
  it('[GEN-1] [QL-49] ask for at least what the drafting model has measurably written, and the scenario says its limit', () => {
    // `measured/design-prompt.json`: every field the drafting model wrote
    // across the recorded runs, refreshed by `pnpm measure:bounds`. A target
    // under the 99th percentile written would make most drafts overruns, and
    // a ceiling at or under the longest would keep it past the ceiling. The
    // row counts are policy: their targets sum to the canvas criteria cap, so
    // a draft is one rubric — and the drafts measured were asked for more.
    const rows = `the row targets sum to the room the standing criteria leave in the canvas cap (${CANVAS_MAX_CRITERIA})`;
    // The data, interface and decision sections arrived with the generator's
    // 2.0.0; no draft has written one yet. Their exemptions go once six live
    // generations are measured with `pnpm measure:bounds --pipeline=design-prompt`.
    const unwritten = 'added with the generator’s 2.0.0; no draft has written one yet';
    expect(measured.runs).toBeGreaterThan(0);
    expect(
      boundsAgainstMeasured(designPromptDraftSchema, measured.fields, {
        exempt: {
          functionalRequirements: rows,
          domainAndData: rows,
          'domainAndData[]': unwritten,
          interfaces: rows,
          'interfaces[]': unwritten,
          nonFunctionalRequirements: rows,
          scale: rows,
          decisions: rows,
          'decisions[]': unwritten,
          constraints: rows,
        },
      }),
    ).toEqual([]);
    expect(designPromptDraftSchema.shape.scenario.description).toContain(
      String(DESIGN_PROMPT_SCENARIO_BOUND.target),
    );
  });
});

describe('DRAFT_SECTIONS', () => {
  it('[GEN-6] declares every section of the draft once, in print order, each with a canvas kind and its own location prefix', () => {
    const sectionKeys = Object.keys(designPromptDraftSchema.shape).filter(
      (key) => key !== 'title' && key !== 'scenario',
    );
    expect([...DRAFT_SECTION_KEYS]).toEqual(sectionKeys);
    const prefixes = DRAFT_SECTION_KEYS.map((key) => DRAFT_SECTIONS[key].locationPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const key of DRAFT_SECTION_KEYS) {
      expect(CANVAS_CRITERION_KINDS).toContain(DRAFT_SECTIONS[key].kind);
      expect(DRAFT_SECTIONS[key].heading.startsWith('## ')).toBe(true);
    }
    // A quality target needs no figure; a blank one composes to nothing and is still a criterion.
    const rows = criteriaFromDraft({
      ...draftFixture(),
      nonFunctionalRequirements: [{ kind: 'security', requirement: 'Only the owner reads' }],
    });
    expect(rows.find((c) => c.kind === 'non_functional')?.statement).toBe(
      'security — Only the owner reads',
    );
  });
});

describe('criteriaFromDraft', () => {
  it('[GEN-1] [GEN-6] yields one criterion per row, in render order, kinded by the section’s declared kind, ids c1…cN', () => {
    expect(
      criteriaFromDraft(draftFixture()).map((c) => `${c.id}:${c.kind}:${c.statement}`),
    ).toEqual([
      'c1:functional:Show one order list per signed-in customer',
      'c2:functional:Merge online and in-store orders',
      'c3:domain_model:An order is owned by the history store once, whichever source it came from',
      'c4:interface:The storefront webhook is accepted idempotently',
      'c5:non_functional:freshness — An online order appears in the list — ≤ 60 s',
      'c6:non_functional:security — A customer sees only their own orders — 0 cross-customer reads',
      'c7:scale:Peak requests — 150 req/s',
      'c8:tradeoff:Own a read model, or query both sources live on each request',
      'c9:constraint:The point-of-sale system only answers polling',
      ...CANVAS_STANDING_CRITERIA.map((c, index) => `c${10 + index}:${c.kind}:${c.statement}`),
    ]);
  });

  it('[GEN-1] [EVAL-4] never exceeds the canvas cap, kinds each section and closes with the standing criteria, and trims a statement', () => {
    const criteria = criteriaFromDraft(maximalDraft());
    expect(criteria).toHaveLength(CANVAS_MAX_CRITERIA);
    expect(new Set(criteria.map((c) => c.kind))).toEqual(
      new Set([
        'functional',
        'domain_model',
        'interface',
        'non_functional',
        'scale',
        'tradeoff',
        'constraint',
      ]),
    );
    expect(criteria.slice(-CANVAS_STANDING_CRITERIA.length).map((c) => c.statement)).toEqual(
      CANVAS_STANDING_CRITERIA.map((c) => c.statement),
    );
    expect(new Set(criteria.map((c) => c.id)).size).toBe(CANVAS_MAX_CRITERIA);
    // A draft kept past the row targets yields its first rows, never more than the cap.
    expect(criteriaFromDraft(maximalDraft('ceiling'))).toHaveLength(CANVAS_MAX_CRITERIA);

    const long = criteriaFromDraft({
      ...draftFixture(),
      functionalRequirements: [`  ${'x'.repeat(240)}  `],
    })[0];
    expect(long.statement).toBe('x'.repeat(240));
  });

  it('[GEN-1] every row a draft allows becomes a criterion whole — none is cut to fit a statement', () => {
    // Composed at their ceilings, the rows still fit the statement's ceiling;
    // asked at their targets, they fit its target.
    for (const row of Object.values(DESIGN_PROMPT_ROW_STATEMENT_BOUNDS)) {
      expect(row.target).toBeLessThanOrEqual(CRITERION_STATEMENT_BOUND.target);
      expect(row.ceiling).toBeLessThanOrEqual(CRITERION_STATEMENT_BOUND.ceiling);
    }
    // The schema's own `maxLength` is each bound's ceiling: the most a row may hold.
    const { shape } = designPromptDraftSchema;
    const full = (max: number | null) => 'x'.repeat(max ?? 0);
    const nfr = shape.nonFunctionalRequirements.element.shape;
    const metric = shape.scale.element.shape;
    const draft: DesignPromptDraft = {
      ...draftFixture(),
      domainAndData: [],
      interfaces: [],
      decisions: [],
      functionalRequirements: [full(shape.functionalRequirements.element.maxLength)],
      nonFunctionalRequirements: [
        {
          kind: full(nfr.kind.maxLength),
          requirement: full(nfr.requirement.maxLength),
          target: full(nfr.target.unwrap().maxLength),
        },
      ],
      scale: [{ metric: full(metric.metric.maxLength), target: full(metric.target.maxLength) }],
      constraints: [full(shape.constraints.element.maxLength)],
    };
    expect(designPromptDraftSchema.safeParse(draft).success).toBe(true);
    expect(criteriaFromDraft(draft).map((c) => c.statement.length)).toEqual([
      DESIGN_PROMPT_ROW_STATEMENT_BOUNDS.functional.ceiling,
      DESIGN_PROMPT_ROW_STATEMENT_BOUNDS.nonFunctional.ceiling,
      DESIGN_PROMPT_ROW_STATEMENT_BOUNDS.scale.ceiling,
      DESIGN_PROMPT_ROW_STATEMENT_BOUNDS.constraint.ceiling,
      ...CANVAS_STANDING_CRITERIA.map((c) => c.statement.length),
    ]);
  });

  it('[GEN-1] each row composed from its parts at the longest a lenient read returns stays within the longest statement a rubric may carry', () => {
    // The studio reads a draft leniently, so each part may run to its
    // keptAtMost; the rubric it claims is supplied to the grader, which takes
    // a statement up to keptAtMost of the contract's statement bound.
    const { bounds } = modelSchema(designPromptDraftSchema);
    const longest = (path: string): string => {
      const declared = bounds[path];
      if (declared === undefined) throw new Error(`the draft declares no bound at ${path}`);
      return 'x'.repeat(keptAtMost(declared));
    };
    const draft: DesignPromptDraft = {
      ...draftFixture(),
      domainAndData: [],
      interfaces: [],
      decisions: [],
      functionalRequirements: [longest('functionalRequirements[]')],
      nonFunctionalRequirements: [
        {
          kind: longest('nonFunctionalRequirements[].kind'),
          requirement: longest('nonFunctionalRequirements[].requirement'),
          target: longest('nonFunctionalRequirements[].target'),
        },
      ],
      scale: [{ metric: longest('scale[].metric'), target: longest('scale[].target') }],
      constraints: [longest('constraints[]')],
    };
    const criteria = criteriaFromDraft(draft);
    expect(criteria.map((criterion) => criterion.kind)).toEqual([
      'functional',
      'non_functional',
      'scale',
      'constraint',
      ...CANVAS_STANDING_CRITERIA.map((c) => c.kind),
    ]);
    for (const { kind, statement } of criteria) {
      expect([kind, statement.length <= keptAtMost(CRITERION_STATEMENT_BOUND)]).toEqual([
        kind,
        true,
      ]);
    }
  });
});

describe('renderDesignPromptMarkdown', () => {
  it('renders the house convention with every requirement line present', () => {
    const markdown = renderDesignPromptMarkdown(draftFixture());
    expect(markdown.startsWith('# Design an order history service\n')).toBe(true);
    for (const heading of Object.values(DESIGN_PROMPT_HEADINGS)) {
      expect(markdown).toContain(`\n${heading}\n`);
    }
    expect(markdown).toContain('1. Show one order list per signed-in customer');
    expect(markdown).toContain('| freshness | An online order appears in the list | ≤ 60 s |');
    expect(markdown).toContain('| Peak requests | 150 req/s |');
    expect(markdown).toContain('- The point-of-sale system only answers polling');
  });

  it('leaves an empty section out rather than printing an empty heading', () => {
    const markdown = renderDesignPromptMarkdown({ ...draftFixture(), constraints: [], scale: [] });
    expect(markdown).not.toContain(DESIGN_PROMPT_HEADINGS.constraints);
    expect(markdown).not.toContain(DESIGN_PROMPT_HEADINGS.scale);
  });

  it('escapes a pipe inside a table cell', () => {
    const draft = draftFixture();
    draft.scale = [{ metric: 'Read|write', target: '95:5' }];
    expect(renderDesignPromptMarkdown(draft)).toContain('| Read\\|write | 95:5 |');
  });
});
