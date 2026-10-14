import type { AuthorPromptRequest, GetPromptResponse } from '@sysdesign/contracts';

import { call, TICKETING_ID, type Harness } from './harness';

/** Two functional bullets, one quality row, one scale row, one constraint: `c1…c5` under the fake grader. */
export const AUTHORED_MARKDOWN = [
  '# Serve a unified order history',
  '',
  '## Scenario',
  '',
  'You run the order-history service for a retailer that sells online and in stores.',
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

export const authoredPrompt = (): AuthorPromptRequest => ({
  title: 'Serve a unified order history',
  markdown: AUTHORED_MARKDOWN,
  experienceId: TICKETING_ID,
});

/** The prompts surface as the specs drive it, read through the harness at call time. */
export const promptsApi = (h: Harness) => ({
  author: (body: unknown) =>
    call<GetPromptResponse>(`${h.url}/prompts`, { method: 'POST', body: JSON.stringify(body) }),
});
