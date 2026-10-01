import { Button } from '@sysdesign/design-system';
import type { PagedList } from '@sysdesign/web-kit';

import { RetryAlert } from './retry-alert';

export interface LoadMoreProps {
  /** The paged list under the button. */
  list: Pick<
    PagedList<unknown>,
    'items' | 'total' | 'error' | 'hasMore' | 'loadingMore' | 'loadMore'
  >;
  /** What the rows are, as a reader names them: `sessions`, `stories`. */
  noun: string;
  /** What the button says before its count. */
  label?: string;
  'data-testid'?: string;
}

/**
 * The foot of a paged list: how many of how many, and the next page on a
 * click — or, when that page failed, why, with a Retry in the button's place.
 * Nothing once every row is on screen, or before the first page is.
 */
export function LoadMore({
  list,
  noun,
  label = 'Load more',
  'data-testid': testId,
}: LoadMoreProps) {
  if (list.items === null) return null;
  if (list.error !== null) {
    return (
      <RetryAlert
        title={`Couldn't load more ${noun}`}
        message={list.error}
        onRetry={list.loadMore}
        retrying={list.loadingMore}
      />
    );
  }
  if (!list.hasMore) return null;
  return (
    <div>
      <Button
        variant="subtle"
        onClick={list.loadMore}
        disabled={list.loadingMore}
        data-testid={testId}
      >
        {list.loadingMore ? 'Loading…' : `${label} (${list.items.length} of ${list.total})`}
      </Button>
    </div>
  );
}
