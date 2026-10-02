import styled from '@emotion/styled';
import { Badge, Stack, Text } from '@sysdesign/design-system';

import { groupOf } from '../model/action';
import type { ChangeKind } from '../model/changes';
import type { TimelineEntry } from '../model/timeline';
import { ScopeChips } from './scope-chips';
import { CHANGE_TONE, PROVENANCE_TONE } from './tones';

/**
 * The rail: everything that happened, in order, one row per action.
 *
 * Rows are buttons rather than links because selecting one changes what the
 * detail pane shows, not where the reader is — the URL still carries the
 * selection, which the container writes. Each row says what happened, where,
 * what it changed and where the row itself came from, so the rail alone answers
 * most questions without the detail pane being opened.
 */

const List = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]}px;
`;

const RowButton = styled.button`
  all: unset;
  box-sizing: border-box;
  display: block;
  width: 100%;
  cursor: pointer;
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[3]}px`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid transparent;
  background: ${({ theme }) => theme.color.bg.surface};

  &:hover {
    border-color: ${({ theme }) => theme.color.border.default};
  }

  &[aria-current='true'] {
    background: ${({ theme }) => theme.color.bg.selected};
    color: ${({ theme }) => theme.color.text.onSelected};
    border-color: ${({ theme }) => theme.color.border.accent};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

const Ordinal = styled.span`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.text.muted};
`;

const when = (at: string | null): string =>
  at === null ? 'no recorded time' : new Date(at).toLocaleTimeString();

export interface ActionRow {
  entry: TimelineEntry;
  /** How many changes of each kind this action made. */
  counts: Record<ChangeKind, number>;
}

export interface ActionListProps {
  rows: readonly ActionRow[];
  selectedKey: string | null;
  onSelect(key: string): void;
  /** What to say when a filter leaves nothing. */
  emptyLabel?: string;
}

export function ActionList({
  rows,
  selectedKey,
  onSelect,
  emptyLabel = 'No actions match the filter.',
}: ActionListProps) {
  if (rows.length === 0) {
    return (
      <Text tone="muted" size="sm">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <List aria-label="Actions">
      {rows.map(({ entry, counts }) => {
        const selected = entry.action.key === selectedKey;
        return (
          <li key={entry.action.key}>
            <RowButton
              type="button"
              aria-current={selected}
              onClick={() => onSelect(entry.action.key)}
            >
              <Stack gap={1}>
                <Stack direction="row" gap={2} align="baseline" wrap>
                  <Ordinal>#{entry.ordinal + 1}</Ordinal>
                  <Badge tone="neutral">{groupOf(entry.action.type)}</Badge>
                  <Text as="span" size="sm">
                    {entry.action.label}
                  </Text>
                </Stack>
                <Stack direction="row" gap={2} align="center" wrap>
                  <ScopeChips scope={entry.action.scope} />
                  {(['added', 'removed', 'updated', 'moved'] as const).map((kind) =>
                    counts[kind] === 0 ? null : (
                      <Badge key={kind} tone={CHANGE_TONE[kind]}>
                        {kind} {counts[kind]}
                      </Badge>
                    ),
                  )}
                  {entry.corrected && <Badge tone="high">corrected</Badge>}
                  <Badge tone={PROVENANCE_TONE[entry.provenance]}>{entry.provenance}</Badge>
                  <Text as="span" tone="muted" size="sm">
                    {when(entry.at)}
                  </Text>
                </Stack>
              </Stack>
            </RowButton>
          </li>
        );
      })}
    </List>
  );
}
