'use client';

import { Heading, Stack, Tab, TabList, TabPanel, Tabs } from '@sysdesign/design-system';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { TargetsView } from '../targets/targets-view.client';
import { BidsView } from './bids-view.client';
import { PIPELINE_VIEWS, pipelineHref, pipelineViewOf, type PipelineView } from './views';

/** What each view shows. A view is one row in the table of views and one here. */
const VIEW_CONTENT: Record<PipelineView, () => ReactElement> = {
  bids: BidsView,
  targets: TargetsView,
};

/**
 * Everything the company pursues: the notices it tracks as bids, and the
 * firms and awards it tracks as targets. The view is the address, so a link
 * from an award's or a firm's page lands on the right one; only the view in
 * front is read.
 */
export function PipelineClient() {
  const router = useRouter();
  const view = pipelineViewOf(useSearchParams().get('view'));
  return (
    <Stack gap={5}>
      <Heading level={1}>Pipeline</Heading>
      <Tabs value={view} onChange={(next) => router.replace(pipelineHref(pipelineViewOf(next)))}>
        <TabList aria-label="What is tracked">
          {PIPELINE_VIEWS.map(({ id, label }) => (
            <Tab key={id} value={id}>
              {label}
            </Tab>
          ))}
        </TabList>
        {PIPELINE_VIEWS.map(({ id }) => {
          const View = VIEW_CONTENT[id];
          return (
            <TabPanel key={id} value={id}>
              {id === view ? <View /> : null}
            </TabPanel>
          );
        })}
      </Tabs>
    </Stack>
  );
}
