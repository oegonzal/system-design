import { routerMock, setMockSearchParams } from '@sysdesign/web-testing';

/**
 * What a browser does when a page replaces its address: the query the page
 * last asked for becomes the one it reads. A spec calls this and renders
 * the same tree again, and the page is then looking at its new address with
 * everything else it held. Answers the address that was followed.
 */
export function followAddress(): string {
  const href = String(routerMock.replace.mock.calls.at(-1)?.[0] ?? '');
  setMockSearchParams(href.split('?')[1] ?? '');
  return href;
}
