import type { QualityRunSummaryDto } from '@sysdesign/contracts';
import { Badge, DECISION_TONE, Stack, Table, Text } from '@sysdesign/design-system';

import type { LinkComponent } from '../../components/link-context';
import { STATUS_TONE } from '../results/tones';

export interface RunPickerProps {
  runs: readonly QualityRunSummaryDto[];
  selectedRunId: string | null;
  /** The link to the inspector pointed at one run — built by the caller, so this stays pure. */
  hrefFor(runId: string): string;
  /** The app's routed anchor, injected so a story renders a plain one. */
  link: LinkComponent;
}

const when = (iso: string): string => new Date(iso).toLocaleString();

/** The runs available to inspect, newest first as the service lists them. Presentational. */
export function RunPicker({ runs, selectedRunId, hrefFor, link: Link }: RunPickerProps) {
  if (runs.length === 0) {
    return (
      <Text tone="muted" size="sm">
        No runs to inspect yet.
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Table aria-label="Runs to inspect">
        <thead>
          <tr>
            <th>Started</th>
            <th>Pipeline</th>
            <th>Status</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId}>
              <td>
                <Link
                  href={hrefFor(run.runId)}
                  aria-current={run.runId === selectedRunId ? 'page' : undefined}
                >
                  {when(run.startedAt)}
                </Link>
              </td>
              <td>{run.pipeline}</td>
              <td>
                <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
              </td>
              <td>
                {run.finalDecision ? (
                  <Badge tone={DECISION_TONE[run.finalDecision]}>{run.finalDecision}</Badge>
                ) : (
                  <Text as="span" tone="muted" size="sm">
                    —
                  </Text>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Stack>
  );
}
