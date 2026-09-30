'use client';

import { BID_STAGES, DEFAULT_PIPELINE_LIMIT, type BidStage } from '@sysdesign/contracts';
import {
  Alert,
  Heading,
  LiveRegion,
  Spinner,
  Stack,
  Surface,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@sysdesign/design-system';
import { useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { useProfile } from '../../providers/profile-context';
import { PipelineSummaryTiles } from './pipeline-summary-tiles';
import { PipelineTable } from './pipeline-table';

const ALL = 'all';

/**
 * The pipeline: the counts, then the tracked notices by stage — one tab per
 * stage and one for all — paged, each row's stage editable in place. A stage
 * change is one write, then the page and the counts are read again.
 */
export function PipelineClient() {
  const { active, loading: profileLoading } = useProfile();
  const profileId = active?.id;
  const [tab, setTab] = useState<string>(ALL);
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState('');
  const stage: BidStage | undefined = tab === ALL ? undefined : (tab as BidStage);

  const summary = useResource((signal) => api.getPipelineSummary({ signal }), []);
  const page = useResource(
    (signal) =>
      profileLoading
        ? Promise.resolve(null)
        : api.listPipeline(
            { profile: profileId, stage, limit: DEFAULT_PIPELINE_LIMIT, offset },
            { signal },
          ),
    [profileId, profileLoading, stage, offset],
  );
  const [saving, setSaving] = useState<string | null>(null);
  const move = useAction(async (noticeId: string, next: BidStage) => {
    setSaving(noticeId);
    try {
      const bid = await api.saveBid(noticeId, { stage: next });
      setMessage(`Moved to ${bid.stage}.`);
      page.reload();
      summary.reload();
      return bid;
    } finally {
      setSaving(null);
    }
  });

  const select = (value: string) => {
    setTab(value);
    setOffset(0);
  };

  return (
    <Stack gap={5}>
      <Surface as="section" aria-label="Pipeline summary">
        <Stack gap={3}>
          <Heading level={1}>Pipeline</Heading>
          {summary.data ? (
            <PipelineSummaryTiles summary={summary.data} />
          ) : summary.error ? (
            <Alert tone="danger">{summary.error}</Alert>
          ) : (
            <Spinner label="Counting the pipeline" />
          )}
        </Stack>
      </Surface>
      <Surface as="section" aria-label="Tracked notices">
        <Tabs value={tab} onChange={select}>
          <TabList aria-label="Stages">
            <Tab value={ALL}>all</Tab>
            {BID_STAGES.map((candidate) => (
              <Tab key={candidate} value={candidate}>
                {candidate}
              </Tab>
            ))}
          </TabList>
          {[ALL, ...BID_STAGES].map((candidate) => (
            <TabPanel key={candidate} value={candidate}>
              {candidate !== tab ? null : page.data ? (
                <PipelineTable
                  rows={page.data.data}
                  total={page.data.meta.total}
                  limit={page.data.meta.limit}
                  offset={page.data.meta.offset}
                  nowMs={Date.now()}
                  onStageChange={(noticeId, next) => void move.run(noticeId, next)}
                  onPage={setOffset}
                  saving={saving}
                />
              ) : page.error ? (
                <Alert tone="danger">{page.error}</Alert>
              ) : (
                <Spinner label="Loading the pipeline" />
              )}
            </TabPanel>
          ))}
        </Tabs>
        {move.error && <Alert tone="danger">{move.error}</Alert>}
      </Surface>
      <LiveRegion message={message} />
    </Stack>
  );
}
