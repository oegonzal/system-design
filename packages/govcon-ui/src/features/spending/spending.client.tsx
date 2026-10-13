'use client';

import {
  Heading,
  Spinner,
  Stack,
  Surface,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { useProfile } from '../../providers/profile-context';
import { AgencyLens } from './agency.client';
import { BreakdownLens } from './breakdown.client';
import { HorizonLens } from './horizon.client';
import { PulseLens } from './pulse.client';
import { scopeQueryOf } from './scope';
import { ScopeBar } from './scope-bar';
import { SPENDING_TABS, type SpendingTab } from './tabs';
import { useSpendingView } from './use-spending-view';

const NO_CODES: readonly string[] = [];

/**
 * Spending: where and when the government obligates money, through four
 * free USAspending lenses over one scope. The view is its address — the
 * scope, the open tab and each lens's setting travel in the URL — and a link
 * without a scope opens on the active profile's NAICS, so the lenses mount
 * once the profile is known and read each scope once.
 */
export function SpendingClient() {
  const { active, loading } = useProfile();
  return (
    <Stack gap={5}>
      <Heading level={1}>Spending</Heading>
      {loading ? (
        <Spinner label="Loading the profile" />
      ) : (
        <SpendingWorkspace profileNaics={active?.naics ?? NO_CODES} />
      )}
    </Stack>
  );
}

/**
 * The scope bar and the four tabs over one view. Each lens mounts the first
 * time its tab is opened — by a click or by the address — and stays mounted,
 * so a lens nobody opened never reads and a tab switched back to costs
 * nothing; the directory is read once and shared by the scope bar and the
 * agency lens, whose pick narrows the scope to that agency.
 */
function SpendingWorkspace({ profileNaics }: { profileNaics: readonly string[] }) {
  const { view, replace } = useSpendingView(profileNaics);
  const [opened, setOpened] = useState<ReadonlySet<SpendingTab>>(() => new Set([view.tab]));
  const directory = useResource((signal) => api.listAgencies({ signal }), []);
  const query = scopeQueryOf(view.scope);
  const visited = opened.has(view.tab) ? opened : new Set([...opened, view.tab]);

  const open = (value: string) => {
    const tab = value as SpendingTab;
    setOpened((seen) => (seen.has(tab) ? seen : new Set([...seen, tab])));
    replace({ ...view, tab });
  };
  const pick = (toptierCode: string) =>
    replace({
      ...view,
      scope: { ...view.scope, agency: view.scope.agency === toptierCode ? '' : toptierCode },
    });

  return (
    <>
      <Surface as="section" aria-label="Scope">
        <Stack gap={3}>
          <Heading level={2}>Scope</Heading>
          <Text tone="secondary" size="sm">
            Every lens below reads this scope. Codes match families; an agency narrows to its
            awards. The view is its address: copy the link to share it.
          </Text>
          <ScopeBar
            value={view.scope}
            onChange={(scope) => replace({ ...view, scope })}
            naicsOptions={profileNaics}
            agencies={directory.data?.entries ?? null}
            agenciesError={directory.error}
          />
        </Stack>
      </Surface>
      <Tabs value={view.tab} onChange={open}>
        <TabList aria-label="Spending lenses">
          {SPENDING_TABS.map((item) => (
            <Tab key={item.id} value={item.id}>
              {item.label}
            </Tab>
          ))}
        </TabList>
        <TabPanel value="pulse">
          <Surface as="section" aria-label="Pulse">
            {visited.has('pulse') ? <PulseLens scope={query} /> : null}
          </Surface>
        </TabPanel>
        <TabPanel value="where">
          <Surface as="section" aria-label="Where">
            {visited.has('where') ? (
              <BreakdownLens
                scope={query}
                category={view.category}
                onCategoryChange={(category) => replace({ ...view, category })}
                preset={view.preset}
                onPresetChange={(preset) => replace({ ...view, preset })}
              />
            ) : null}
          </Surface>
        </TabPanel>
        <TabPanel value="horizon">
          <Surface as="section" aria-label="Horizon">
            {visited.has('horizon') ? (
              <HorizonLens
                scope={query}
                months={view.months}
                onMonthsChange={(months) => replace({ ...view, months })}
              />
            ) : null}
          </Surface>
        </TabPanel>
        <TabPanel value="agency">
          <Surface as="section" aria-label="Agency">
            {visited.has('agency') ? (
              <AgencyLens
                directory={directory.data ?? null}
                directoryError={directory.error}
                awardFamily={view.scope.awardFamily}
                selected={view.scope.agency || null}
                onSelect={pick}
              />
            ) : null}
          </Surface>
        </TabPanel>
      </Tabs>
    </>
  );
}
