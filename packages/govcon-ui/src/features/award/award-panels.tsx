import {
  clip,
  compactMoney,
  DASH,
  day,
  daysLeftLabel,
  daysUntil,
  money,
  type AwardBody,
  type AwardFamily,
  type AwardSubcontractingPlan,
  type FirmRef,
  type NoticeRef,
} from '@sysdesign/contracts';
import { Badge, Heading, Stack, StatGrid, StatTile, Table, Text } from '@sysdesign/design-system';
import type { ReactNode } from 'react';

import { useLink } from '../../components/link-context';
import { awardHref, primeHref } from '../award-href';
import { noticeHref } from '../notice-href';
import { AWARD_FAMILY_LABEL } from '../spending/costs';
import { AWARD_FAMILY_TONE } from '../tones';

const count = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

/** What an award with no vehicle above it is, by its family. */
const STANDS_ALONE: Record<AwardFamily, string> = {
  contracts: 'None: a contract of its own',
  idvs: 'None: it is a vehicle itself',
};

/** A sum as a share of what the award can reach, or what stands in when the source gives no ceiling. */
const againstCeiling = (sum: number, ceiling: number | null, of: string): string =>
  ceiling === null
    ? 'no ceiling given'
    : `${ceiling > 0 ? percent.format(sum / ceiling) : DASH} of ${compactMoney(ceiling)} ${of}`;

/** A firm as a link to its own page when the source gave it a UEI, and as its name when not. */
function Firm({ firm }: { firm: FirmRef }) {
  const Link = useLink();
  return firm.uei === null ? (
    <>{firm.name}</>
  ) : (
    <Link href={primeHref(firm.uei)} $variant="inline">
      {firm.name}
    </Link>
  );
}

export interface AwardHeaderProps {
  award: AwardBody;
}

/** What the award is called, what kind it is, who holds it and who bought it. */
export function AwardHeader({ award }: AwardHeaderProps) {
  return (
    <Stack gap={2}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={1}>{award.piid ?? award.externalId}</Heading>
        <Badge tone={AWARD_FAMILY_TONE[award.family]}>{AWARD_FAMILY_LABEL[award.family]}</Badge>
        {award.typeDescription ? <Badge>{award.typeDescription}</Badge> : null}
      </Stack>
      <Text>
        <Firm firm={award.recipient} />
        {award.parent ? (
          <>
            {' '}
            <Text as="span" tone="muted" size="sm">
              owned by <Firm firm={award.parent} />
            </Text>
          </>
        ) : null}
      </Text>
      <Text tone="secondary" size="sm">
        {award.agencyPath === null ? 'Buyer not named' : award.agencyPath.split('.').join(' › ')}
      </Text>
      {award.description ? <Text size="sm">{award.description}</Text> : null}
    </Stack>
  );
}

export interface AwardMoneyProps {
  award: AwardBody;
  /** The instant "days left" counts from — fixed in stories, `Date.now()` in the app. */
  nowMs: number;
}

/**
 * The two questions a bidder asks of an award: how much of what it can
 * reach has been obligated, and when it ends — the end of the period
 * already exercised beside the end if every option is, since an award about
 * to "end" is often an option decision and not a recompete. A vehicle
 * carries its money on its orders, so it is read by what was ordered under
 * it: its own obligations are no measure of its use.
 */
export function AwardMoney({ award, nowMs }: AwardMoneyProps) {
  const { orders } = award;
  const extended =
    award.endsAt !== null &&
    award.endsWithOptionsAt !== null &&
    award.endsWithOptionsAt > award.endsAt;
  return (
    <StatGrid aria-label="Money and dates">
      {orders === null ? (
        <StatTile
          label="Obligated"
          value={compactMoney(award.obligated)}
          detail={againstCeiling(award.obligated, award.ceiling, 'with every option')}
        />
      ) : (
        <StatTile
          label="Ordered under it"
          value={compactMoney(orders.obligated)}
          detail={[
            `${count.format(orders.count)} order(s)`,
            ...(orders.vehicles > 0
              ? [`${count.format(orders.vehicles)} vehicle(s) awarded under it`]
              : []),
            againstCeiling(orders.obligated, award.ceiling, 'ceiling'),
          ].join(' · ')}
        />
      )}
      <StatTile
        label="Ends"
        value={day(award.endsAt)}
        detail={daysLeftLabel(daysUntil(award.endsAt, nowMs))}
      />
      <StatTile
        label="Ends with every option"
        value={day(award.endsWithOptionsAt)}
        detail={
          award.endsWithOptionsAt === null
            ? 'the source gives none'
            : extended
              ? `${daysLeftLabel(daysUntil(award.endsWithOptionsAt, nowMs))} — options remain`
              : 'the same day: no option is left'
        }
      />
      <StatTile
        label="Subcontracted"
        value={compactMoney(award.subcontractAmount)}
        detail={`${award.subcontractCount} reported`}
      />
    </StatGrid>
  );
}

