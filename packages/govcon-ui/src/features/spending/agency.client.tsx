'use client';

import type { AgencyDirectory, AwardFamilyChoice } from '@sysdesign/contracts';
import { Alert, Spinner, Stack, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { AgencyDirectoryTable, AgencyOutlookPanel, SubAgencyTable } from './agency-panels';
import { FIRST_LOOK_NOTE, LENS_LOADING } from './costs';
import { ProvenanceLine } from './provenance-line';

export interface AgencyLensProps {
  /** The directory the page already read; null while it loads. */
  directory: AgencyDirectory | null;
  directoryError: string | null;
  awardFamily: AwardFamilyChoice;
}

/** An agency's headroom: pick one from the directory, read its budget by year and its offices for this year. */
export function AgencyLens({ directory, directoryError, awardFamily }: AgencyLensProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const outlook = useResource(
    (signal) =>
      selected === null
        ? Promise.resolve(null)
        : api.getAgencyOutlook(selected, { awardFamily }, { signal }),
    [selected, awardFamily],
  );
  return (
    <Stack gap={4}>
      {directoryError ? <Alert tone="danger">{directoryError}</Alert> : null}
      {directory ? (
        <>
          <AgencyDirectoryTable
            agencies={directory.entries}
            selected={selected}
            onSelect={setSelected}
          />
          <ProvenanceLine provenance={directory.provenance} />
        </>
      ) : directoryError ? null : (
        <Spinner label="Loading the agency directory" />
      )}
      {selected === null ? null : outlook.error ? (
        <Alert tone="danger">{outlook.error}</Alert>
      ) : outlook.data ? (
        <>
          <AgencyOutlookPanel outlook={outlook.data} pending={outlook.loading} />
          <SubAgencyTable
            subAgencies={outlook.data.subAgencies}
            fiscalYear={outlook.data.officesFiscalYear}
            awardFamily={outlook.data.awardFamily}
            truncated={outlook.data.truncated}
          />
          <ProvenanceLine provenance={outlook.data.provenance} />
        </>
      ) : (
        <Stack gap={2}>
          <Spinner label={LENS_LOADING.agency} />
          <Text tone="muted" size="sm">
            {FIRST_LOOK_NOTE}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
