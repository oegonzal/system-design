import {
  clip,
  DASH,
  day,
  daysUntil,
  DUE_SOON_DAYS,
  TARGET_STAGES,
  type SaveTargetRequest,
  type Target,
  type TargetStage,
} from '@sysdesign/contracts';
import { Badge, Button, SelectField, Stack, Table, Text } from '@sysdesign/design-system';
import { Fragment } from 'react';

import { useLink } from '../../components/link-context';
import { Pager } from '../search/pager';
import { TARGET_KIND_TONE } from '../tones';
import {
  TARGET_ACTIVITY_KIND_LABEL,
  TARGET_CONTACT_ROLE_LABEL,
  TARGET_KIND_LABEL,
  targetHref,
} from './target-kinds';
import { TargetPanel } from './target-panel';

const COLUMNS = [
  'Kind',
  'Name',
  'Stage',
  'Reminder',
  'Ends',
  'Contact',
  'Next action',
  'Last activity',
  'Notes',
  'Tracking',
] as const;

/** The first contact kept, named with its role; a dash when none is. */
const contactOf = (target: Target): string => {
  const first = target.contacts[0];
  return first === undefined
    ? DASH
    : clip(`${first.name} · ${TARGET_CONTACT_ROLE_LABEL[first.role]}`, 40);
};

/** The latest thing logged, by when it happened; a dash when nothing was. */
const lastActivityOf = (target: Target): string => {
  const [last] = [...target.activity].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return last === undefined ? DASH : `${day(last.at)} ${TARGET_ACTIVITY_KIND_LABEL[last.kind]}`;
};

const editorIdOf = (id: string): string => `target-editor-${id}`;

export interface TargetsTableProps {
  rows: readonly Target[];
  total: number;
  limit: number;
  offset: number;
  /** The instant "due" counts from — fixed in stories, `Date.now()` in the app. */
  nowMs: number;
  onStageChange(target: Target, stage: TargetStage): void;
  /** The target open under its row, by id, or none. */
  editing?: string | null;
  onEdit(id: string | null): void;
  onSave(target: Target, request: SaveTargetRequest): void;
  onRemove(target: Target): void;
  onPage(offset: number): void;
  /** While a write is in flight. */
  saving?: boolean;
  /** Why the last write was refused — shown in the open panel. */
  error?: string | null;
}

/**
 * Every tracked firm and award: its name into its own page, its stage —
 * changed in the row, from its kind's own stages — its reminder, an award's
 * end as the warm last read it, who to reach, what to do next and what was
 * last done. The whole of it opens under the row, in the panel its own page
 * uses.
 */
export function TargetsTable({
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
  saving = false,
  error = null,
}: TargetsTableProps) {
  const Link = useLink();
  if (rows.length === 0) {
    return (
      <Text tone="muted" size="sm">
        Nothing tracked here yet. Open an award or a firm and track it from its page.
      </Text>
    );
  }
  return (
    <Stack gap={3}>
      <Table aria-label="Tracked firms and awards">
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
          {rows.map((target) => {
            const reminderDays = daysUntil(target.reminderAt, nowMs);
            const due = reminderDays !== null && reminderDays <= DUE_SOON_DAYS;
            const open = editing === target.id;
            return (
              <Fragment key={target.id}>
                <tr>
                  <td>
                    <Badge tone={TARGET_KIND_TONE[target.kind]}>
                      {TARGET_KIND_LABEL[target.kind]}
                    </Badge>
                  </td>
                  <th scope="row">
                    <Link href={targetHref(target)} $variant="inline">
                      {clip(target.label, 60)}
                    </Link>
                  </th>
                  <td>
                    {open ? (
                      // The open panel holds the stage: one control for one value.
                      target.stage
                    ) : (
                      <SelectField
                        label={`Stage of ${clip(target.label, 30)}`}
                        value={target.stage}
                        disabled={saving}
                        onChange={(event) =>
                          onStageChange(target, event.target.value as TargetStage)
                        }
                      >
                        {TARGET_STAGES[target.kind].map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </SelectField>
                    )}
                  </td>
                  <td>
                    {target.reminderAt === null ? (
                      DASH
                    ) : (
                      <Stack direction="row" gap={2} align="center">
                        <span>{day(target.reminderAt)}</span>
                        {due && <Badge tone="high">due</Badge>}
                      </Stack>
                    )}
                  </td>
                  <td>{day(target.endsAt)}</td>
                  <td>{contactOf(target)}</td>
                  <td>{target.nextAction.length > 0 ? clip(target.nextAction, 40) : DASH}</td>
                  <td>{lastActivityOf(target)}</td>
                  <td>{target.notes.length > 0 ? clip(target.notes, 50) : DASH}</td>
                  <td>
                    <Button
                      variant="subtle"
                      size="sm"
                      aria-expanded={open}
                      aria-controls={editorIdOf(target.id)}
                      aria-label={`${open ? 'Close' : 'Edit'} ${clip(target.label, 30)}`}
                      disabled={saving}
                      onClick={() => onEdit(open ? null : target.id)}
                    >
                      {open ? 'Close' : 'Edit'}
                    </Button>
                  </td>
                </tr>
                {open ? (
                  <tr id={editorIdOf(target.id)}>
                    <td colSpan={COLUMNS.length}>
                      <TargetPanel
                        kind={target.kind}
                        label={target.label}
                        target={target}
                        onSave={(request) => onSave(target, request)}
                        onRemove={() => onRemove(target)}
                        saving={saving}
                        error={error}
                        nowMs={nowMs}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
      <Pager offset={offset} limit={limit} total={total} onChange={onPage} disabled={saving} />
    </Stack>
  );
}
