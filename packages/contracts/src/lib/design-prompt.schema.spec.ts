import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  criteriaFromDraft,
  DESIGN_PROMPT_HEADINGS,
  designPromptDraftSchema,
  renderDesignPromptMarkdown,
  type DesignPromptDraft,
} from './design-prompt.schema';
import { CRITERION_STATEMENT_MAX_LENGTH } from './quality-loop/evidence';
import { CANVAS_CRITERION_KINDS, CANVAS_MAX_CRITERIA } from './studio-pipelines';

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
  };
}

/** Every section at its bound: 8 + 6 + 6 + 4 rows, the canvas cap exactly. */
function maximalDraft(): DesignPromptDraft {
  const row = (n: number) => `requirement ${n}`;
  return {
    ...draftFixture(),
    functionalRequirements: Array.from({ length: 8 }, (_, i) => row(i)),
    nonFunctionalRequirements: Array.from({ length: 6 }, (_, i) => ({
      kind: 'latency',
      requirement: row(i),
      target: `${i} ms`,
    })),
    scale: Array.from({ length: 6 }, (_, i) => ({ metric: `metric ${i}`, target: `${i}` })),
    constraints: Array.from({ length: 4 }, (_, i) => row(i)),
  };
}

describe('designPromptDraftSchema', () => {
  it('accepts a draft and converts to JSON Schema', () => {
    expect(designPromptDraftSchema.parse(draftFixture())).toEqual(draftFixture());
    expect(() => z.toJSONSchema(designPromptDraftSchema)).not.toThrow();
  });

  it('[GEN-1] bounds the rows to the canvas cap and refuses a blank row', () => {
    expect(designPromptDraftSchema.safeParse(maximalDraft()).success).toBe(true);
    const over = (draft: DesignPromptDraft) => designPromptDraftSchema.safeParse(draft).success;
    const max = maximalDraft();
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

describe('criteriaFromDraft', () => {
  it('[GEN-1] yields one criterion per row, in render order, kinded by section, ids c1…cN', () => {
    expect(
      criteriaFromDraft(draftFixture()).map((c) => `${c.id}:${c.kind}:${c.statement}`),
    ).toEqual([
      'c1:functional:Show one order list per signed-in customer',
      'c2:functional:Merge online and in-store orders',
      'c3:non_functional:freshness — An online order appears in the list — ≤ 60 s',
      'c4:non_functional:security — A customer sees only their own orders — 0 cross-customer reads',
      'c5:scale:Peak requests — 150 req/s',
      'c6:constraint:The point-of-sale system only answers polling',
    ]);
  });

  it('[GEN-1] never exceeds the canvas cap, uses only the canvas kinds, and trims and clips a statement', () => {
    const criteria = criteriaFromDraft(maximalDraft());
    expect(criteria).toHaveLength(CANVAS_MAX_CRITERIA);
    expect(new Set(criteria.map((c) => c.kind))).toEqual(new Set(CANVAS_CRITERION_KINDS));
    expect(new Set(criteria.map((c) => c.id)).size).toBe(CANVAS_MAX_CRITERIA);

    const long = criteriaFromDraft({
      ...draftFixture(),
      functionalRequirements: [`  ${'x'.repeat(240)}  `],
    })[0];
    expect(long.statement).toBe('x'.repeat(240));
    expect(long.statement.length).toBeLessThanOrEqual(CRITERION_STATEMENT_MAX_LENGTH);
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