export interface AwardFactsProps {
  award: AwardBody;
}

/** The plan as the latest action codes and words it; a record that codes none states none. */
const planLabel = (plan: AwardSubcontractingPlan | null): string =>
  plan === null
    ? 'None stated'
    : [plan.code, plan.description].filter((part) => part !== null).join(' ');

/** One fact as a row: what it is, and what the record says. */
const fact = (label: string, value: ReactNode): { label: string; value: ReactNode } => ({
  label,
  value,
});

/** How it was bought: the vehicle it sits under, how it was competed and priced, the subcontracting plan it carries, and what it is coded as. */
export function AwardFacts({ award }: AwardFactsProps) {
  const Link = useLink();
  const { vehicle, competition } = award;
  const rows = [
    fact(
      'Vehicle',
      vehicle === null ? (
        STANDS_ALONE[award.family]
      ) : (
        <>
          {vehicle.externalId === null ? (
            (vehicle.piid ?? DASH)
          ) : (
            <Link href={awardHref(vehicle.externalId)} $variant="inline">
              {vehicle.piid ?? vehicle.externalId}
            </Link>
          )}
          {[vehicle.kind, vehicle.holders, vehicle.agency]
            .filter((part) => part !== null)
            .map((part) => ` · ${part}`)
            .join('')}
        </>
      ),
    ),
    ...(award.holders === null ? [] : [fact('Held by', award.holders)]),
    fact(
      'Offers received',
      competition.offers === null ? 'Not counted' : String(competition.offers),
    ),
    fact('Set-aside', competition.setAside ?? competition.setAsideCode ?? DASH),
    fact('Subcontracting plan', planLabel(award.subcontractingPlan)),
    fact('Competition', competition.extentCompeted ?? DASH),
    fact('Procedure', competition.solicitationProcedures ?? DASH),
    fact('Pricing', competition.pricing ?? DASH),
    fact('Solicitation', competition.solicitationId ?? DASH),
    fact(
      'NAICS',
      award.naicsCode === null ? DASH : `${award.naicsCode} ${award.naicsDescription ?? ''}`,
    ),
    fact('PSC', award.pscCode === null ? DASH : `${award.pscCode} ${award.pscDescription ?? ''}`),
    fact('Place of performance', award.placeOfPerformance ?? DASH),
    fact('Signed', day(award.signedAt)),
    fact('Starts', day(award.startsAt)),
    fact('Base and exercised options', money(award.exercised)),
  ];
  return (
    <Stack gap={2}>
      <Heading level={2}>How it was bought</Heading>
      <Table aria-label="Award facts">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Stack>
  );
}

export interface AwardSubcontractsProps {
  award: AwardBody;
}

/** The largest subcontracts reported under the award: who, how much, when, for what. */
export function AwardSubcontracts({ award }: AwardSubcontractsProps) {
  return (
    <Stack gap={2}>
      <Heading level={2}>Subcontractors</Heading>
      {award.subcontracts.length === 0 ? (
        <Text tone="muted" size="sm">
          No subcontract is reported under this award. Small primes owe no report, and a prime
          reports only first-tier subcontracts over the threshold.
        </Text>
      ) : (
        <>
          <Text tone="secondary" size="sm">
            {`The ${award.subcontracts.length} largest of ${award.subcontractCount} reported, ${compactMoney(award.subcontractAmount)} in all.`}
          </Text>
          <Table aria-label="Subcontracts under this award">
            <thead>
              <tr>
                <th scope="col">Subcontractor</th>
                <th scope="col">Amount</th>
                <th scope="col">Date</th>
                <th scope="col">For</th>
              </tr>
            </thead>
            <tbody>
              {award.subcontracts.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name ?? DASH}</th>
                  <td>{money(row.amount)}</td>
                  <td>{day(row.actionDate)}</td>
                  <td title={row.description ?? undefined}>{clip(row.description, 90)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}

export interface AwardNoticesProps {
  notices: readonly NoticeRef[];
}

/** The open stored notices sharing the award's NAICS and buyer — where its follow-on would appear. */
export function AwardNotices({ notices }: AwardNoticesProps) {
  const Link = useLink();
  return (
    <Stack gap={2}>
      <Heading level={2}>Open notices from the same buyer and code</Heading>
      {notices.length === 0 ? (
        <Text tone="muted" size="sm">
          None stored. A pull stores notices; the join is on the exact NAICS code and the buyer’s
          sub-agency, never on a name.
        </Text>
      ) : (
        <Stack as="ul" gap={1} aria-label="Open notices">
          {notices.map((notice) => (
            <li key={notice.noticeId}>
              <Link href={noticeHref(notice.noticeId)} $variant="inline">
                {clip(notice.title, 80)}
              </Link>{' '}
              <Text as="span" tone="muted" size="sm">
                {`${notice.noticeType ?? 'notice'} · due ${day(notice.responseDeadlineAt)}`}
              </Text>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
