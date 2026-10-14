'use client';

import type { ListLeadsQuery } from '@sysdesign/contracts';
import { Alert, Spinner, Stack } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { useLink } from '../../components/link-context';
import { LeadTable } from '../leads/lead-table';

export interface LeadsPanelProps {
  /** Undefined until the profiles are read: nothing is asked before. */
  profileId: string | undefined;
  /** Moves after a pull, so the panel reads the store again. */
  version: number;
  heading: string;
  /** What the store is asked for, beside the profile. */
  query: Omit<ListLeadsQuery, 'profile'>;
  emptyNote: string;
  /** Where the whole list is, when the panel shows only its head. */
  more?: { label: string; href: string };
}

/** One ranking of the store for the active profile, as a panel: free, read again after a pull. */
export function LeadsPanel({
  profileId,
  version,
  heading,
  query,
  emptyNote,
  more,
}: LeadsPanelProps) {
  const Link = useLink();
  const key = JSON.stringify(query);
  const leads = useResource(
    (signal) =>
      profileId === undefined
        ? Promise.resolve(null)
        : api.listLeads({ profile: profileId, ...query }, { signal }),
    [profileId, key, version],
  );
  if (leads.error) return <Alert tone="danger">{leads.error}</Alert>;
  if (leads.data === null) return <Spinner label={`Loading ${heading.toLowerCase()}`} />;
  return (
    <Stack gap={3}>
      <LeadTable report={leads.data} heading={heading} emptyNote={emptyNote} />
      {more === undefined || leads.data.leads.length === 0 ? null : (
        <Link href={more.href} $variant="inline">
          {more.label}
        </Link>
      )}
    </Stack>
  );
}
