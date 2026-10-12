import type { Criterion } from './criterion';

/**
 * The shared web libraries every web client builds on (packages/web-kit,
 * packages/web-testing).
 */
export const WEB_CRITERIA: readonly Criterion[] = [
  // Shared web libraries (packages/web-kit, packages/web-testing)
  {
    id: 'WEB-1',
    statement:
      'The web apps share one HTTP request core and one status-driven polling hook; a resource is polled until its own status is terminal, backs off while unreachable, and stops only on a 404.',
  },
  {
    id: 'WEB-2',
    statement:
      'Web specs mount through the theme and stub the API at the fetch boundary through the shared harness.',
  },
];
