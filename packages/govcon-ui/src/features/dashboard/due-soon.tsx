import { day, daysUntil, DUE_SOON_DAYS, type PipelineRow } from '@sysdesign/contracts';
import { Badge, Heading, Stack, Table, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { BID_STAGE_TONE } from '../tones';

export interface DueSoonProps {
  rows: readonly PipelineRow[];
  /** The instant "days left" counts from — fixed in stories, `Date.now()` in the app. */
  nowMs: number;
}

/** Due inside the week by reminder or by deadline, or already past. */
export const isDueSoon = (row: PipelineRow, nowMs: number): boolean =>
  [row.bid.reminderAt, row.lead.opportunity.responseDeadlineAt].some((mark) => {
    const days = daysUntil(mark, nowMs);
    return days !== null && days <= DUE_SOON_DAYS;
  });

const leftLabel = (days: number | null): string =>
  days === null ? '—' : days < 0 ? `${-days} day(s) ago` : days === 0 ? 'today' : `${days} day(s)`;

/** Tracked notices with a reminder or a deadline inside the week — what to do first. */
export function DueSoon({ rows, nowMs }: DueSoonProps) {
  const Link = useLink();
  const due = rows.filter((row) => isDueSoon(row, nowMs));
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
                    <Link href={`/notices/${encodeURIComponent(bid.noticeId)}`} $variant="inline">
                      {o.title}
                    </Link>
                  </td>
                  <td>{day(o.responseDeadlineAt)}</td>
                  <td>{day(bid.reminderAt)}</td>
                  <td>{leftLabel(Number.isFinite(left) ? left : null)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Stack>
  );
}
