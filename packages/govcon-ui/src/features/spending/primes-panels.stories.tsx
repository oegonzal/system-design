import { NO_FACETS } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PRIMES } from '../../testing/spending-fixtures';
import { PrimeRecord, PrimesReadLine, PrimesSummary, PrimesTable } from './primes-panels';

const hiredHrefOf = (uei: string): string => `/spending?recipient=${uei}&tab=primes`;

const meta: Meta<typeof PrimesTable> = {
  title: 'Govcon/Spending/Primes',
  component: PrimesTable,
  args: {
    rows: PRIMES.primes,
    primeCount: PRIMES.primeCount,
    hiredHrefOf,
    tracked: new Set(['SMNWM6HN79X5']),
    onTrack: () => undefined,
  },
};
export default meta;

type Story = StoryObj<typeof PrimesTable>;

/** Three primes of 158: two with a UEI and a page of their own — one of them tracked as a firm — and one the source named without one. */
export const Ranking: Story = {};

/** Nothing reported for the scope, the window and the size. */
export const Empty: Story = { args: { rows: [], primeCount: 0 } };

/** What was read: the 3,000 most recent of 16,771, repeats removed, older ones left unread. */
export const Summary: Story = { render: () => <PrimesSummary primes={PRIMES} /> };

/** Every row the source holds was read. */
export const SummaryComplete: Story = {
  render: () => (
    <PrimesSummary primes={{ ...PRIMES, total: 412, read: 412, duplicates: 9, capped: false }} />
  ),
};

/** The scope narrowed to one firm: the primes that reported paying it. */
export const SummaryHiredBy: Story = {
  render: () => (
    <PrimesSummary
      primes={{
        ...PRIMES,
        scope: { ...PRIMES.scope, facets: { ...NO_FACETS, recipient: ['JLW7WAKPEKD4'] } },
        band: null,
        capped: false,
      }}
    />
  ),
};

/** The same read in one line, for a page about one firm. */
export const ReadLine: Story = { render: () => <PrimesReadLine primes={PRIMES} /> };

export const ReadLineComplete: Story = {
  render: () => (
    <PrimesReadLine primes={{ ...PRIMES, total: 412, read: 412, duplicates: 9, capped: false }} />
  ),
};

/** One firm's own row, opened out. */
export const Record: Story = {
  render: () => <PrimeRecord uei="JCBMLGPE6Z71" rows={PRIMES.primes} hiredHrefOf={hiredHrefOf} />,
};

/** A firm the ranking does not list. */
export const RecordUnlisted: Story = {
  render: () => <PrimeRecord uei="ZZZZZZZZZZZ9" rows={PRIMES.primes} hiredHrefOf={hiredHrefOf} />,
};
