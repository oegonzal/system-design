'use client';

import {
  DEFAULT_AWARD_LIMIT,
  type AwardsQuery,
  type EntityLookup,
  type FetchAwardsReport,
} from '@sysdesign/contracts';
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
  Text,
} from '@sysdesign/design-system';
import { useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { useProfile } from '../../providers/profile-context';
import { EntityCard } from '../entities/entity-card';
import { useAddressView } from '../use-address-view';
import { SavedViews } from '../views/saved-views.client';
import { AwardQueryForm, type AwardFilters } from './award-query-form';
import { AwardTable } from './award-table';
import { AwardsSummaryTiles } from './awards-summary-tiles';
import { EntityLookupForm } from './entity-lookup-form';
import { EntityTable } from './entity-table';
import { FetchAwardsForm } from './fetch-awards-form';
import { INTEL_ROUTE, INTEL_TABS, intelHref, parseIntelView, type IntelTab } from './intel-link';

/** The form's filters as the API's query: empty fields drop out. */
const queryOf = (filters: AwardFilters): Omit<AwardsQuery, 'limit' | 'offset'> => ({
  naics: filters.naics || undefined,
  psc: filters.psc || undefined,
  agency: filters.agency || undefined,
  from: filters.from || undefined,
  to: filters.to || undefined,
  source: filters.source || undefined,
});

/**
 * Intel: what the government bought, from whom, against how many — and who
 * those registrants are. The list and the summary read the store and spend
 * nothing, and what they are asked for is the page's address: the side in
 * front, the filters and the page travel in the URL, so a reading can be
 * linked to and kept by name. The fetch and the lookup are the two writes,
 * each behind a click that states its cost, and each reloads what it
 * changed.
 */
export function IntelClient() {
  const { active } = useProfile();
  const profileId = active?.id;
  const { view, replace } = useAddressView(parseIntelView, intelHref);
  const { tab, filters, offset } = view;
  const [report, setReport] = useState<FetchAwardsReport | null>(null);
  const [lookup, setLookup] = useState<EntityLookup | null>(null);
  const [message, setMessage] = useState('');

  const query = queryOf(filters);
  const queryKey = JSON.stringify(query);
  const awards = useResource(
    (signal) => api.listAwards({ ...query, limit: DEFAULT_AWARD_LIMIT, offset }, { signal }),
    [queryKey, offset],
  );
  const summary = useResource((signal) => api.getAwardsSummary(query, { signal }), [queryKey]);
  const own = useResource(
    (signal) =>
      profileId === undefined ? Promise.resolve(null) : api.getOwnEntity(profileId, { signal }),
    [profileId],
  );

  const fetchAwards = useAction(async (request: Parameters<typeof api.fetchAwards>[0]) => {
    const next = await api.fetchAwards(request);
    setReport(next);
    setMessage(
      `Fetched: ${next.slices.reduce((sum, slice) => sum + slice.inserted, 0)} new award(s) stored.`,
    );
    awards.reload();
    summary.reload();
    return next;
  });
  const lookUp = useAction(async (ueis: string[]) => {
    const next = await api.lookupEntities({ ueis });
    setLookup(next);
    setMessage(`Looked up ${next.entities.length} registrant(s); ${next.unknown.length} unknown.`);
    own.reload();
    replace({ ...view, tab: 'entities' });
    return next;
  });
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const lookUpOne = async (uei: string) => {
    setLookingUp(uei);
    await lookUp.run([uei]);
    setLookingUp(null);
  };

  return (
    <Stack gap={5}>
      <Heading level={1}>Intel</Heading>
      <Tabs value={tab} onChange={(value) => replace({ ...view, tab: value as IntelTab })}>
        <TabList aria-label="Intel">
          {INTEL_TABS.map(({ id, label }) => (
            <Tab key={id} value={id}>
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanel value="awards">
          <Stack gap={5}>
            <Surface as="section" aria-label="Award filters">
              <Stack gap={3}>
                <Heading level={2}>Stored awards</Heading>
                <Text tone="secondary" size="sm">
                  Reading the store spends nothing. The NAICS filter matches families; a fetch below
                  brings more in.
                </Text>
                {profileId === undefined ? null : (
                  <SavedViews
                    profileId={profileId}
                    route={INTEL_ROUTE}
                    currentHref={intelHref(view)}
                  />
                )}
                <AwardQueryForm
                  value={filters}
                  onChange={(next) => replace({ ...view, filters: next, offset: 0 })}
                  naicsOptions={active?.naics ?? []}
                />
              </Stack>
            </Surface>
            <Surface as="section" aria-label="Award summary">
              {summary.data ? (
                <AwardsSummaryTiles
                  summary={summary.data}
                  onLookup={(uei) => void lookUpOne(uei)}
                  lookingUp={lookingUp}
                />
              ) : summary.error ? (
                <Alert tone="danger">{summary.error}</Alert>
              ) : (
                <Spinner label="Summarizing the awards" />
              )}
            </Surface>
            <Surface as="section" aria-label="Awards">
              {awards.data ? (
                <AwardTable
                  awards={awards.data.data}
                  total={awards.data.meta.total}
                  limit={awards.data.meta.limit}
                  offset={awards.data.meta.offset}
                  onPage={(next) => replace({ ...view, offset: next })}
                />
              ) : awards.error ? (
                <Alert tone="danger">{awards.error}</Alert>
              ) : (
                <Spinner label="Loading the awards" />
              )}
            </Surface>
            <Surface as="section" aria-label="Fetch awards">
              <Stack gap={3}>
                <FetchAwardsForm
                  key={active?.id ?? 'none'}
                  defaultNaics={active?.naics ?? []}
                  onFetch={(request) => void fetchAwards.run(request)}
                  pending={fetchAwards.pending}
                  report={report}
                />
                {fetchAwards.error ? <Alert tone="danger">{fetchAwards.error}</Alert> : null}
              </Stack>
            </Surface>
          </Stack>
        </TabPanel>
        <TabPanel value="entities">
          <Stack gap={5}>
            <Surface as="section" aria-label="Own registration">
              {own.loading ? (
                <Spinner label="Loading the registration" />
              ) : own.error ? (
                <Alert tone="danger">{own.error}</Alert>
              ) : own.data ? (
                <EntityCard entity={own.data} headingLevel={2} />
              ) : (
                <Stack gap={2}>
                  <Heading level={2}>Own registration</Heading>
                  <Text tone="secondary" size="sm">
                    {active?.entityUei
                      ? `Not looked up yet — look up ${active.entityUei} below.`
                      : 'Set the company UEI on the profile (Settings) to look its registration up here.'}
                  </Text>
                </Stack>
              )}
            </Surface>
            <Surface as="section" aria-label="Lookup">
              <Stack gap={4}>
                <EntityLookupForm
                  onLookup={(ueis) => void lookUp.run(ueis)}
                  pending={lookUp.pending}
                />
                {lookUp.error ? <Alert tone="danger">{lookUp.error}</Alert> : null}
                <EntityTable lookup={lookup} />
              </Stack>
            </Surface>
          </Stack>
        </TabPanel>
      </Tabs>
      <LiveRegion message={message} />
    </Stack>
  );
}
