'use client';

import { EARLY_NOTICE_TYPES } from '@sysdesign/contracts';
import { Heading, LiveRegion, Stack, Surface } from '@sysdesign/design-system';
import { useState } from 'react';

import { useProfile } from '../../providers/profile-context';
import { AlertsPanel } from '../alerts/alerts-panel.client';
import { DEFAULT_SEARCH_VIEW, searchHref } from '../search/search-link';
import { DueThisWeekPanel } from './due-this-week.client';
import { LeadsPanel } from './leads-panel.client';
import { PullPanel } from './pull-panel.client';
import { ReachPanel } from './reach-panel.client';
import { RegistrationPanel } from './registration-panel.client';

const BEST_LEADS = { limit: 10 };
const EARLY_NOTICES = { noticeTypes: [...EARLY_NOTICE_TYPES], limit: 5 };
/** The store search pressed to the early notices: every one, not the head the panel shows. */
const ALL_EARLY_NOTICES = searchHref({
  ...DEFAULT_SEARCH_VIEW,
  filters: { ...DEFAULT_SEARCH_VIEW.filters, noticeTypes: [...EARLY_NOTICE_TYPES] },
});

/**
 * The first page, today: what to act on first — what is due this week
 * across bids and targets, what was raised, the early notices and the best
 * leads — then how much of the year's new work was within reach, then the
 * sources and a pull by hand, then the company's registration. Each panel
 * reads its own resource; a pull moves the version every panel that reads
 * the store depends on, so they read it again.
 */
export function DashboardClient() {
  const { active, profiles, loading, error } = useProfile();
  const profileId = active?.id;
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  return (
    <Stack gap={6}>
      <Heading level={1}>Dashboard</Heading>
      <Surface as="section" aria-label="Due this week">
        <DueThisWeekPanel profileId={profileId} version={version} />
      </Surface>
      <Surface as="section" aria-label="Alerts">
        <AlertsPanel />
      </Surface>
      <Surface as="section" aria-label="Early notices">
        <LeadsPanel
          profileId={profileId}
          version={version}
          heading="Early notices"
          query={EARLY_NOTICES}
          emptyNote="No sources sought or presolicitation is open for this profile in the store."
          more={{ label: 'Every early notice, on Search', href: ALL_EARLY_NOTICES }}
        />
      </Surface>
      <Surface as="section" aria-label="New leads">
        <LeadsPanel
          profileId={profileId}
          version={version}
          heading="Best leads"
          query={BEST_LEADS}
          emptyNote="No leads — pull first, or lower the minimum score."
        />
      </Surface>
      <Surface as="section" aria-label="Within reach">
        <ReachPanel profile={active} />
      </Surface>
      <Surface as="section" aria-label="Pull">
        <PullPanel
          profileId={profileId}
          profiles={profiles}
          profilesLoading={loading}
          profilesError={error}
          onPulled={(summary) => {
            setMessage(`Pull finished: ${summary}`);
            setVersion((current) => current + 1);
          }}
        />
      </Surface>
      <Surface as="section" aria-label="Registration">
        <RegistrationPanel profile={active} />
      </Surface>
      <LiveRegion message={message} />
    </Stack>
  );
}
