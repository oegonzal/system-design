import { describe, expect, it } from 'vitest';

import { CRITIC_NAMES } from './critics';
import { criticPrompt, criticSchemaFor, systemPrompt } from './prompts';
import { packedFile, REPO_MAP, reviewContext } from './testing';

/**
 * The prompt is the whole of what a critic sees. These assert the properties
 * the prompt files themselves rely on being true.
 */
describe('criticPrompt', () => {
  it('leads with the purpose and ends with the diff', () => {
    const prompt = criticPrompt(reviewContext(), REPO_MAP);
    const at = (heading: string) => prompt.indexOf(heading);

    expect(at('# Stated purpose')).toBeGreaterThanOrEqual(0);
    expect(at('# Stated purpose')).toBeLessThan(at('# Repository conventions'));
    expect(at('# Repository conventions')).toBeLessThan(at('# Repository map'));
    expect(at('# Repository map')).toBeLessThan(at('# Change set'));
    expect(at('# Change set')).toBeLessThan(at('# Diff'));
  });

  it('gives the repository map to every critic', () => {
    const prompt = criticPrompt(reviewContext(), REPO_MAP);
    for (const _critic of CRITIC_NAMES) {
      expect(prompt).toContain('type:shared may depend only on type:shared');
    }
  });

  /**
   * Only the extracted expectations section reaches a critic — never the
   * surrounding commentary of the policy file it came from.
   */
  it('carries the conventions it was handed and nothing invented', () => {
    const prompt = criticPrompt(reviewContext(), REPO_MAP);

    expect(prompt).toContain('preserve clear ownership');
    expect(prompt).not.toContain('commentary for humans');
  });

  it('omits the purpose section entirely when there is none', () => {
    const prompt = criticPrompt(
      reviewContext({ intent: { text: '', source: 'none', commitCount: 0, truncated: false } }),
      REPO_MAP,
    );

    expect(prompt).not.toContain('# Stated purpose');
  });

  it('separates the files it showed from the ones it did not', () => {
    const prompt = criticPrompt(
      reviewContext({
        files: ['a.ts', 'b.ts'],
        allFiles: ['a.ts', 'b.ts'],
        packed: {
          diff: 'diff --git a/a.ts b/a.ts\n+shown',
          files: [packedFile('a.ts'), packedFile('b.ts', 'omitted')],
          included: ['a.ts'],
          omitted: ['b.ts'],
          budgetChars: 40,
          usedChars: 40,
          complete: false,
        },
        truncated: true,
      }),
      REPO_MAP,
    );

    expect(prompt).toContain('Not shown (1)');
    expect(prompt).toContain('do not report a missing test for a file');
    // Listed as absent, and genuinely absent.
    expect(prompt).not.toContain('a/b.ts');
  });

  it('names the shown source files that have no spec anywhere', () => {
    const prompt = criticPrompt(reviewContext(), REPO_MAP);
    expect(prompt).toContain('no colocated spec anywhere in the repository (1)');
    expect(prompt).toContain('- a.ts');
  });

  it('is deterministic', () => {
    expect(criticPrompt(reviewContext(), REPO_MAP)).toBe(criticPrompt(reviewContext(), REPO_MAP));
  });
});

describe('systemPrompt', () => {
  it('puts the project brief ahead of the role', () => {
    const prompt = systemPrompt('critics/readability.md');

    expect(prompt).toContain('# The project under review');
    expect(prompt.indexOf('# The project under review')).toBeLessThan(
      prompt.indexOf('readability and coupling critic'),
    );
  });

  it('gives the evaluator the same brief', () => {
    expect(systemPrompt('evaluator.md')).toContain('# The project under review');
  });
});

describe('criticSchemaFor', () => {
  const categoriesOf = (schema: Record<string, unknown>) =>
    (
      schema as {
        properties: { findings: { items: { properties: { category: { enum: string[] } } } } };
      }
    ).properties.findings.items.properties.category.enum;

  it('closes the category enum to the calling critic', () => {
    const schema = criticSchemaFor('architecture') as never as {
      properties: { critic: { enum: string[] } };
    };

    expect(schema.properties.critic.enum).toEqual(['architecture']);
    expect(categoriesOf(criticSchemaFor('architecture'))).toContain('duplication');
    // A testability category must be unreachable for the architecture critic.
    expect(categoriesOf(criticSchemaFor('architecture'))).not.toContain('missing-test');
  });

  it('gives each critic its own categories', () => {
    expect(categoriesOf(criticSchemaFor('readability'))).toContain('coupling');
  });

  it('offers every registered category when a purpose is available', () => {
    expect(categoriesOf(criticSchemaFor('readability', true))).toContain(
      'disproportionate-complexity',
    );
  });

  /**
   * A category whose argument is "this should not exist" has no baseline
   * without a stated purpose, so it is removed from the enum rather than
   * discouraged in prose — the API enforces what prose alone would not.
   */
  it('removes the scope category when there is no purpose to judge against', () => {
    const categories = categoriesOf(criticSchemaFor('readability', false));

    expect(categories).not.toContain('disproportionate-complexity');
    expect(categories).toContain('unnecessary-abstraction');
  });

  it('leaves critics that have no scope category untouched', () => {
    expect(categoriesOf(criticSchemaFor('architecture', false))).toEqual(
      categoriesOf(criticSchemaFor('architecture', true)),
    );
  });
});
