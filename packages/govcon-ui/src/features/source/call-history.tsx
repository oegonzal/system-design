import { describeCall, minute, type SourceCall } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { CALL_OUTCOME_TONE, OPERATION_TONE } from '../tones';

export interface CallHistoryProps {
  calls: readonly SourceCall[];
  total: number;
}

/** The ledger newest first: every request made upstream, its operation, outcome and size. */
export function CallHistory({ calls, total }: CallHistoryProps) {
  return (
    <Stack gap={3}>
      <Heading level={2}>Calls</Heading>
      <Text tone="secondary" size="sm">
        {calls.length} of {total} in the ledger, newest first
      </Text>
      {calls.length === 0 ? (
        <Text tone="muted" size="sm">
          No calls yet — nothing has been asked of the source.
        </Text>
      ) : (
        <Table aria-label="Source calls">
          <thead>
            <tr>
              <th>Requested</th>
              <th>Operation</th>
              <th>What</th>
              <th>Outcome</th>
              <th>Records</th>
              <th>ms</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{minute(call.requestedAt)}</td>
                <td>
                  <Badge tone={OPERATION_TONE[call.operation]}>{call.operation}</Badge>
                </td>
                <td>{describeCall(call)}</td>
                <td>
                  <Badge tone={CALL_OUTCOME_TONE[call.outcome]}>{call.outcome}</Badge>
                  {call.error ? ` ${call.error}` : ''}
                </td>
                <td>
                  {call.recordCount ?? '—'}
                  {call.totalRecords !== null ? ` of ${call.totalRecords}` : ''}
                </td>
                <td>{call.durationMs}</td>
                <td>{call.status ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Stack>
  );
}
