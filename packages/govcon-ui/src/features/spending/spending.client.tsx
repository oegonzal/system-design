'use client';

import {
  Heading,
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
import { EMPTY_SCOPE, scopeQueryOf, type ScopeDraft } from './scope';
import { ScopeBar } from './scope-bar';
import { SPENDING_TABS, type SpendingTab } from './tabs';

/**
 * Spending: where and when the government obligates money, through four
 * free USAspending lenses over one scope. Each lens mounts the first time its
 * tab is opened and stays mounted, so a lens nobody opened never reads and a
 * tab switched back to costs nothing; the directory is read once and shared
 * by the scope bar and the agency lens.
 */
export function SpendingClient() {
  const { active } = useProfile();
  const [scope, setScope] = useState<ScopeDraft>(EMPTY_SCOPE);
  const [tab, setTab] = useState<SpendingTab>('pulse');
  const [visited, setVisited] = useState<ReadonlySet<SpendingTab>>(() => new Set(['pulse']));
  const directory = useResource((signal) => api.listAgencies({ signal }), []);
  const query = scopeQueryOf(scope);

  const open = (value: string) => {
    const next = value as SpendingTab;
    setTab(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set([...seen, next])));
  };

  return (
    <Stack gap={5}>
      <Heading level={1}>Spending</Heading>
      <Surface as="section" aria-label="Scope">
        <Stack gap={3}>
          <Heading level={2}>Scope</Heading>
          <Text tone="secondary" size="sm">
            Every lens below reads this scope. Codes match families; an agency narrows to its
            awards.
          </Text>
          <ScopeBar
            value={scope}
            onChange={setScope}
            naicsOptions={active?.naics ?? []}
            agencies={directory.data?.entries ?? null}
            agenciesError={directory.error}
          />
        </Stack>
      </Surface>
      <Tabs value={tab} onChange={open}>
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
            {visited.has('where') ? <BreakdownLens scope={query} /> : null}
          </Surface>
        </TabPanel>
        <TabPanel value="horizon">
          <Surface as="section" aria-label="Horizon">
            {visited.has('horizon') ? <HorizonLens scope={query} /> : null}
          </Surface>
        </TabPanel>
        <TabPanel value="agency">
          <Surface as="section" aria-label="Agency">
            {visited.has('agency') ? (
              <AgencyLens
                directory={directory.data ?? null}
                directoryError={directory.error}
                awardFamily={scope.awardFamily}
              />
            ) : null}
          </Surface>
        </TabPanel>
      </Tabs>
    </Stack>
  );
}
