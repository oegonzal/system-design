import styled from '@emotion/styled';

/**
 * A data table's plane: full width, collapsed borders, the body font at the
 * small size, left-aligned cells with a quiet rule between rows and muted,
 * semibold headers.
 *
 * Only the look. Columns, captions, sorting and the empty state are the
 * consumer's — a table with no rows is a `Text` line saying so, never a header
 * row over nothing (which reads as broken and fails accessibility checks).
 * Give it an `aria-label` so the table can be found by name.
 */
export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.sm};

  th,
  td {
    text-align: left;
    padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[3]}px`};
    border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
    vertical-align: top;
  }

  th {
    color: ${({ theme }) => theme.color.text.secondary};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
`;
