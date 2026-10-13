import {
  day,
  daysLeftLabel,
  daysUntil,
  DUE_SOON_DAYS,
  isDueSoonAt,
  type PipelineRow,
} from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { noticeHref } from '../notice-href';
import { BID_STAGE_TONE } from '../tones';

export interface DueSoonProps {
  rows: readonly PipelineRow[];
  /** The instant "days left" counts from — fixed in stories, `Date.now()` in the app. */
  nowMs: number;
}

/** Tracked notices with a reminder or a deadline inside the week — what to do first. */
export function DueSoon({ rows, nowMs }: DueSoonProps) {
  const Link = useLink();
  const due = rows.filter(({ bid, lead }) =>
    isDueSoonAt([bid.reminderAt, lead.opportunity.responseDeadlineAt], nowMs),
  );
  return (
    <Stack gap={3}>
      <Heading level={2}>Due this week</Heading>
      {due.length === 0 ? (
        <Text tone="muted" size="sm">
          Nothing due inside {DUE_SOON_DAYS} days.
        </Text>
      ) : (
        <Table aria-label="Due this week">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Title</th>
              <th>Deadline</th>
              <th>Reminder</th>
              <th>Left</th>
            </tr>
          </thead>
          <tbody>
            {due.map(({ bid, lead }) => {
              const o = lead.opportunity;
              const left = Math.min(
                ...[
                  daysUntil(bid.reminderAt, nowMs),
                  daysUntil(o.responseDeadlineAt, nowMs),
                ].filter((days): days is number => days !== null),
              );
              return (
                <tr key={bid.noticeId}>
                  <td>
                    <Badge tone={BID_STAGE_TONE[bid.stage]}>{bid.stage}</Badge>
                  </td>
                  <td>
                    <Link href={noticeHref(bid.noticeId)} $variant="inline">
                      {o.title}
                    </Link>
                  </td>
                  <td>{day(o.responseDeadlineAt)}</td>
                  <td>{day(bid.reminderAt)}</td>
                  <td>{daysLeftLabel(Number.isFinite(left) ? left : null)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Stack>
  );
}
