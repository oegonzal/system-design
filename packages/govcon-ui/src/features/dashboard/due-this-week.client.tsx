'use client';

import { MAX_PIPELINE_LIMIT } from '@sysdesign/contracts';
import { Alert, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { dueItemsOf } from './due-items';
import { DueSoon } from './due-soon';

export interface DueThisWeekPanelProps {
  profileId: string | undefined;
  /** Moves after a pull, so the tracked notices are scored again. */
  version: number;
}

/**
 * What is due inside the week, read from both pipelines — the tracked
 * notices and the tracked firms and awards — as far as one page of each
 * reaches, saying so when either holds more.
 */
export function DueThisWeekPanel({ profileId, version }: DueThisWeekPanelProps) {
  const bids = useResource(
    (signal) =>
      profileId === undefined
        ? Promise.resolve(null)
        : api.listPipeline({ profile: profileId, limit: MAX_PIPELINE_LIMIT }, { signal }),
    [profileId, version],
  );
  const targets = useResource(
    (signal) => api.listTargets({ limit: MAX_PIPELINE_LIMIT }, { signal }),
    [version],
  );
  const failure = bids.error ?? targets.error;
  if (failure) return <Alert tone="danger">{failure}</Alert>;
  if (bids.data === null || targets.data === null) {
    return <Spinner label="Loading what is due" />;
  }
  const unread = [bids.data, targets.data].reduce(
    (more, page) => more + Math.max(0, page.meta.total - page.data.length),
    0,
  );
  return (
    <Stack gap={2}>
      <DueSoon items={dueItemsOf(bids.data.data, targets.data.data, Date.now())} />
      {unread > 0 ? (
        <Text tone="muted" size="sm">
          {`${unread} more tracked than one page holds; the Pipeline lists them all.`}
        </Text>
      ) : null}
    </Stack>
  );
}
