import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DESIGN_PROMPT_HEADINGS,
  designPromptDraftSchema,
  renderDesignPromptMarkdown,
  type DesignPromptDraft,
} from './design-prompt.schema';

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

describe('designPromptDraftSchema', () => {
  it('accepts a draft and converts to JSON Schema', () => {
    expect(designPromptDraftSchema.parse(draftFixture())).toEqual(draftFixture());
    expect(() => z.toJSONSchema(designPromptDraftSchema)).not.toThrow();
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
