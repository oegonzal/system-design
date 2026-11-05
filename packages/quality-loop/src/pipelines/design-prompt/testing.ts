/**
 * Builders the design-prompt specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig. The experience is
 * rendered the way the studio renders one: role and employer, summary, stack,
 * highlights. The employer is there so a leak has something to leak.
 */
import type { DesignPromptDraft } from '@sysdesign/contracts';

export const EMPLOYER = 'Northwind Retail';

export const sampleExperienceGoal = (): string =>
  [
    `# Senior backend engineer at ${EMPLOYER}`,
    '',
    '## Summary',
    'Owned the order-history service for a retailer selling online and in 400 stores.',
    '',
    '## Stack',
    'TypeScript, a Node service framework, Postgres, a managed queue, a webhook-driven storefront platform, a polled point-of-sale API.',
    '',
    '## Highlights',
    '- Merged online orders pushed by webhook with in-store orders imported from a POS API that only supports polling.',
    '- Served 2,000 requests per second at peak with p99 under 300 ms from a customer-sharded read model.',
    '- Survived a storefront outage that redelivered eight hours of webhooks out of order, with an idempotent indexer.',
  ].join('\n');

export const sampleDraft = (overrides: Partial<DesignPromptDraft> = {}): DesignPromptDraft => ({
  title: 'Serve a unified order history',
  scenario:
    'You run the order-history service for a retailer that sells online and in 400 stores. Online orders arrive as webhooks from the storefront platform; in-store orders live in a point-of-sale system that only answers polling. Shoppers expect one list, newest first, even while the storefront redelivers a night of webhooks out of order.',
  functionalRequirements: [
    "Return a customer's past orders newest first, with line items.",
    'Ingest online orders as the storefront pushes them by webhook.',
    'Import in-store orders from the point-of-sale system.',
  ],
  domainAndData: [
    'An order is owned by the history store once, whichever source it came from, keyed by its source id and channel.',
  ],
  interfaces: [
    'The storefront webhook is accepted idempotently: a redelivered order is stored once.',
  ],
  requestPaths: [
    'A shopper’s history read enters at the front door and is answered from the customer-sharded read model, every hop synchronous with a stated timeout, touching neither source system.',
    'A storefront webhook is acknowledged once queued and reaches the read model through one idempotent indexer, every hop asynchronous and a redelivery tolerated.',
  ],
  nonFunctionalRequirements: [
    { kind: 'latency', requirement: 'Order-history reads', target: 'p99 ≤ 300 ms' },
    {
      kind: 'durability',
      requirement: 'No accepted order is lost or duplicated',
      target: 'zero loss across an eight-hour redelivery',
    },
    { kind: 'security', requirement: 'A shopper reads only their own orders' },
  ],
  scale: [
    { metric: 'Peak read rate', target: '2,000 requests/s' },
    { metric: 'Stores', target: '400' },
  ],
  decisions: [
    'Own a read model fed by both sources, or query the storefront and the POS live on each request.',
  ],
  constraints: [
    'The point-of-sale system only answers polling; it is never called on a customer request.',
  ],
  ...overrides,
});

/** The sample with the employer named in a second constraint — the leak the fidelity critic exists to catch. */
export const leakedDraft = (): DesignPromptDraft =>
  sampleDraft({
    constraints: [...sampleDraft().constraints, `Reuse the ${EMPLOYER} webhook relay as it is.`],
  });
