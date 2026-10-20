import type { PromptLibraryDocumentDto } from '@sysdesign/contracts';

/**
 * The quality-loop stub's prompt library: what `GET /prompts` lists and what
 * `POST /prompts/import` copies. Every document follows the house convention
 * (`# Title`, numbered functional requirements, a `Kind | Requirement |
 * Target` table, a `Metric | Target` table, constraints as bullets) so the
 * stub's rubric derivation reads one criterion per line, kinded by section.
 *
 * The second id carries a path separator on purpose: a library id is a path
 * below the loop's prompt folder, and the studio encodes each segment on its
 * own — the stub must decode them back into one id.
 */

export const ORDER_HISTORY_DOCUMENT: PromptLibraryDocumentDto = {
  id: 'order-history',
  title: 'Serve an order history',
  folder: null,
  markdown: [
    '# Serve an order history',
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
  ].join('\n'),
};

export const NOTIFICATION_FANOUT_DOCUMENT: PromptLibraryDocumentDto = {
  id: 'messaging/notification-fanout',
  title: 'Fan out notifications to followers',
  folder: 'messaging',
  markdown: [
    '# Fan out notifications to followers',
    '',
    '## Scenario',
    '',
    'You own the notification path of a social product where a post reaches every follower.',
    '',
    '## Functional requirements',
    '',
    '1. Deliver a notification to every follower of the author.',
    '2. Let a user mute an author without losing other notifications.',
    '',
    '## Non-functional requirements',
    '',
    '| Kind | Requirement | Target |',
    '| --- | --- | --- |',
    '| latency | delivery to an online follower | p95 ≤ 2 s |',
    '',
    '## Scale targets',
    '',
    '| Metric | Target |',
    '| --- | --- |',
    '| largest follower count | 5,000,000 |',
    '',
    '## Constraints',
    '',
    '- Push delivery goes through a third-party provider with a per-second quota.',
    '',
  ].join('\n'),
};

export const LIBRARY: readonly PromptLibraryDocumentDto[] = [
  ORDER_HISTORY_DOCUMENT,
  NOTIFICATION_FANOUT_DOCUMENT,
];
