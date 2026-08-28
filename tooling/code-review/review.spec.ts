import { describe, expect, it } from 'vitest';

import { criticPrompt, criticSchemaFor, resolveReferences, systemPrompt } from './review';
import { CRITIC_NAMES } from './critics';
import type { PackedFile, ReviewContext } from './context';
import type { RepoMap } from './repo-map';
import type { CriticReport, Finding } from './policy';

const finding = (problem: string): Finding => ({
  severity: 'high',
  file: 'a.ts',
  category: 'duplication',
  evidence: 'e',
  problem,
  recommendation: 'r',
});

const reports: CriticReport[] = [
  { critic: 'architecture', findings: [finding('real one'), finding('real two')] },
];

type Ref = { critic: 'architecture' | 'testability' | 'readability'; finding: number };

const evaluation = (blocking: Ref[], warnings: Ref[] = [], informational: Ref[] = []) => ({
  blockingFindings: blocking.map((b) => ({ ...b, reason: 'r' })),
  warnings: warnings.map((w) => ({ ...w, reason: 'r' })),
  informational: informational.map((i) => ({ ...i, reason: 'r' })),
  summary: 's',
});

/**
 * This is where "the evaluator must not introduce new findings" stops being a
 * line in a prompt and becomes a property of the code. The evaluator returns
 * indices, so anything that does not resolve to a finding it was actually given
 * is dropped here — these tests are what make that claim true rather than
 * hopeful.
 */
describe('resolveReferences', () => {
  it('keeps a reference that resolves to a real finding', () => {
    const { kept, dropped } = resolveReferences(
      evaluation([{ critic: 'architecture', finding: 0 }]),
      reports,
    );
    expect(kept.map((k) => k.problem)).toEqual(['real one']);
    expect(dropped).toEqual([]);
  });

  it('drops an index the critic never produced', () => {
    const { kept, dropped } = resolveReferences(
      evaluation([{ critic: 'architecture', finding: 9 }]),
      reports,
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('architecture#9');
  });

  it('drops a reference to a critic that did not run', () => {
    const { kept, dropped } = resolveReferences(
      evaluation([{ critic: 'readability', finding: 0 }]),
      reports,
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('readability#0');
  });

  it('counts a finding once even when cited as both blocking and a warning', () => {
    const { kept } = resolveReferences(
      evaluation(
        [{ critic: 'architecture', finding: 0 }],
        [{ critic: 'architecture', finding: 0 }],
      ),
      reports,
    );
    expect(kept).toHaveLength(1);
  });

  it('keeps informational findings — low severity is a channel, not a discard', () => {
    const { kept } = resolveReferences(
      evaluation([], [], [{ critic: 'architecture', finding: 1 }]),
      reports,
    );
    expect(kept.map((k) => k.problem)).toEqual(['real two']);
  });

  it('tolerates an evaluator that omits the informational array entirely', () => {
    // Older responses, or a model that returns only what it had to.
    const legacy = { blockingFindings: [], warnings: [], summary: 's' } as never;
    expect(() => resolveReferences(legacy, reports)).not.toThrow();
  });

  it('stamps the critic as the source of every surviving finding', () => {
    const { kept } = resolveReferences(
      evaluation([
        { critic: 'architecture', finding: 0 },
        { critic: 'architecture', finding: 1 },
      ]),
      reports,
    );
    expect(kept.map((k) => k.source)).toEqual(['architecture', 'architecture']);
  });
});

// ---------------------------------------------------------------------------

const packedFile = (file: string, status: PackedFile['status'] = 'included'): PackedFile => ({
  file,
  status,
  chars: status === 'omitted' ? 0 : 40,
  totalChars: 40,
  added: 4,
  removed: 0,
  hasColocatedSpec: false,
});

const context = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  files: ['a.ts'],
  allFiles: ['a.ts'],
  packed: {
    diff: 'diff --git a/a.ts b/a.ts\n+shown',
    files: [packedFile('a.ts')],
    included: ['a.ts'],
    omitted: [],
    budgetChars: 1_000,
    usedChars: 40,
    complete: true,
  },
  truncated: false,
  projectMetadata: '',
  conventions: '- preserve clear ownership and dependency boundaries',
  intent: { text: 'Add the settings page.', source: 'commits', commitCount: 1, truncated: false },
  warnings: [],
  ...over,
});

const map: RepoMap = {
  projects: [
    { name: 'contracts', root: 'packages/contracts', type: 'library', tags: ['type:shared'] },
  ],
  rules: ['type:shared may depend only on type:shared'],
};

/**
 * The prompt is the whole of what a critic sees. These assert the properties
 * the prompt files themselves rely on being true.
 */
describe('criticPrompt', () => {
  it('leads with the purpose and ends with the diff', () => {
    const prompt = criticPrompt(context(), map);
    const at = (heading: string) => prompt.indexOf(heading);

    expect(at('# Stated purpose')).toBeGreaterThanOrEqual(0);
    expect(at('# Stated purpose')).toBeLessThan(at('# Repository conventions'));
    expect(at('# Repository conventions')).toBeLessThan(at('# Repository map'));
    expect(at('# Repository map')).toBeLessThan(at('# Change set'));
    expect(at('# Change set')).toBeLessThan(at('# Diff'));
  });

  it('gives the repository map to every critic', () => {
    const prompt = criticPrompt(context(), map);
    for (const _critic of CRITIC_NAMES) {
      expect(prompt).toContain('type:shared may depend only on type:shared');
    }
  });

  /**
   * Only the extracted expectations section reaches a critic — never the
   * surrounding commentary of the policy file it came from.
   */
  it('carries the conventions it was handed and nothing invented', () => {
    const prompt = criticPrompt(context(), map);

    expect(prompt).toContain('preserve clear ownership');
    expect(prompt).not.toContain('commentary for humans');
  });

  it('omits the purpose section entirely when there is none', () => {
    const prompt = criticPrompt(
      context({ intent: { text: '', source: 'none', commitCount: 0, truncated: false } }),
      map,
    );

    expect(prompt).not.toContain('# Stated purpose');
  });

  it('separates the files it showed from the ones it did not', () => {
    const prompt = criticPrompt(
      context({
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
      map,
    );

    expect(prompt).toContain('Not shown (1)');
    expect(prompt).toContain('do not report a missing test for a file');
    // Listed as absent, and genuinely absent.
    expect(prompt).not.toContain('a/b.ts');
  });

  it('names the shown source files that have no spec anywhere', () => {
    const prompt = criticPrompt(context(), map);
    expect(prompt).toContain('no colocated spec anywhere in the repository (1)');
    expect(prompt).toContain('- a.ts');
  });

  it('is deterministic', () => {
    expect(criticPrompt(context(), map)).toBe(criticPrompt(context(), map));
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
