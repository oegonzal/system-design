'use client';

import type { QualityRunDto } from '@sysdesign/contracts';
import { Badge, Heading, Spinner, Stack, Table, Text } from '@sysdesign/design-system';
import { useEffect, useState } from 'react';

import { OUTCOME_TONE, STATUS_TONE } from '../results/tones';

/** `m:ss` — long enough for a loop of several model calls, never wider. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A once-a-second clock while the run is live; frozen once it is not. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

const time = (iso: string): string => new Date(iso).toLocaleTimeString();

export interface RunProgressProps {
  run: QualityRunDto;
}

/**
 * What the record says while (and after) the loop runs: its status, how long
 * it has taken, which model answered, and every exchange as it is attributed.
 * The trace only exists once the loop ends, so the exchange log is the live
 * signal — each scope names the stage and sample that made the call.
 */
export function RunProgress({ run }: RunProgressProps) {
  const live = run.status === 'running';
  const now = useNow(live);
  const end = run.finishedAt === null ? now : Date.parse(run.finishedAt);
  const elapsed = formatElapsed(end - Date.parse(run.startedAt));

  return (
    <Stack gap={4}>
      <Stack direction="row" gap={3} align="center" wrap>
        <Heading level={2}>Run</Heading>
        <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
        {live && <Spinner label="Run in progress" />}
        <Text as="span" tone="secondary">
          {run.pipeline} · {run.request.maxIterations} iteration
          {run.request.maxIterations === 1 ? '' : 's'} · elapsed{' '}
          <span data-testid="elapsed">{elapsed}</span>
        </Text>
      </Stack>
      <Text tone="muted" size="sm">
        {`Model: ${run.llm.model ?? 'not recorded'}`}
        {run.error ? ` · ${run.error.name}: ${run.error.message}` : ''}
      </Text>
      {run.exchanges.length > 0 ? (
        <Table aria-label="Model exchanges">
          <thead>
            <tr>
              <th>#</th>
              <th>Scope</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {run.exchanges.map((exchange, index) => (
              <tr key={`${exchange.scope}.${exchange.ordinal}`}>
                <td>{index + 1}</td>
                <td>
                  {exchange.scope}
                  {exchange.ordinal > 1 ? ` (call ${exchange.ordinal})` : ''}
                </td>
                <td>
                  <Badge tone={OUTCOME_TONE[exchange.outcome]}>{exchange.outcome}</Badge>
                </td>
                <td>{formatElapsed(exchange.durationMs)}</td>
                <td>{time(exchange.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Text tone="muted" size="sm">
          No model exchanges yet.
        </Text>
      )}
    </Stack>
  );
}
