'use client';

import {
  DEFAULT_HORIZON_MONTHS,
  NO_FACETS,
  UEI_SHAPE,
  windowOf,
  type BreakdownCategory,
  type HorizonMonthChoice,
  type ScopeQuery,
  type StoredProfile,
  type WindowPreset,
} from '@sysdesign/contracts';
import {
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
import { FullPageNotice } from '../../components/full-page-notice';
import { useLink } from '../../components/link-context';
import { useProfile } from '../../providers/profile-context';
import { BreakdownLens } from '../spending/breakdown.client';
import { HorizonLens } from '../spending/horizon.client';
import { PrimesLens } from '../spending/primes.client';
import { defaultView, spendingHref } from '../spending/spending-link';
import { FirmHeader } from './firm-header';
import { PRIME_TABS, type PrimeTab } from './prime-tabs';
import { RegistrationPanel } from './registration-panel';

export interface PrimeClientProps {
  uei: string;
}

/** The window the header's holdings and the page's first readings cover. */
const HEADER_WINDOW: WindowPreset = 'last-12-months';

/**
 * One firm, by its UEI. Its name and what it holds, its registration as the
 * store holds it, and the spending lenses the Spending page has, each
 * narrowed to this firm in the active profile's codes: the awards it holds
 * that are ending, who buys from it, the firms it reported hiring, and the
 * primes that reported hiring it. Nothing here is a second way of reading:
 * the firm is one facet of a scope, and every panel — the header's name and
 * holdings included, which are the recipient ranking narrowed to it — is the
 * lens that already reads one. Each tab is read only once it is opened.
 */
export function PrimeClient({ uei }: PrimeClientProps) {
  const { active, loading } = useProfile();
  if (!UEI_SHAPE.test(uei)) {
    return (
      <FullPageNotice
        title="Not a UEI"
        message={`A UEI is twelve capital letters and digits; ${uei} is not one.`}
        backHref="/"
      />
    );
  }
  return (
    <Stack gap={5}>
      {loading ? (
        <>
          <FirmHeader uei={uei} name={null} holdings={null} />
          <Spinner label="Loading the profile" />
        </>
      ) : (
        <PrimeWorkspace uei={uei} profile={active} />
      )}
    </Stack>
  );
}

function PrimeWorkspace({ uei, profile }: { uei: string; profile: StoredProfile | null }) {
  const Link = useLink();
  const [tab, setTab] = useState<PrimeTab>('ending');
  const [opened, setOpened] = useState<ReadonlySet<PrimeTab>>(() => new Set<PrimeTab>(['ending']));
  const [months, setMonths] = useState<HorizonMonthChoice>(DEFAULT_HORIZON_MONTHS);
  const [category, setCategory] = useState<BreakdownCategory>('awarding_subagency');
  const [preset, setPreset] = useState<WindowPreset>(HEADER_WINDOW);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const stored = useResource((signal) => api.getEntity(uei, { signal }), [uei]);
  const lookup = useAction(async () => {
    setProblem(null);
    const result = await api.lookupEntities({ ueis: [uei] });
    if (result.entities.some((entity) => entity.uei === uei)) {
      setMessage('Registration looked up and stored.');
      stored.reload();
    } else {
      setProblem(`SAM.gov knows no registrant ${uei}.`);
    }
    return result;
  });

  const naics = profile?.naics ?? [];
  /** The profile's codes as awards this firm won, and as subcontracts it was paid for. */
  const asHolder: ScopeQuery = { naics: [...naics], awardFamily: 'both', recipient: [uei] };
  const { from, to } = windowOf(HEADER_WINDOW, Date.now());
  /** The recipients of that scope, which the firm narrows to itself: its name, and its total. */
  const held = useResource(
    (signal) =>
      api.getSpendingBreakdown({ ...asHolder, category: 'recipient', from, to }, { signal }),
    [uei, naics.join(','), from, to],
  );
  const named = held.data?.rows.find((row) => row.code === uei)?.name ?? null;
  /** The profile's codes with no firm named: the ranking this firm's own row is read from. */
  const asPrime: ScopeQuery = { naics: [...naics], awardFamily: 'contracts' };
  const band = profile?.teaming.subcontract;
  const open = (value: string) => {
    const next = value as PrimeTab;
    setOpened((seen) => (seen.has(next) ? seen : new Set([...seen, next])));
    setTab(next);
  };
  /** The Spending page narrowed to one firm, on one of its tabs. */
  const narrowedTo = (firm: string, lens: 'pulse' | 'primes'): string => {
    const base = defaultView(naics);
    return spendingHref(
      { ...base, scope: { ...base.scope, facets: { ...NO_FACETS, recipient: [firm] } }, tab: lens },
      naics,
    );
  };
  /** Where the primes that hired one subcontractor are ranked. */
  const hiredHrefOf = (subcontractor: string): string => narrowedTo(subcontractor, 'primes');

  return (
    <>
      <FirmHeader
        uei={uei}
        name={stored.data?.legalName ?? named}
        holdings={held.data ? { amount: held.data.total, from, to } : null}
      />
      <Surface as="section" aria-label="Registration">
        <RegistrationPanel
          uei={uei}
          entity={stored.data}
          onLookup={() => void lookup.run()}
          pending={lookup.pending}
          problem={problem ?? lookup.error ?? stored.error}
        />
      </Surface>
      <Text tone="secondary" size="sm">
        {`Each panel reads this firm in the active profile’s NAICS (${naics.join(', ') || 'none'}), free from USAspending. `}
        <Link href={narrowedTo(uei, 'pulse')} $variant="inline">
          Open the Spending page narrowed to it
        </Link>
        {' to change the codes or the filters.'}
      </Text>
      <Tabs value={tab} onChange={open}>
        <TabList aria-label="What to read about this firm">
          {PRIME_TABS.map((item) => (
            <Tab key={item.id} value={item.id}>
              {item.label}
            </Tab>
          ))}
        </TabList>
        <TabPanel value="ending">
          <Surface as="section" aria-label="Awards ending">
            {opened.has('ending') ? (
              <HorizonLens scope={asHolder} months={months} onMonthsChange={setMonths} />
            ) : null}
          </Surface>
        </TabPanel>
        <TabPanel value="buyers">
          <Surface as="section" aria-label="Who buys from it">
            {opened.has('buyers') ? (
              <BreakdownLens
                scope={asHolder}
                category={category}
                onCategoryChange={setCategory}
                preset={preset}
                onPresetChange={setPreset}
              />
            ) : null}
          </Surface>
        </TabPanel>
        <TabPanel value="hires">
          <Surface as="section" aria-label="Who it hires">
            {opened.has('hires') ? (
              <PrimesLens
                scope={asPrime}
                band={band}
                preset={preset}
                onPresetChange={setPreset}
                hiredHrefOf={hiredHrefOf}
                only={uei}
              />
            ) : null}
          </Surface>
        </TabPanel>
        <TabPanel value="hired-by">
          <Surface as="section" aria-label="Who hires it">
            {opened.has('hired-by') ? (
              <PrimesLens
                scope={{ ...asPrime, recipient: [uei] }}
                band={band}
                preset={preset}
                onPresetChange={setPreset}
                hiredHrefOf={hiredHrefOf}
              />
            ) : null}
          </Surface>
        </TabPanel>
      </Tabs>
      <LiveRegion message={message} />
    </>
  );
}
