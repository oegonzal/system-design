'use client';

import { biddableSetAsides, windowOf, type StoredProfile } from '@sysdesign/contracts';
import { Alert, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';
import { FIRST_LOOK_NOTE, LENS_LOADING } from '../spending/costs';
import { defaultView, spendingHref } from '../spending/spending-link';
import { ReachTiles } from './reach-tiles';

/** The window the daily warm counts reach over, so the first look of the day is its snapshot. */
const REACH_WINDOW = 'last-12-months';

export interface ReachPanelProps {
  /** The active profile; null while the profiles load, or when there is none. */
  profile: StoredProfile | null;
}

/**
 * The Reach lens for the active profile, as the daily warm reads it — its
 * NAICS, every agency, the lanes it may bid, the last twelve months — so on
 * a day the warm has run this is its snapshot and asks the source nothing.
 */
export function ReachPanel({ profile }: ReachPanelProps) {
  const window = windowOf(REACH_WINDOW, Date.now());
  const query =
    profile === null
      ? null
      : {
          naics: profile.naics,
          psc: [],
          lanes: biddableSetAsides(profile.scoring.setAside),
          from: window.from,
          to: window.to,
        };
  const key = JSON.stringify(query);
  const reach = useResource(
    (signal) => (query === null ? Promise.resolve(null) : api.getSpendingReach(query, { signal })),
    [key],
  );
  if (reach.error) return <Alert tone="danger">{reach.error}</Alert>;
  if (profile === null || reach.data === null) {
    return (
      <Stack gap={2}>
        <Spinner label={LENS_LOADING.reach} />
        <Text tone="muted" size="sm">
          {FIRST_LOOK_NOTE}
        </Text>
      </Stack>
    );
  }
  return (
    <ReachTiles
      reach={reach.data}
      href={spendingHref({ ...defaultView(profile.naics), tab: 'reach' }, profile.naics)}
    />
  );
}
