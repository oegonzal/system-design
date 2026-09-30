import {
  describeQuery,
  summarizePull,
  type PullReport as PullReportDto,
} from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { SLICE_OUTCOME_TONE } from '../tones';

export interface PullReportProps {
  report: PullReportDto;
}

/** One row per slice: what was asked, how it went, what it stored. */
export function PullReport({ report }: PullReportProps) {
  return (
    <Stack gap={3}>
      <Heading level={3}>
        Pull · {report.profile} · posted {report.window.from} to {report.window.to}
      </Heading>
      <Table aria-label="Pull report">
        <thead>
          <tr>
            <th>Outcome</th>
            <th>Slice</th>
            <th>Pages</th>
            <th>Received</th>
            <th>Inserted</th>
            <th>Updated</th>
            <th>Rejected</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {report.slices.map((slice) => (
            <tr key={describeQuery(slice.query)}>
              <td>
                <Badge tone={SLICE_OUTCOME_TONE[slice.outcome]}>{slice.outcome}</Badge>
              </td>
              <td>{describeQuery(slice.query)}</td>
              <td>{slice.pages}</td>
              <td>{slice.received}</td>
              <td>{slice.inserted}</td>
              <td>{slice.updated}</td>
              <td>{slice.rejected}</td>
              <td>
                {slice.truncated ? 'truncated' : ''}
                {slice.truncated && slice.detail ? ' · ' : ''}
                {slice.detail ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Text tone="secondary" size="sm">
        {summarizePull(report)}
      </Text>
    </Stack>
  );
}
