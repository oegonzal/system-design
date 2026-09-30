'use client';

import {
  DEFAULT_PULL_DAYS,
  summarizePull,
  type NoticeDto,
  type LeadsReport,
  type ListSourceCallsResponse,
  type PullReport as PullReportDto,
  type SearchProfile,
  type SourceStatus as SourceStatusData,
} from '@sysdesign/contracts';
import { Heading, LiveRegion, Spinner, Stack, Surface, Text } from '@sysdesign/design-system';
import { isAbortError, toErrorMessage, useLatestRequest } from '@sysdesign/web-kit';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../api/client';
import { LeadDetail } from '../leads/lead-detail';
import { DEFAULT_LEAD_FILTERS, LeadFiltersControls, type LeadFilters } from '../leads/lead-filters';
import { LeadTable } from '../leads/lead-table';
import { ProfileSummary } from '../profile/profile-summary';
import { PullControls, type PullForm } from '../pull/pull-controls';
import { PullReport } from '../pull/pull-report';
import { CallHistory } from '../source/call-history';
import { SourceStatus } from '../source/source-status';

const CALLS_LIMIT = 20;

/** Why the last description fetch for a notice brought no text; shown only beside that notice. */
interface DescriptionProblem {
  noticeId: string;
  message: string;
}

/**
 * The one screen: the source and its budget, a pull, the ranked store, one
 * lead in full with its description on demand, the ledger, the profile. The
 * URL remembers the open lead as `?notice=<id>`. Everything shown comes off
 * the wire contract; every request that spends the budget is a click.
 */
