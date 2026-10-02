import type { OrchestrationRunDto } from '@sysdesign/contracts';
import { Badge, Stack, Table, Text } from '@sysdesign/design-system';

import type { LinkComponent } from '../../components/link-context';
import { STATUS_TONE } from '../results/tones';

/** The orchestrations available to inspect, newest first as the service lists them. Presentational. */

export interface OrchestrationPickerProps {
  orchestrations: readonly OrchestrationRunDto[];
  selectedId: string | null;
  hrefFor(orchestrationRunId: string): string;
  link: LinkComponent;
}

const when = (iso: string): string => new Date(iso).toLocaleString();

const stepCounts = (record: OrchestrationRunDto): string => {
  const steps = Object.values(record.steps);
  const done = steps.filter((step) => step.status === 'complete').length;
  return `${done} of ${steps.length} complete`;
};

export function OrchestrationPicker({
  orchestrations,
  selectedId,
  hrefFor,
  link: Link,
}: OrchestrationPickerProps) {
  if (orchestrations.length === 0) {
    return (
      <Text tone="muted" size="sm">
        No orchestration has run yet.
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Table aria-label="Orchestrations to inspect">
        <thead>
          <tr>
            <th>Started</th>
            <th>Orchestrator</th>
            <th>Target</th>
            <th>Status</th>
            <th>Steps</th>
          </tr>
        </thead>
        <tbody>
          {orchestrations.map((record) => (
            <tr key={record.orchestrationRunId}>
              <td>
                <Link
                  href={hrefFor(record.orchestrationRunId)}
                  aria-current={record.orchestrationRunId === selectedId ? 'page' : undefined}
                >
                  {when(record.startedAt)}
                </Link>
              </td>
              <td>{record.orchestrator}</td>
              <td>
                {record.pipeline ?? (
                  <Text as="span" tone="muted" size="sm">
                    chooses its own
                  </Text>
                )}
              </td>
              <td>
                <Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge>
              </td>
              <td>{stepCounts(record)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Stack>
  );
}
