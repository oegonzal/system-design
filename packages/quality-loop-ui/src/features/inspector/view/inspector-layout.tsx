import styled from '@emotion/styled';
import type { ReactNode } from 'react';

/**
 * The rail beside the detail pane, stacking to one column when there is not
 * room for two.
 *
 * A fixed split rather than a draggable one: a drag handle is a real
 * accessibility project — keyboard resizing, an announced value, a persisted
 * preference — and this data does not earn it.
 */

const Split = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.space[5]}px;
  align-items: start;

  ${({ theme }) => theme.media.lg} {
    grid-template-columns: minmax(0, 7fr) minmax(0, 9fr);
  }
`;

const Column = styled.div`
  min-width: 0;
`;

const Rail = styled(Column)`
  ${({ theme }) => theme.media.lg} {
    position: sticky;
    top: ${({ theme }) => theme.space[4]}px;
    max-height: calc(100dvh - ${({ theme }) => theme.space[6] * 2}px);
    overflow-y: auto;
  }
`;

export interface InspectorLayoutProps {
  rail: ReactNode;
  detail: ReactNode;
}

export function InspectorLayout({ rail, detail }: InspectorLayoutProps) {
  return (
    <Split>
      <Rail>{rail}</Rail>
      <Column>{detail}</Column>
    </Split>
  );
}