export function GovconWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [profiles, setProfiles] = useState<SearchProfile[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [form, setForm] = useState<PullForm>({ profileId: '', days: DEFAULT_PULL_DAYS });
  const [source, setSource] = useState<SourceStatusData | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [calls, setCalls] = useState<ListSourceCallsResponse | null>(null);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullReport, setPullReport] = useState<PullReportDto | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_LEAD_FILTERS);
  const [leads, setLeads] = useState<LeadsReport | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  // The deep link is the initial selection — read once, at first render.
  const [noticeId, setNoticeId] = useState<string | null>(() => searchParams.get('notice'));
  const [detail, setDetail] = useState<NoticeDto | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [problem, setProblem] = useState<DescriptionProblem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Bumped when the store changed (a pull, a fetched description): the reads re-run.
  const [generation, setGeneration] = useState(0);
  const leadsRequest = useLatestRequest();
  const detailRequest = useLatestRequest();

  useEffect(() => {
    const controller = new AbortController();
    api
      .listProfiles({ signal: controller.signal })
      .then((list) => {
        setProfiles(list);
        setProfilesError(null);
        setForm((current) =>
          current.profileId === '' ? { ...current, profileId: list[0]?.id ?? '' } : current,
        );
      })
      .catch((caught: unknown) => {
        if (!isAbortError(caught)) {
          setProfilesError(toErrorMessage(caught, 'Could not load the profiles.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    api
      .getSource({ signal })
      .then((next) => {
        setSource(next);
        setSourceError(null);
      })
      .catch((caught: unknown) => {
        if (!isAbortError(caught))
          setSourceError(toErrorMessage(caught, 'Could not reach govcon.'));
      });
    api
      .listCalls({ limit: CALLS_LIMIT }, { signal })
      .then((next) => {
        setCalls(next);
        setCallsError(null);
      })
      .catch((caught: unknown) => {
        if (!isAbortError(caught))
          setCallsError(toErrorMessage(caught, 'Could not load the ledger.'));
      });
    return () => controller.abort();
  }, [generation]);

  useEffect(() => {
    if (form.profileId === '') return;
    const { id, signal } = leadsRequest.begin();
    api
      .listLeads(
        {
          profile: form.profileId,
          minScore: filters.minScore,
          tier: filters.tier ?? undefined,
          limit: filters.limit,
        },
        { signal },
      )
      .then((next) => {
        if (leadsRequest.isCurrent(id)) {
          setLeads(next);
          setLeadsError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!leadsRequest.isStale(id, caught)) {
          setLeadsError(toErrorMessage(caught, 'Could not load the leads.'));
        }
      });
  }, [form.profileId, filters, generation, leadsRequest]);

  useEffect(() => {
    if (noticeId === null || form.profileId === '') return;
    const { id, signal } = detailRequest.begin();
    api
      .getNotice(noticeId, form.profileId, { signal })
      .then((next) => {
        if (detailRequest.isCurrent(id)) {
          setDetail(next);
          setDetailError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!detailRequest.isStale(id, caught)) {
          setDetailError(toErrorMessage(caught, 'Could not load the notice.'));
        }
      });
  }, [noticeId, form.profileId, generation, detailRequest]);

  useEffect(() => {
    if (noticeId !== null && searchParams.get('notice') !== noticeId) {
      router.replace(`?notice=${encodeURIComponent(noticeId)}`);
    }
  }, [noticeId, router, searchParams]);

  const onPull = async () => {
    setPulling(true);
    setPullError(null);
    try {
      const report = await api.startPull({ profile: form.profileId, days: form.days });
      setPullReport(report);
      setMessage(`Pull finished: ${summarizePull(report)}`);
      setGeneration((current) => current + 1);
    } catch (caught: unknown) {
      setPullError(toErrorMessage(caught, 'The pull failed.'));
    } finally {
      setPulling(false);
    }
  };

  const onFetchDescription = async () => {
    if (noticeId === null) return;
    setFetching(true);
    setProblem(null);
    try {
      const outcome = await api.fetchDescription(noticeId);
      if (outcome.status === 'ok') {
        setMessage('Description fetched and stored.');
        setGeneration((current) => current + 1);
      } else if (outcome.status === 'budget-exhausted') {
        setProblem({
          noticeId,
          message: `The budget is spent: ${outcome.spent} of ${outcome.budget} requests used in the last 24 h.`,
        });
      } else {
        setProblem({ noticeId, message: `Could not fetch the description: ${outcome.message}` });
      }
    } catch (caught: unknown) {
      setProblem({ noticeId, message: toErrorMessage(caught, 'Could not fetch the description.') });
    } finally {
      setFetching(false);
    }
  };

  const profile = profiles?.find((candidate) => candidate.id === form.profileId) ?? null;
  const shown = detail !== null && detail.opportunity.noticeId === noticeId ? detail : null;
  const sourceDisabledReason =
    source !== null && !source.availability.enabled
      ? source.availability.reason === 'no-key'
        ? 'SAM_GOV_API_KEY is not set (no-key)'
        : 'the source is disabled'
      : null;

  return (
    <Stack gap={6}>
      <Surface as="section" aria-label="Source">
        {source ? (
          <SourceStatus status={source} />
        ) : sourceError ? (
          <Text tone="secondary">{sourceError}</Text>
        ) : (
          <Spinner label="Loading the source status" />
        )}
      </Surface>

      <Surface as="section" aria-label="Pull">
        <Stack gap={4}>
          <Heading level={2}>Pull</Heading>
          {profiles ? (
            <PullControls
              profiles={profiles}
              value={form}
              onChange={setForm}
              onPull={() => void onPull()}
              pulling={pulling}
              sourceDisabledReason={sourceDisabledReason}
            />
          ) : profilesError ? (
            <Text tone="secondary">{profilesError}</Text>
          ) : (
            <Spinner label="Loading the profiles" />
          )}
          {pullError && <Text tone="secondary">{pullError}</Text>}
          {pullReport && <PullReport report={pullReport} />}
        </Stack>
      </Surface>

      <Surface as="section" aria-label="Leads">
        <Stack gap={4}>
          <LeadFiltersControls value={filters} onChange={setFilters} />
          {leads ? (
            <LeadTable report={leads} activeNoticeId={noticeId} onSelect={setNoticeId} />
          ) : leadsError ? (
            <Text tone="secondary">{leadsError}</Text>
          ) : (
            <Spinner label="Loading the leads" />
          )}
        </Stack>
      </Surface>

      {noticeId !== null && (
        <Surface as="section" aria-label="Lead">
          {shown ? (
            <LeadDetail
              lead={shown}
              onFetchDescription={() => void onFetchDescription()}
              fetching={fetching}
              problem={problem?.noticeId === noticeId ? problem.message : null}
            />
          ) : detailError ? (
            <Text tone="secondary">{detailError}</Text>
          ) : (
            <Spinner label="Loading the notice" />
          )}
        </Surface>
      )}

      <Surface as="section" aria-label="Calls">
        {calls ? (
          <CallHistory calls={calls.data} total={calls.meta.total} />
        ) : callsError ? (
          <Text tone="secondary">{callsError}</Text>
        ) : (
          <Spinner label="Loading the ledger" />
        )}
      </Surface>

      {profile && (
        <Surface as="section" aria-label="Profile">
          <ProfileSummary profile={profile} />
        </Surface>
      )}

      <LiveRegion message={message ?? ''} />
    </Stack>
  );
}
