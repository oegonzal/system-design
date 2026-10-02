import styled from '@emotion/styled';
import { Badge, Stack, Text } from '@sysdesign/design-system';

import { printPath, type JsonChange, type PathSegment } from '../model/changes';
import { identityOf, isOpaquePath } from '../model/object-hash';
import { isContainer, JsonValue } from './json-value';
import { CHANGE_TONE } from './tones';

/**
 * The state as a nested tree, with the changes decorated onto it.
 *
 * The tree exists for the one thing a delta cannot give: context. A change list
 * says `ledger.criteria[criterion:c2].result` went fail → pass; the tree shows
 * it sitting beside the criterion that did not move, which is how a reader
 * judges whether the change is the whole story.
 *
 * Disclosure is `<details>`/`<summary>` rather than a `role="tree"` widget:
 * nested details already give keyboard operation, expanded state and a reading
 * order that works, where a custom tree would mean reimplementing all three.
 * Branches holding a change open themselves, so nothing has to be hunted for.
 */

const Row = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[2]}px;
  flex-wrap: wrap;
  padding: 1px 0;
`;

const Key = styled.code`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.text.secondary};
`;

const Branch = styled.details`
  margin: 0;

  > summary {
    cursor: pointer;
    list-style: revert;
  }

  > div {
    padding-left: ${({ theme }) => theme.space[4]}px;
    border-left: 1px solid ${({ theme }) => theme.color.border.subtle};
    margin-left: ${({ theme }) => theme.space[2]}px;
  }
`;

/** The members of a container, as [key segment, value] pairs in the order they are held. */
function membersOf(value: unknown): [PathSegment, unknown][] {
  if (Array.isArray(value)) {
    return value.map((item, index) => [
      { label: identityOf(item, index) ?? String(index), kind: 'element' as const },
      item,
    ]);
  }
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    { label: key, kind: 'property' as const },
    item,
  ]);
}

/** Every path a change touches, and every path on the way to one. */
export function changedPaths(changes: readonly JsonChange[]): {
  at: Map<string, JsonChange>;
  within: Set<string>;
} {
  const at = new Map<string, JsonChange>();
  const within = new Set<string>();
  for (const change of changes) {
    at.set(change.path, change);
    let prefix: PathSegment[] = [];
    for (const segment of change.segments) {
      within.add(printPath(prefix));
      prefix = [...prefix, segment];
    }
  }
  return { at, within };
}

interface NodeProps {
  /** The segment this node is held under; null at the root. */
  segment: PathSegment | null;
  value: unknown;
  /** The full path to this node — carried as segments, since a printed path cannot be split back. */
  segments: PathSegment[];
  at: Map<string, JsonChange>;
  within: Set<string>;
  depth: number;
}

function Node({ segment, value, segments, at, within, depth }: NodeProps) {
  const printed = printPath(segments);
  const change = at.get(printed);
  const opaque = isOpaquePath(segments.map((part) => part.label));
  const label = segment === null ? '(state)' : segment.label;

  const chips = (
    <>
      {change !== undefined && <Badge tone={CHANGE_TONE[change.kind]}>{change.kind}</Badge>}
      {opaque && <Badge tone="low">another layer&apos;s shape</Badge>}
    </>
  );

  if (!isContainer(value)) {
    return (
      <Row>
        <Key>{label}</Key>
        <JsonValue value={value} />
        {chips}
      </Row>
    );
  }

  const members = membersOf(value);
  return (
    <Branch open={depth === 0 || within.has(printed) || change !== undefined}>
      <summary>
        <Row as="span">
          <Key>{label}</Key>
          <JsonValue value={value} />
          {chips}
        </Row>
      </summary>
      <div>
        {members.length === 0 ? (
          <Text tone="muted" size="sm">
            empty
          </Text>
        ) : (
          members.map(([member, child]) => (
            <Node
              key={member.label}
              segment={member}
              value={child}
              segments={[...segments, member]}
              at={at}
              within={within}
              depth={depth + 1}
            />
          ))
        )}
      </div>
    </Branch>
  );
}

export interface JsonTreeProps {
  value: unknown;
  changes: readonly JsonChange[];
  label?: string;
}

export function JsonTree({ value, changes, label = 'State' }: JsonTreeProps) {
  const { at, within } = changedPaths(changes);
  return (
    <Stack gap={2} aria-label={label}>
      <Node segment={null} value={value} segments={[]} at={at} within={within} depth={0} />
    </Stack>
  );
}
