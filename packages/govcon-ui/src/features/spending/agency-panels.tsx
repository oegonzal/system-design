import {
  compactMoney,
  DASH,
  money,
  type AgencyDirectoryEntry,
  type AgencyOutlook,
  type SubAgencyObligations,
} from '@sysdesign/contracts';
import {
  Button,
  ColumnChart,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Heading,
  Stack,
  StatGrid,
  StatTile,
  Table,
  Text,
  VisuallyHidden,
} from '@sysdesign/design-system';

import { AWARD_FAMILY_LABEL } from './costs';
import { agencyYears, periodColumns } from './period-columns';

export interface AgencyDirectoryTableProps {
  agencies: readonly AgencyDirectoryEntry[];
  selected: string | null;
  onSelect(toptierCode: string): void;
}

/** Every toptier agency with its budget authority; one opens its outlook. */
export function AgencyDirectoryTable({ agencies, selected, onSelect }: AgencyDirectoryTableProps) {
  return (
    <Table aria-label="Agencies">
      <thead>
        <tr>
          <th scope="col">Agency</th>
          <th scope="col">Code</th>
          <th scope="col">Budget authority</th>
          <th scope="col">Obligated</th>
          <th scope="col">Outlayed</th>
          <th scope="col">FY / Q</th>
          <th scope="col">
            <VisuallyHidden>Open</VisuallyHidden>
          </th>
        </tr>
      </thead>
      <tbody>
        {agencies.map((agency) => (
          <tr key={agency.toptierCode}>
            <td>{agency.abbreviation ? `${agency.abbreviation} — ${agency.name}` : agency.name}</td>
            <td>{agency.toptierCode}</td>
            <td>{compactMoney(agency.budgetAuthority)}</td>
            <td>{compactMoney(agency.obligated)}</td>
            <td>{compactMoney(agency.outlayed)}</td>
            <td>
              {agency.activeFiscalYear === null ? DASH : `FY${agency.activeFiscalYear}`}
              {agency.activeQuarter === null ? '' : ` Q${agency.activeQuarter}`}
            </td>
            <td>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                selected={selected === agency.toptierCode}
                aria-pressed={selected === agency.toptierCode}
                onClick={() => onSelect(agency.toptierCode)}
              >
                {selected === agency.toptierCode ? 'Viewing' : 'View'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export interface AgencyOutlookPanelProps {
  outlook: AgencyOutlook;
  pending?: boolean;
}

/** The latest year's headroom, then obligations to date by period for the years the source reported. */
export function AgencyOutlookPanel({ outlook, pending = false }: AgencyOutlookPanelProps) {
  const latest = outlook.years.find((year) => year.obligated !== null) ?? outlook.years[0];
  const headroom =
    latest && latest.budgetaryResources !== null && latest.obligated !== null
      ? latest.budgetaryResources - latest.obligated
      : null;
  const { series, data } = periodColumns(agencyYears(outlook.years));
  return (
    <Stack gap={4}>
      <Heading level={3}>
        {outlook.abbreviation ? `${outlook.abbreviation} — ${outlook.name}` : outlook.name}
      </Heading>
      {latest ? (
        <StatGrid aria-label={`FY${latest.fiscalYear} resources`}>
          <StatTile
            label="Budgetary resources"
            value={compactMoney(latest.budgetaryResources)}
            detail={`FY${latest.fiscalYear}`}
          />
          <StatTile label="Obligated to date" value={compactMoney(latest.obligated)} />
          <StatTile label="Outlayed to date" value={compactMoney(latest.outlayed)} />
          <StatTile
            label="Not yet obligated"
            value={headroom === null ? DASH : compactMoney(headroom)}
            detail={headroom === null ? undefined : 'Resources less obligations to date'}
          />
        </StatGrid>
      ) : null}
      <ColumnChart
        title="Obligations to date by period"
        summary="Each agency year's obligations as reported through each fiscal period, newest year first."
        layout="grouped"
        series={series}
        data={data}
        valueLabel="Obligations to date, USD, as reported"
        xLabel="Period"
        formatValue={money}
        formatTick={compactMoney}
        emptyMessage="The source has reported no periods for this agency."
        pending={pending}
      />
    </Stack>
  );
}

export interface SubAgencyTableProps {
  subAgencies: readonly SubAgencyObligations[];
  fiscalYear: number;
  awardFamily: AgencyOutlook['awardFamily'];
  truncated: boolean;
}

const OfficeRows = ({ offices }: { offices: SubAgencyObligations['offices'] }) => (
  <Table aria-label="Offices">
    <thead>
      <tr>
        <th scope="col">Office</th>
        <th scope="col">Code</th>
        <th scope="col">Obligations</th>
        <th scope="col">Transactions</th>
        <th scope="col">New awards</th>
      </tr>
    </thead>
    <tbody>
      {offices.map((office) => (
        <tr key={`${office.code ?? ''}-${office.name}`}>
          <td>{office.name}</td>
          <td>{office.code ?? DASH}</td>
          <td>{compactMoney(office.obligations)}</td>
          <td>{office.transactions.toLocaleString('en-US')}</td>
          <td>{office.newAwards.toLocaleString('en-US')}</td>
        </tr>
      ))}
    </tbody>
  </Table>
);

/** The agency's sub-agencies for the year, their offices folded under each. */
export function SubAgencyTable({
  subAgencies,
  fiscalYear,
  awardFamily,
  truncated,
}: SubAgencyTableProps) {
  if (subAgencies.length === 0) {
    return (
      <Text tone="muted" size="sm">
        {`No ${AWARD_FAMILY_LABEL[awardFamily].toLowerCase()} obligations reported by sub-agency for FY${fiscalYear}.`}
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Table aria-label="Sub-agencies">
        <thead>
          <tr>
            <th scope="col">Sub-agency</th>
            <th scope="col">Obligations</th>
            <th scope="col">Transactions</th>
            <th scope="col">New awards</th>
            <th scope="col">Offices</th>
          </tr>
        </thead>
        <tbody>
          {subAgencies.map((subAgency) => (
            <tr key={`${subAgency.abbreviation ?? ''}-${subAgency.name}`}>
              <td>
                {subAgency.abbreviation
                  ? `${subAgency.abbreviation} — ${subAgency.name}`
                  : subAgency.name}
              </td>
              <td>{compactMoney(subAgency.obligations)}</td>
              <td>{subAgency.transactions.toLocaleString('en-US')}</td>
              <td>{subAgency.newAwards.toLocaleString('en-US')}</td>
              <td>
                {subAgency.offices.length === 0 ? (
                  DASH
                ) : (
                  <Disclosure>
                    <DisclosureButton variant="ghost" size="sm">
                      {`Offices (${subAgency.offices.length})`}
                    </DisclosureButton>
                    <DisclosurePanel>
                      <OfficeRows offices={subAgency.offices} />
                    </DisclosurePanel>
                  </Disclosure>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Text tone="muted" size="sm">
        {`${AWARD_FAMILY_LABEL[awardFamily]}, FY${fiscalYear}${truncated ? ' — more sub-agencies exist beyond the ones shown' : ''}.`}
      </Text>
    </Stack>
  );
}
