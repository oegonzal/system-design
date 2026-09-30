import { describe, expect, it } from 'vitest';

import { criteriaFromMarkdown } from './criteria-from-markdown';

const MARKDOWN = [
  '# Serve a unified order history',
  '',
  '## Scenario',
  '',
  'You run the order-history service for a retailer.',
  '',
  '## Functional requirements',
  '',
  "1. Return a customer's past orders newest first, with line items.",
  '2. Ingest online orders as the storefront pushes them by webhook.',
  '',
  '## Non-functional requirements',
  '',
  '| Kind | Requirement | Target |',
  '| --- | --- | --- |',
  '| latency | order-history reads | p99 ≤ 300 ms |',
  '',
  '## Scale targets',
  '',
  '| Metric | Target |',
  '| --- | --- |',
  '| peak read rate | 2,000 requests/s |',
  '',
  '## Constraints',
  '',
  '- The point-of-sale system only answers polling.',
  '',
].join('\n');

describe('criteriaFromMarkdown', () => {
  it('[DEL-2] yields one criterion per bullet, numbered line or table row, kinded by section, ids c1…cN', () => {
    expect(criteriaFromMarkdown(MARKDOWN).map((c) => `${c.id}:${c.kind}`)).toEqual([
      'c1:functional',
      'c2:functional',
      'c3:non_functional',
      'c4:scale',
      'c5:constraint',
    ]);
    expect(criteriaFromMarkdown(MARKDOWN)[2].statement).toBe(
      'latency — order-history reads — p99 ≤ 300 ms',
    );
  });

  it('[DEL-2] a goal with no lists still yields one criterion of each canvas kind', () => {
    expect(criteriaFromMarkdown('# Just a title').map((c) => c.kind)).toEqual([
      'functional',
      'non_functional',
      'constraint',
    ]);
  });

  it('[DEL-2] the title line never changes the ids, so a per-test title keeps c1…c5', () => {
    const retitled = MARKDOWN.replace('# Serve a unified order history', '# Order history 42');
    expect(criteriaFromMarkdown(retitled)).toEqual(criteriaFromMarkdown(MARKDOWN));
  });
});
