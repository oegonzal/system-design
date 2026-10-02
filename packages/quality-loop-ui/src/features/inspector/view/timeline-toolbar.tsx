import { Badge, Button, CheckboxField, Stack, Text, Toolbar } from '@sysdesign/design-system';

import { ACTION_GROUPS, type ActionGroup } from '../model/action';

/**
 * What the rail shows, and whether it keeps up with a live run.
 *
 * The filters are generated from the action table rather than written out, so a
 * new kind of action appears here the moment it is declared. Following is
 * detached by *selecting* a row, never by scrolling: a scroll heuristic fights
 * momentum scrolling on a trackpad and detaches people who were only reading.
 */

export interface TimelineToolbarProps {
  /** The groups the log actually holds, in declared order. */
  available: readonly ActionGroup[];
  shown: ReadonlySet<ActionGroup>;
  onToggleGroup(group: ActionGroup): void;
  ignoreTimings: boolean;
  onIgnoreTimings(next: boolean): void;
  /** Null when there is no live run to follow. */
  following: boolean | null;
  /** Entries appended since the reader detached. */
  behind: number;
  onFollow(): void;
  total: number;
  shownCount: number;
  dropped: number;
}

const LABELS = Object.keys(ACTION_GROUPS) as ActionGroup[];

export function TimelineToolbar({
  available,
  shown,
  onToggleGroup,
  ignoreTimings,
  onIgnoreTimings,
  following,
  behind,
  onFollow,
  total,
  shownCount,
  dropped,
}: TimelineToolbarProps) {
  const groups = LABELS.filter((group) => available.includes(group));
  return (
    <Stack gap={3}>
      <Toolbar aria-label="Timeline controls">
        <Stack direction="row" gap={3} align="center" wrap>
          {groups.map((group) => (
            <CheckboxField
              key={group}
              label={group}
              checked={shown.has(group)}
              onChange={() => onToggleGroup(group)}
            />
          ))}
        </Stack>
        <Stack direction="row" gap={3} align="center" wrap>
          <CheckboxField
            label="Ignore timings"
            checked={ignoreTimings}
            onChange={(event) => onIgnoreTimings(event.target.checked)}
          />
          {following === false && (
            <Button variant="subtle" onClick={onFollow}>
              Jump to latest{behind > 0 ? ` (${behind} new)` : ''}
            </Button>
          )}
          {following === true && <Badge tone="accent">following</Badge>}
        </Stack>
      </Toolbar>
      <Text tone="muted" size="sm">
        {shownCount} of {total} actions shown
        {dropped > 0 ? ` · ${dropped} older actions trimmed from this view` : ''}
      </Text>
    </Stack>
  );
}
