import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { OUTCOME_TONE } from '../../results/tones';
import type { Invocation, InvocationTotals } from '../model/exchange-invocations';

/**
 * The model calls, counted as calls rather than as attempts.
 *
 * An exchange row is one attempt, and the ordinal counts attempts, so the rows
 * alone cannot say "this was asked three times". Grouping them into invocations
 * can — and the retries are the interesting part, since a sample lost to a
 * failure silences the lens it came from.
 *
 * No call is attributed to an iteration: any arithmetic from an attempt-counting
 * ordinal to an iteration breaks on the first retry. The scope is what a reader
 * joins on, and it names the stage.
 */

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export interface ExchangeListProps {
  invocations: readonly Invocation[];
  totals: InvocationTotals;
  /** Which invocation is open, by its first attempt's ordinal. */
  selectedOrdinal?: number | null;
  onSelect?: (ordinal: number) => void;
}

export function ExchangeList({
  invocations,
  totals,
  selectedOrdinal = null,
  onSelect,
}: ExchangeListProps) {
  if (invocations.length === 0) {
    return (
      <Text tone="muted" size="sm">
        No model call has been recorded at this point in the run.
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Stack direction="row" gap={2} align="center" wrap>
        <Heading level={2}>Model calls</Heading>
        <Badge tone="neutral">{totals.calls} calls</Badge>
        <Badge tone="neutral">{totals.attempts} attempts</Badge>
        {totals.retried > 0 && <Badge tone="medium">{totals.retried} retried</Badge>}
        {totals.failed > 0 && <Badge tone="critical">{totals.failed} still failed</Badge>}
        <Text as="span" tone="muted" size="sm">
          {seconds(totals.totalMs)} of model time
        </Text>
      </Stack>
      <Table aria-label="Model calls">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Outcome</th>
            <th>Attempts</th>
            <th>Time</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {invocations.map((call) => {
            const ordinal = call.attempts[0].ordinal;
            const selected = selectedOrdinal === ordinal;
            return (
              <tr key={`${call.scope}#${ordinal}`} aria-current={selected ? 'true' : undefined}>
                <td>
                  {onSelect === undefined ? (
                    <Text as="span" size="sm">
                      {call.scope}
                    </Text>
                  ) : (
                    <button type="button" onClick={() => onSelect(ordinal)}>
                      {call.scope}
                    </button>
                  )}
                </td>
                <td>
                  <Badge tone={OUTCOME_TONE[call.outcome]}>{call.outcome}</Badge>
                </td>
                <td>
                  {call.attempts.length}
                  {call.failures.length > 0 && (
                    <Text as="span" tone="muted" size="sm">
                      {' '}
                      after {call.failures.join(', ')}
                    </Text>
                  )}
                </td>
                <td>{seconds(call.totalMs)}</td>
                <td>{new Date(call.startedAt).toLocaleTimeString()}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Stack>
  );
}
