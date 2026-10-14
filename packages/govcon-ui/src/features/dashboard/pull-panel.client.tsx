'use client';

import {
  DEFAULT_PULL_DAYS,
  summarizePull,
  type PullReport as PullReportDto,
  type StoredProfile,
} from '@sysdesign/contracts';
import { Alert, Heading, Spinner, Stack } from '@sysdesign/design-system';
import { useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { PullControls, type PullForm } from '../pull/pull-controls';
import { PullReport } from '../pull/pull-report';
import { sourceDisabledReason } from '../source/source-availability';
import { SourceStatus } from '../source/source-status';

export interface PullPanelProps {
  /** The active profile's id, which a pull runs for unless another is chosen. */
  profileId: string | undefined;
  profiles: readonly StoredProfile[];
  profilesLoading: boolean;
  profilesError: string | null;
  /** Said once a pull lands, with its summary, so the rest of the page reads the store again. */
  onPulled(summary: string): void;
}

/**
 * The sources and a pull by hand: the buckets and what they have left, the
 * one write on the page, and its report. The buckets are read again once a
 * pull lands, and the page is told.
 */
export function PullPanel({
  profileId,
  profiles,
  profilesLoading,
  profilesError,
  onPulled,
}: PullPanelProps) {
  const [form, setForm] = useState<PullForm>({ profileId: '', days: DEFAULT_PULL_DAYS });
  const [report, setReport] = useState<PullReportDto | null>(null);
  const source = useResource((signal) => api.getSource({ signal }), []);
  const pull = useAction(async (request: PullForm) => {
    const next = await api.startPull({ profile: request.profileId, days: request.days });
    setReport(next);
    source.reload();
    onPulled(summarizePull(next));
    return next;
  });
  const pullProfileId = form.profileId === '' ? (profileId ?? '') : form.profileId;
  return (
    <Stack gap={4}>
      {source.data ? (
        <SourceStatus status={source.data} />
      ) : source.error ? (
        <Alert tone="danger">{source.error}</Alert>
      ) : (
        <Spinner label="Loading the sources" />
      )}
      <Heading level={2}>Pull</Heading>
      {profilesLoading ? (
        <Spinner label="Loading the profiles" />
      ) : profilesError ? (
        <Alert tone="danger">{profilesError}</Alert>
      ) : (
        <PullControls
          profiles={profiles}
          value={{ ...form, profileId: pullProfileId }}
          onChange={setForm}
          onPull={() => void pull.run({ ...form, profileId: pullProfileId })}
          pulling={pull.pending}
          sourceDisabledReason={sourceDisabledReason(source.data)}
        />
      )}
      {pull.error ? <Alert tone="danger">{pull.error}</Alert> : null}
      {report ? <PullReport report={report} /> : null}
    </Stack>
  );
}
