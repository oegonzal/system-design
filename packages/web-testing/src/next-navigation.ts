/* eslint-disable @eslint-react/hooks-extra/no-unnecessary-use-prefix --
   the factory mirrors next/navigation's exported hook names verbatim */
import { vi, type Mock } from 'vitest';

/**
 * `next/navigation` mock helpers.
 *
 * Usage in a spec: `vi.mock('next/navigation', …)` with a factory that
 * dynamically imports this package's barrel and returns
 * `createNextNavigationMock()` — the dynamic import keeps `vi.mock` hoisting
 * happy, since factory code must not close over top-level imports.
 *
 * Then drive it with `setMockPathname` / `setMockParams` and assert against
 * `routerMock.push` etc.
 */

type RouterMethod = 'push' | 'replace' | 'back' | 'forward' | 'refresh' | 'prefetch';
export type RouterMock = Record<RouterMethod, Mock<(...args: unknown[]) => void>>;

export const routerMock: RouterMock = {
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

export interface NextNavigationMock {
  useRouter(): RouterMock;
  usePathname(): string;
  useParams(): Record<string, string | string[]>;
  useSearchParams(): URLSearchParams;
  notFound(): never;
  redirect(url: string): never;
  useServerInsertedHTML(): undefined;
}

export function createNextNavigationMock(): NextNavigationMock {
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
