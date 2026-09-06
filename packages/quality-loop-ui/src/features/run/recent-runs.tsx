import styled from '@emotion/styled';
import type { QualityRunSummaryDto } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Text } from '@sysdesign/design-system';

import { DECISION_TONE, STATUS_TONE } from '../results/tones';

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.sm};

  th,
  td {
    text-align: left;
    padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[3]}px`};
    border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
    vertical-align: top;
  }

  th {
    color: ${({ theme }) => theme.color.text.secondary};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
`;

const RowButton = styled.button`
  all: unset;
  cursor: pointer;
  color: ${({ theme }) => theme.color.accent.default};
  text-decoration: underline;

  &[aria-current='true'] {
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    text-decoration: none;
    color: ${({ theme }) => theme.color.text.primary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

export interface RecentRunsProps {
  runs: readonly QualityRunSummaryDto[];
  activeRunId: string | null;
  onSelect(runId: string): void;
}

const when = (iso: string): string => new Date(iso).toLocaleString();

/** Newest first, as the service lists them; a click reopens the run in place. Presentational. */
export function RecentRuns({ runs, activeRunId, onSelect }: RecentRunsProps) {
  return (
    <Stack gap={4}>
      <Heading level={2}>Recent runs</Heading>
      {runs.length === 0 ? (
        <Text tone="muted" size="sm">
          No runs yet.
        </Text>
      ) : (
        <Table aria-label="Recent runs">
          <thead>
            <tr>
              <th>Started</th>
              <th>Pipeline</th>
              <th>Outcome</th>
              <th>Overall</th>
              <th>Iterations</th>
              <th>Criteria</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId}>
                <td>
                  <RowButton
                    type="button"
                    aria-current={run.runId === activeRunId}
                    onClick={() => onSelect(run.runId)}
                  >
                    {when(run.startedAt)}
                  </RowButton>
                </td>
                <td>
                  {run.pipeline}
                  {run.pipelineVersion ? `@${run.pipelineVersion}` : ''}
                </td>
                <td>
                  {run.finalDecision ? (
                    <Badge tone={DECISION_TONE[run.finalDecision]}>{run.finalDecision}</Badge>
                  ) : (
                    <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
                  )}
                </td>
                <td>{run.overall === null ? '—' : Math.round(run.overall)}</td>
                <td>{run.iterations}</td>
                <td>{run.criteria}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Stack>
  );
}
