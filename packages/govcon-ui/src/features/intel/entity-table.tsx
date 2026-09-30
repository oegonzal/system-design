import { day, type EntityLookup } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { registrationTone } from '../tones';

export interface EntityTableProps {
  lookup: EntityLookup | null;
}

/** What a lookup answered: each registrant on one row, the UEIs the registry did not know beneath. */
export function EntityTable({ lookup }: EntityTableProps) {
  if (lookup === null) {
    return (
      <Text tone="muted" size="sm">
        No lookup yet.
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Heading level={3}>Registrants</Heading>
      {lookup.entities.length === 0 ? (
        <Text tone="muted" size="sm">
          The registry knew none of them.
        </Text>
      ) : (
        <Table aria-label="Registrants">
          <thead>
            <tr>
              <th>Name</th>
              <th>UEI</th>
              <th>CAGE</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Excluded</th>
              <th>Small in</th>
            </tr>
          </thead>
          <tbody>
            {lookup.entities.map((entity) => (
              <tr key={entity.uei}>
                <td>{entity.legalName}</td>
                <td>{entity.uei}</td>
                <td>{entity.cage ?? '—'}</td>
                <td>
                  <Badge tone={registrationTone(entity.registrationStatus)}>
                    {entity.registrationStatus ?? 'unknown'}
                  </Badge>
                </td>
                <td>{day(entity.registrationExpiresAt)}</td>
                <td>{entity.excluded ? <Badge tone="critical">excluded</Badge> : 'no'}</td>
                <td>
                  {entity.naics.filter((item) => item.small === true).length} of{' '}
                  {entity.naics.length} NAICS
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {lookup.unknown.length > 0 ? (
        <Text tone="secondary" size="sm">
          Not in the registry: {lookup.unknown.join(', ')}
        </Text>
      ) : null}
      <Text tone="secondary" size="sm">
        {lookup.spent === null ? '?' : lookup.spent} of {lookup.budget} SAM.gov attempts used in the
        last 24 h.
      </Text>
    </Stack>
  );
}
