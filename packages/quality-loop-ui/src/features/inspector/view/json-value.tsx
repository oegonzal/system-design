import styled from '@emotion/styled';
import { Text } from '@sysdesign/design-system';

/**
 * One JSON scalar, or a one-line summary of a container.
 *
 * Type is carried by shape rather than by colour alone — a string is quoted, a
 * null reads `null`, a container says how many members it has — so the value is
 * unambiguous in a screenshot, in high contrast, and read aloud.
 */

const Mono = styled.code`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  overflow-wrap: anywhere;
`;

const Quiet = styled(Mono)`
  color: ${({ theme }) => theme.color.text.muted};
`;

/** A container as one line: `{3 keys}`, `[5]`. Never the contents. */
export function summarise(value: unknown): string | null {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).length;
    return `{${keys} ${keys === 1 ? 'key' : 'keys'}}`;
  }
  return null;
}

/** Whether a value has members worth opening. */
export const isContainer = (value: unknown): boolean => value !== null && typeof value === 'object';

export interface JsonValueProps {
  value: unknown;
  /** Absent means the value is not there at all, which is not the same as `null`. */
  absent?: boolean;
}

export function JsonValue({ value, absent = false }: JsonValueProps) {
  if (absent) return <Quiet>—</Quiet>;
  const container = summarise(value);
  if (container !== null) return <Quiet>{container}</Quiet>;
  if (value === null) return <Quiet>null</Quiet>;
  if (typeof value === 'string') return <Mono>&quot;{value}&quot;</Mono>;
  return <Mono>{String(value)}</Mono>;
}

/** A before → after pair on one line, each side labelled by what it is. */
export function JsonTransition({ before, after }: { before?: unknown; after?: unknown }) {
  return (
    <Text as="span" size="sm">
      <JsonValue value={before} absent={before === undefined} /> →{' '}
      <JsonValue value={after} absent={after === undefined} />
    </Text>
  );
}
