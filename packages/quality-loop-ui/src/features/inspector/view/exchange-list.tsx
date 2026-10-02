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
  /**
   * True when these are the run's calls rather than the calls as of one action —
   * which is the only honest reading, since a call cannot be placed in the loop's
   * order. Says so, so a reader scrubbing the rail is not misled.
   */
  wholeRun?: boolean;
  /** Which call is open, by the two fields that identify one. */
  selected?: { runId: string; ordinal: number } | null;
  onSelect?: (call: Invocation) => void;
}

export function ExchangeList({
  invocations,
  totals,
  wholeRun = false,
  selected = null,
  onSelect,
}: ExchangeListProps) {
  if (invocations.length === 0) {
    // The panel still names itself: a heading that appears only when there is
    // something to list leaves the empty state with no context at all.
    return (
      <Stack gap={2}>
        <Heading level={2}>Model calls</Heading>
        <Text tone="muted" size="sm">
          This run recorded no model call. A run that failed before it asked anything, or one whose
          calls were never written, both read this way.
        </Text>
      </Stack>
    );
  }
  // An orchestration's log holds several runs' calls, so the run is a column
  // only when there is more than one of them to tell apart.
  const runs = new Set(invocations.map((call) => call.runId));
  const showRun = runs.size > 1;
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
      {wholeRun && (
        <Text tone="secondary" size="sm">
          Every call this run made, wherever you are in the rail. A call&apos;s ordinal counts
          attempts rather than iterations, so no call can be placed in the loop&apos;s order — which
          is why these are not filtered to the selected action.
        </Text>
      )}
      <Table aria-label="Model calls">
        <thead>
          <tr>
            {showRun && <th>Run</th>}
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
            const open = selected?.runId === call.runId && selected.ordinal === ordinal;
            return (
              <tr
                key={`${call.runId}#${call.scope}#${ordinal}`}
                aria-current={open ? 'true' : undefined}
              >
                {showRun && (
                  <td>
                    <Text as="span" tone="muted" size="sm">
                      …{call.runId.slice(-12)}
                    </Text>
                  </td>
                )}
                <td>
                  {onSelect === undefined ? (
                    <Text as="span" size="sm">
                      {call.scope}
                    </Text>
                  ) : (
                    <button type="button" onClick={() => onSelect(call)}>
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
