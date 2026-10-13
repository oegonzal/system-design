import { DASH, minute, type Provenance } from '@sysdesign/contracts';
import { Alert, Stack, Text } from '@sysdesign/design-system';

import { SERVED_FROM_LABEL } from './costs';

export interface ProvenanceLineProps {
  provenance: Provenance;
}

/**
 * Where an answer came from, in one line: the source and its own "as of",
 * whether it was fetched now or served from a snapshot, what it cost, when.
 * The source's declared facts about the data follow, verbatim — the UI
 * knows none of them itself.
 */
export function ProvenanceLine({ provenance }: ProvenanceLineProps) {
  const { source, asOf, servedFrom, requests, fetchedAt, disclosures } = provenance;
  return (
    <Stack gap={2}>
      <Text tone="muted" size="sm">
        {`${source} · data as of ${asOf ?? DASH} · ${SERVED_FROM_LABEL[servedFrom]} · ${requests} request(s) · fetched ${minute(fetchedAt)}`}
      </Text>
      {servedFrom === 'stale' ? (
        <Alert tone="warn">
          The latest refresh did not complete; these numbers are from the snapshot named above.
        </Alert>
      ) : null}
      {disclosures.length > 0 ? (
        <Alert tone="info">
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {disclosures.map((disclosure) => (
              <li key={disclosure}>{disclosure}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </Stack>
  );
}
