'use client';

import {
  DEFAULT_PULL_DAYS,
  summarizePull,
  type PullReport as PullReportDto,
  type QueryFilter,
  type SavedSearch,
  type SaveSavedSearchRequest,
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
import { useAction, useDebouncedValue, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { useProfile } from '../../providers/profile-context';
import { sourceDisabledReason } from '../source/source-availability';
import {
  DEFAULT_LEAD_FILTERS,
  LeadFiltersControls,
  toLeadsQuery,
  type LeadFilters,
} from '../leads/lead-filters';
import { LeadTable } from '../leads/lead-table';
import { PullReport } from '../pull/pull-report';
import { Pager } from './pager';
import { SavedSearchList } from './saved-search-list';
import { cleanFilter, SearchFilterForm } from './search-filter-form';

const DEBOUNCE_MS = 300;

type SearchTab = 'store' | 'samgov';

/**
 * Two ways to find a notice. The **Store** tab ranks what is already stored
 * over the filters the service accepts — free, as often as you like. The
 * **SAM.gov** tab is the request side: a filter run now (one request per
 * page), saved under a name, and the profile's saved searches — which of
 * them the daily pull runs, in what order, and a run or an edit of each.
 * Every read is one resource; every write says what it spends.
 */
export function SearchClient() {
  const { active } = useProfile();
  const profileId = active?.id;
  const [tab, setTab] = useState<SearchTab>('store');

  // Store.
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_LEAD_FILTERS);
  const [offset, setOffset] = useState(0);
  const debounced = useDebouncedValue(filters, DEBOUNCE_MS);
  const leads = useResource(
    (signal) =>
      profileId === undefined
        ? Promise.resolve(null)
        : api.listLeads(toLeadsQuery(debounced, profileId, offset), { signal }),
    [profileId, debounced, offset],
  );

  // SAM.gov.
  const [filter, setFilter] = useState<QueryFilter>({});
  const [days, setDays] = useState(DEFAULT_PULL_DAYS);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const [report, setReport] = useState<PullReportDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const source = useResource((signal) => api.getSource({ signal }), []);
  const searches = useResource(
    (signal) =>
      profileId === undefined ? Promise.resolve(null) : api.listSearches(profileId, { signal }),
    [profileId],
  );

  const landed = (next: PullReportDto, what: string) => {
    setReport(next);
    setMessage(`${what}: ${summarizePull(next)}`);
    leads.reload();
    searches.reload();
  };

  const run = useAction(async () => {
    const next = await api.runFilter({ profile: profileId, filter: cleanFilter(filter), days });
    landed(next, 'Search finished');
    return next;
  });
  const save = useAction(async () => {
    if (profileId === undefined) return null;
    const body: SaveSavedSearchRequest = {
      name: name.trim(),
      filter: cleanFilter(filter),
      days,
      includedInPull: editing?.includedInPull ?? false,
      pullOrder: editing?.pullOrder ?? searches.data?.length ?? 0,
    };
    const saved = editing
      ? await api.updateSearch(editing.id, body)
      : await api.createSearch(profileId, body);
    setMessage(
      editing
        ? `Updated "${saved.name}".`
        : `Saved "${saved.name}" — turn on "In daily pull" to include it.`,
    );
    setEditing(null);
    setName('');
    searches.reload();
    return saved;
  });
  const write = useAction(async (search: SavedSearch, changes: Partial<SaveSavedSearchRequest>) => {
    setBusyId(search.id);
    try {
      const saved = await api.updateSearch(search.id, {
        name: search.name,
        filter: search.filter,
        days: search.days,
        includedInPull: search.includedInPull,
        pullOrder: search.pullOrder,
        ...changes,
      });
      searches.reload();
      return saved;
    } finally {
      setBusyId(null);
    }
  });
  const runSaved = useAction(async (search: SavedSearch) => {
    setBusyId(search.id);
    try {
      const next = await api.runSearch(search.id);
      landed(next, `"${search.name}" finished`);
      return next;
    } finally {
      setBusyId(null);
    }
  });
  const remove = useAction(async (search: SavedSearch) => {
    setBusyId(search.id);
    try {
      await api.deleteSearch(search.id);
      setMessage(`Removed "${search.name}".`);
      if (editing?.id === search.id) {
        setEditing(null);
        setName('');
      }
      searches.reload();
      return true;
    } finally {
      setBusyId(null);
    }
  });

  const edit = (search: SavedSearch) => {
    setEditing(search);
    setName(search.name);
    setFilter(search.filter);
    setDays(search.days);
  };
  const cancelEdit = () => {
    setEditing(null);
    setName('');
  };

  const disabledReason = sourceDisabledReason(source.data);
  const writeError = write.error ?? runSaved.error ?? remove.error;

  return (
    <Stack gap={5}>
      <Heading level={1}>Search</Heading>
      <Tabs value={tab} onChange={(next) => setTab(next as SearchTab)}>
        <TabList aria-label="Where to search">
          <Tab value="store">Store (free)</Tab>
          <Tab value="samgov">SAM.gov (spends requests)</Tab>
        </TabList>

        <TabPanel value="store">
          <Surface as="section" aria-label="Store">
            <Stack gap={4}>
              <Text tone="secondary" size="sm">
                Ranks what is already stored against the profile; nothing here spends a request. The
                store matches a NAICS code by family (33 finds 332710); SAM.gov&apos;s own search
                matches it exactly.
              </Text>
              <LeadFiltersControls
                value={filters}
                naicsChoices={active?.naics ?? []}
                onChange={(next) => {
                  setFilters(next);
                  setOffset(0);
                }}
              />
              {leads.data ? (
                <>
                  <LeadTable report={leads.data} />
                  <Pager
                    offset={leads.data.offset}
                    limit={leads.data.limit}
                    total={leads.data.matching}
                    onChange={setOffset}
                    disabled={leads.loading}
                  />
                </>
              ) : leads.error ? (
                <Alert tone="danger">{leads.error}</Alert>
              ) : (
                <Spinner label="Loading the leads" />
              )}
            </Stack>
          </Surface>
        </TabPanel>

        <TabPanel value="samgov">
          <Stack gap={5}>
            <Surface as="section" aria-label="Search SAM.gov">
              <Stack gap={4}>
                <SearchFilterForm
                  filter={filter}
                  onFilterChange={setFilter}
                  days={days}
                  onDaysChange={setDays}
                  editing={editing ? { id: editing.id, name: editing.name } : null}
                  name={name}
                  onNameChange={setName}
                  onRun={() => void run.run()}
                  onSave={() => void save.run()}
                  onCancelEdit={cancelEdit}
                  running={run.pending}
                  saving={save.pending}
                  sourceDisabledReason={disabledReason}
                />
                {run.error ? <Alert tone="danger">{run.error}</Alert> : null}
                {save.error ? <Alert tone="danger">{save.error}</Alert> : null}
                {report ? <PullReport report={report} /> : null}
              </Stack>
            </Surface>
            <Surface as="section" aria-label="Saved searches">
              <Stack gap={4}>
                {searches.data ? (
                  <SavedSearchList
                    searches={searches.data}
                    busyId={busyId}
                    sourceDisabled={disabledReason !== null}
                    onToggleIncluded={(search, includedInPull) =>
                      void write.run(search, { includedInPull })
                    }
                    onOrderChange={(search, pullOrder) => void write.run(search, { pullOrder })}
                    onRun={(search) => void runSaved.run(search)}
                    onEdit={edit}
                    onDelete={(search) => void remove.run(search)}
                  />
                ) : searches.error ? (
                  <Alert tone="danger">{searches.error}</Alert>
                ) : (
                  <Spinner label="Loading the saved searches" />
                )}
                {writeError ? <Alert tone="danger">{writeError}</Alert> : null}
              </Stack>
            </Surface>
          </Stack>
        </TabPanel>
      </Tabs>
      <LiveRegion message={message} />
    </Stack>
  );
}
