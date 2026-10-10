'use client';

import {
  MAX_LIST_LIMIT,
  type ApiListResponse,
  type OrchestrationRunDto,
  type QualityRunSummaryDto,
} from '@sysdesign/contracts';
import { useResource } from '@sysdesign/web-kit';
import { useCallback, useMemo } from 'react';

import { api } from '../../api/client';
import {
  inStartOrder,
  narrowedHint,
  openersOf,
  type ListCount,
  type OpenerOption,
} from './model/openers';

/**
 * The inspector's two lists: the recent records, or everything one opener opened.
 *
 * The recent lists are always read — the filter's options come from them, and
 * they are what the pickers show with no filter. A filter reads both lists
 * again, narrowed by the loop itself and a whole page long: one browser
 * session opens a run per step and an orchestration per form page, so it
 * outgrows the recent window within minutes, and narrowing the recent rows
 * here would show a fragment of a session as if it were all of it.
 */

/** How many of the latest records the unfiltered lists show. */
const RECENT_LIMIT = 30;

/** A narrowed page, tagged with the opener it was read for. */
interface OwnPage<T> {
  openedBy: string;
  page: ApiListResponse<T>;
}

export interface PickerList<T> {
  /** The rows to show; null until the read that answers for the current filter lands. */
  records: readonly T[] | null;
  error: string | null;
}

export interface InspectLists {
  runs: PickerList<QualityRunSummaryDto>;
  orchestrations: PickerList<OrchestrationRunDto>;
  /** The openers the filter offers. */
  openers: readonly OpenerOption[];
  /** What the narrowed lists hold; null with no filter, or until both are read. */
  hint: string | null;
  /** Read every list again — a new record may exist. */
  reload(): void;
}

/** Nothing to read with no filter; otherwise one page of what the opener opened. */
async function readOwn<T>(
  openedBy: string | null,
  list: (query: { openedBy: string; limit: number }) => Promise<ApiListResponse<T>>,
): Promise<OwnPage<T> | null> {
  if (openedBy === null) return null;
  return { openedBy, page: await list({ openedBy, limit: MAX_LIST_LIMIT }) };
}

/**
 * The narrowed page, only when it was read for the opener named now: a read
 * keeps its last answer while the next is in flight, and one session's rows
 * must never stand in for another's.
 */
const pageFor = <T>(own: OwnPage<T> | null, openedBy: string | null): ApiListResponse<T> | null =>
  own !== null && own.openedBy === openedBy ? own.page : null;

const countOf = (page: ApiListResponse<unknown>): ListCount => ({
  shown: page.data.length,
  total: page.meta.total,
});

export function useInspectLists(openedBy: string | null): InspectLists {
  const recentRuns = useResource((signal) => api.listRuns({ limit: RECENT_LIMIT }, { signal }), []);
  const recentOrchestrations = useResource(
    (signal) => api.listOrchestrations({ limit: RECENT_LIMIT }, { signal }),
    [],
  );
  const ownRuns = useResource(
    (signal) => readOwn(openedBy, (query) => api.listRuns(query, { signal })),
    [openedBy],
  );
  const ownOrchestrations = useResource(
    (signal) => readOwn(openedBy, (query) => api.listOrchestrations(query, { signal })),
    [openedBy],
  );

  const runsPage = pageFor(ownRuns.data, openedBy);
  const orchestrationsPage = pageFor(ownOrchestrations.data, openedBy);

  const openers = useMemo(
    () =>
      openersOf(
        [
          ...(recentRuns.data?.data ?? []),
          ...(recentOrchestrations.data?.data ?? []),
          ...(runsPage?.data ?? []),
          ...(orchestrationsPage?.data ?? []),
        ],
        openedBy,
      ),
    [recentRuns.data, recentOrchestrations.data, runsPage, orchestrationsPage, openedBy],
  );

  const reloadRecentRuns = recentRuns.reload;
  const reloadRecentOrchestrations = recentOrchestrations.reload;
  const reloadOwnRuns = ownRuns.reload;
  const reloadOwnOrchestrations = ownOrchestrations.reload;
  const reload = useCallback(() => {
    reloadRecentRuns();
    reloadRecentOrchestrations();
    reloadOwnRuns();
    reloadOwnOrchestrations();
  }, [reloadRecentRuns, reloadRecentOrchestrations, reloadOwnRuns, reloadOwnOrchestrations]);

  return {
    runs:
      openedBy === null
        ? { records: recentRuns.data?.data ?? null, error: recentRuns.error }
        : { records: runsPage && inStartOrder(runsPage.data), error: ownRuns.error },
    orchestrations:
      openedBy === null
        ? { records: recentOrchestrations.data?.data ?? null, error: recentOrchestrations.error }
        : {
            records: orchestrationsPage && inStartOrder(orchestrationsPage.data),
            error: ownOrchestrations.error,
          },
    openers,
    hint:
      runsPage === null || orchestrationsPage === null
        ? null
        : narrowedHint(countOf(runsPage), countOf(orchestrationsPage)),
    reload,
  };
}
