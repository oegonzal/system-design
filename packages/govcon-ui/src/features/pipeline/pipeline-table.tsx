import {
  agencyOf,
  BID_STAGES,
  clip,
  compactMoney,
  day,
  daysLeftLabel,
  daysUntil,
  DUE_SOON_DAYS,
  rangeLabel,
  type BidStage,
  type PipelineRow,
  type SaveBidRequest,
} from '@sysdesign/contracts';
import { Badge, Button, SelectField, Stack, Table, Text } from '@sysdesign/design-system';
import { Fragment } from 'react';

import { useLink } from '../../components/link-context';
import { BidPanel } from '../notice/bid-panel';
import { noticeHref } from '../notice-href';
import { BID_STAGE_TONE, TIER_TONE } from '../tones';

const COLUMNS = [
  'Title',
  'Agency',
  'Deadline',
  'Left',
  'Reminder',
  'Score',
  'Estimate',
  'Stage',
  'Notes',
  'Bid',
] as const;

const editorIdOf = (noticeId: string): string => `bid-editor-${noticeId}`;

export interface PipelineTableProps {
  rows: readonly PipelineRow[];
  total: number;
  limit: number;
  offset: number;
  /** The instant "days left" counts from — fixed in stories, `Date.now()` in the app. */
  nowMs: number;
  onStageChange(noticeId: string, stage: BidStage): void;
  /** The notice whose bid is open under its row, or none. */
  editing?: string | null;
  onEdit(noticeId: string | null): void;
  onSave(noticeId: string, request: SaveBidRequest): void;
  onRemove(noticeId: string): void;
  onPage(offset: number): void;
  /** The notice whose bid is being written. */
  saving?: string | null;
  /** Why the last write was refused — shown in the open bid. */
  error?: string | null;
}

/**
 * Every tracked notice: its title into the notice, when it is due, how it
 * scores, and its bid. The stage changes in the row; the whole bid — stage,
 * reminder, estimate and notes — opens under the row and is written from
 * there, by the same panel the notice page uses.
 */
export function PipelineTable({
  rows,
  total,
  limit,
  offset,
  nowMs,
  onStageChange,
  editing = null,
  onEdit,
  onSave,
  onRemove,
  onPage,
  saving = null,
  error = null,
}: PipelineTableProps) {
  const Link = useLink();
  return (
    <Stack gap={3}>
      <Text tone="secondary" size="sm">
        {total} tracked · showing {rangeLabel(offset, rows.length, total)}
      </Text>
      {rows.length === 0 ? (
        <Text tone="muted" size="sm">
          Nothing tracked here yet — open a notice and track it.
        </Text>
      ) : (
        <Table aria-label="Pipeline">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ bid, lead }) => {
              const o = lead.opportunity;
              const reminderDays = daysUntil(bid.reminderAt, nowMs);
              const due = reminderDays !== null && reminderDays <= DUE_SOON_DAYS;
              const open = editing === bid.noticeId;
              return (
                <Fragment key={bid.noticeId}>
                  <tr>
                    <td>
                      <Link href={noticeHref(bid.noticeId)} $variant="inline">
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
                    <td>{compactMoney(bid.estimatedValue)}</td>
                    <td>
                      {open ? (
                        // The open bid holds the stage: one control for one value.
                        <Badge tone={BID_STAGE_TONE[bid.stage]}>{bid.stage}</Badge>
                      ) : (
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
                      )}
                    </td>
                    <td>{bid.notes.length > 0 ? clip(bid.notes, 50) : '—'}</td>
                    <td>
                      <Button
                        variant="subtle"
                        size="sm"
                        aria-expanded={open}
                        aria-controls={editorIdOf(bid.noticeId)}
                        aria-label={`${open ? 'Close' : 'Edit'} the bid on ${clip(o.title, 30)}`}
                        disabled={saving !== null}
                        onClick={() => onEdit(open ? null : bid.noticeId)}
                      >
                        {open ? 'Close' : 'Edit'}
                      </Button>
                    </td>
                  </tr>
                  {open ? (
                    <tr id={editorIdOf(bid.noticeId)}>
                      <td colSpan={COLUMNS.length}>
                        <BidPanel
                          bid={bid}
                          onSave={(request) => onSave(bid.noticeId, request)}
                          onRemove={() => onRemove(bid.noticeId)}
                          saving={saving !== null}
                          error={error}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
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
