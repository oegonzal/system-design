import styled from '@emotion/styled';
import { Badge, Stack, Table, Text } from '@sysdesign/design-system';

import type { JsonChange } from '../model/changes';
import { JsonTransition } from './json-value';
import { CHANGE_TONE } from './tones';

/**
 * Every change one action made, as a flat path-addressed list.
 *
 * This is the delta's own answer, decoded once and not interpreted: it is the
 * authority on *what* changed. The tree beside it is the authority on context —
 * what a change sits among — which a delta structurally cannot say.
 */

const Path = styled.code`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  overflow-wrap: anywhere;
`;

export interface ChangeListProps {
  changes: readonly JsonChange[];
  /** What to say when an action changed nothing. */
  emptyLabel?: string;
}

export function ChangeList({
  changes,
  emptyLabel = 'This action changed nothing in the state.',
}: ChangeListProps) {
  if (changes.length === 0) {
    return (
      <Text tone="muted" size="sm">
        {emptyLabel}
      </Text>
    );
  }
  return (
    <Table aria-label="Changes">
      <thead>
        <tr>
          <th>Change</th>
          <th>Path</th>
          <th>Before → after</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          // A delta names one change of a given kind per path, so the two
          // together identify the row — a move and the modification of the
          // element that moved are two kinds at one path.
          <tr key={`${change.kind}:${change.path}`}>
            <td>
              <Stack direction="row" gap={2} align="center" wrap>
                {/* The word, not only the colour. */}
                <Badge tone={CHANGE_TONE[change.kind]}>{change.kind}</Badge>
                {change.whole && <Badge tone="low">whole subtree</Badge>}
              </Stack>
            </td>
            <td>
              <Path>{change.path === '' ? '(root)' : change.path}</Path>
              {change.kind === 'moved' && (
                <Text as="span" tone="muted" size="sm">
                  {' '}
                  index {change.fromIndex} → {change.toIndex}
                </Text>
              )}
            </td>
            <td>
              {change.kind === 'moved' ? (
                <Text as="span" tone="muted" size="sm">
                  value unchanged
                </Text>
              ) : (
                <JsonTransition before={change.before} after={change.after} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
