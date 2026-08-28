/* eslint-disable @eslint-react/hooks-extra/no-unnecessary-use-prefix --
   the factory mirrors next/navigation's exported hook names verbatim */
import { vi } from 'vitest';

/**
 * `next/navigation` mock helpers.
 *
 * Usage in a spec (the dynamic import keeps `vi.mock` hoisting happy —
 * factory code must not close over top-level imports):
 *
 *     vi.mock('next/navigation', async () =>
 *       (await import('../testing/next-navigation')).createNextNavigationMock(),
 *     );
 *
 * Then drive it with `setMockPathname` / `setMockParams` and assert against
 * `routerMock.push` etc.
 */

export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

let pathname = '/';
let params: Record<string, string | string[]> = {};

export function setMockPathname(next: string): void {
  pathname = next;
}

export function setMockParams(next: Record<string, string | string[]>): void {
  params = next;
}

export function resetNavigationMock(): void {
  pathname = '/';
  params = {};
  for (const fn of Object.values(routerMock)) fn.mockReset();
}

export function createNextNavigationMock() {
  return {
    useRouter: () => routerMock,
    usePathname: () => pathname,
    useParams: () => params,
    useSearchParams: () => new URLSearchParams(),
    notFound: (): never => {
      throw new Error('notFound()');
    },
    redirect: (url: string): never => {
      throw new Error(`redirect(${url})`);
    },
    useServerInsertedHTML: () => undefined,
  };
}
