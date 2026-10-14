'use client';

import {
  DEFAULT_PULL_DAYS,
  summarizePull,
  type PullReport as PullReportDto,
} from '@sysdesign/contracts';
import {
  Alert,
  Heading,
  LiveRegion,
  Spinner,
  Stack,
  Surface,
  Text,
} from '@sysdesign/design-system';
import { useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { useProfile } from '../../providers/profile-context';
import { AlertsPanel } from '../alerts/alerts-panel.client';
import { sourceDisabledReason } from '../source/source-availability';
import { EntityCard } from '../entities/entity-card';
import { LeadTable } from '../leads/lead-table';
import { PullControls, type PullForm } from '../pull/pull-controls';
import { PullReport } from '../pull/pull-report';
import { SourceStatus } from '../source/source-status';
import { DueSoon } from './due-soon';

const NEW_LEADS = 10;
const PIPELINE_PAGE = 50;

/**
 * The first page: the buckets, a pull, what is due this week, what the daily
 * warm raised, the ten best leads, and the company's own registration. Every read is one resource;
 * the pull is the one write, and every resource that could have changed is
 * read again once it lands.
 */
export function DashboardClient() {
  const { active, profiles, loading: profilesLoading, error: profilesError } = useProfile();
  const profileId = active?.id;
  const [form, setForm] = useState<PullForm>({ profileId: '', days: DEFAULT_PULL_DAYS });
  const [report, setReport] = useState<PullReportDto | null>(null);
  const [message, setMessage] = useState('');

  const source = useResource((signal) => api.getSource({ signal }), []);
  const leads = useResource(
    (signal) =>
      profileId === undefined
        ? Promise.resolve(null)
        : api.listLeads({ profile: profileId, limit: NEW_LEADS }, { signal }),
    [profileId],
  );
  const pipeline = useResource(
    (signal) =>
      profileId === undefined
        ? Promise.resolve(null)
        : api.listPipeline({ profile: profileId, limit: PIPELINE_PAGE }, { signal }),
    [profileId],
  );
  const own = useResource(
    (signal) =>
      profileId === undefined ? Promise.resolve(null) : api.getOwnEntity(profileId, { signal }),
    [profileId],
  );
  const pull = useAction(async (request: PullForm) => {
    const next = await api.startPull({ profile: request.profileId, days: request.days });
    setReport(next);
    setMessage(`Pull finished: ${summarizePull(next)}`);
    source.reload();
    leads.reload();
    pipeline.reload();
    return next;
  });

  const pullProfileId = form.profileId === '' ? (profileId ?? '') : form.profileId;
  const disabledReason = sourceDisabledReason(source.data);

  return (
    <Stack gap={6}>
      <Surface as="section" aria-label="Sources">
        {source.data ? (
          <SourceStatus status={source.data} />
        ) : source.error ? (
          <Alert tone="danger">{source.error}</Alert>
        ) : (
          <Spinner label="Loading the sources" />
        )}
      </Surface>

      <Surface as="section" aria-label="Pull">
        <Stack gap={4}>
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
              sourceDisabledReason={disabledReason}
            />
          )}
          {pull.error ? <Alert tone="danger">{pull.error}</Alert> : null}
          {report ? <PullReport report={report} /> : null}
        </Stack>
      </Surface>

      <Surface as="section" aria-label="Due this week">
        {pipeline.data ? (
          <DueSoon rows={pipeline.data.data} nowMs={Date.now()} />
        ) : pipeline.error ? (
          <Alert tone="danger">{pipeline.error}</Alert>
        ) : (
          <Spinner label="Loading the pipeline" />
        )}
      </Surface>

      <Surface as="section" aria-label="Alerts">
        <AlertsPanel />
      </Surface>

      <Surface as="section" aria-label="New leads">
        {leads.data ? (
          <LeadTable report={leads.data} heading="Best leads" />
        ) : leads.error ? (
          <Alert tone="danger">{leads.error}</Alert>
        ) : (
          <Spinner label="Loading the leads" />
        )}
      </Surface>

      <Surface as="section" aria-label="Registration">
        {own.loading ? (
          <Spinner label="Loading the registration" />
        ) : own.error ? (
          <Alert tone="danger">{own.error}</Alert>
        ) : own.data ? (
          <EntityCard entity={own.data} headingLevel={2} />
        ) : (
          <Stack gap={2}>
            <Heading level={2}>Registration</Heading>
            <Text tone="secondary" size="sm">
              {active?.entityUei
                ? `Not looked up yet — Intel › Entities can look up ${active.entityUei} for one request.`
                : 'Set the company UEI on the profile (Settings) to watch its SAM.gov registration here.'}
            </Text>
          </Stack>
        )}
      </Surface>

      <LiveRegion message={message} />
    </Stack>
  );
}
