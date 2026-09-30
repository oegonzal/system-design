import {
  agencyOf,
  BID_STAGES,
  clip,
  day,
  daysLeftLabel,
  daysUntil,
  DUE_SOON_DAYS,
  type BidStage,
  type PipelineRow,
} from '@sysdesign/contracts';
import { Badge, Button, SelectField, Stack, Table, Text } from '@sysdesign/design-system';

import { useLink } from '../../components/link-context';
import { TIER_TONE } from '../tones';

export interface PipelineTableProps {
  rows: readonly PipelineRow[];
  total: number;
  limit: number;
  offset: number;
  /** The instant "days left" counts from — fixed in stories, `Date.now()` in the app. */
  nowMs: number;
  onStageChange(noticeId: string, stage: BidStage): void;
  onPage(offset: number): void;
  /** The notice whose stage is being written. */
  saving?: string | null;
}

/** Every tracked notice: its title into the notice, when it is due, how it scores, and its stage — editable in place. */
export function PipelineTable({
  rows,
  total,
  limit,
  offset,
  nowMs,
  onStageChange,
  onPage,
  saving = null,
}: PipelineTableProps) {
  const Link = useLink();
  return (
    <Stack gap={3}>
      <Text tone="secondary" size="sm">
        {total} tracked · showing {rows.length} from {offset}
      </Text>
      {rows.length === 0 ? (
        <Text tone="muted" size="sm">
          Nothing tracked here yet — open a notice and track it.
        </Text>
      ) : (
        <Table aria-label="Pipeline">
          <thead>
            <tr>
              <th>Title</th>
              <th>Agency</th>
              <th>Deadline</th>
              <th>Left</th>
              <th>Reminder</th>
              <th>Score</th>
              <th>Stage</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ bid, lead }) => {
              const o = lead.opportunity;
              const reminderDays = daysUntil(bid.reminderAt, nowMs);
              const due = reminderDays !== null && reminderDays <= DUE_SOON_DAYS;
              return (
                <tr key={bid.noticeId}>
                  <td>
                    <Link href={`/notices/${encodeURIComponent(bid.noticeId)}`} $variant="inline">
                      {clip(o.title, 60)}
                    </Link>
                  </td>
                  <td>{clip(agencyOf(o.agencyPath), 30)}</td>
                  <td>{day(o.responseDeadlineAt)}</td>
                  <td>{daysLeftLabel(daysUntil(o.responseDeadlineAt, nowMs))}</td>
                  <td>
                    {bid.reminderAt === null ? (
                      '—'
                    ) : (
                      <Stack direction="row" gap={2} align="center">
                        <span>{day(bid.reminderAt)}</span>
                        {due && <Badge tone="high">due</Badge>}
                      </Stack>
                    )}
                  </td>
                  <td>
                    {lead.tier ? (
                      <Badge tone={TIER_TONE[lead.tier]}>
                        {lead.score.toFixed(1)} {lead.tier}
                      </Badge>
                    ) : (
                      'excluded'
                    )}
                  </td>
                  <td>
                    <SelectField
                      label={`Stage of ${clip(o.title, 30)}`}
                      value={bid.stage}
                      disabled={saving !== null}
                      onChange={(event) =>
                        onStageChange(bid.noticeId, event.target.value as BidStage)
                      }
                    >
                      {BID_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </SelectField>
                  </td>
                  <td>{bid.notes.length > 0 ? clip(bid.notes, 50) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {total > limit && (
        <Stack direction="row" gap={3} align="center">
          <Button
            variant="subtle"
            size="sm"
            disabled={offset === 0}
            onClick={() => onPage(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <Button
            variant="subtle"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => onPage(offset + limit)}
          >
            Next
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
