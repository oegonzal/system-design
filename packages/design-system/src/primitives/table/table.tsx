import styled from '@emotion/styled';
import { useEffect, useRef, useState, type ComponentProps } from 'react';

/**
 * The frame a table sits in: as wide as its column and no wider, scrolling
 * sideways by itself — so a table with more columns than the screen has room
 * for moves inside its frame and the page never does. Positioned, so that
 * what a cell positions absolutely — a visually hidden label, say — is laid
 * out against the frame and clipped by it. Measured 2026-10-13 at a phone's
 * width: without it one such label, a pixel wide and far along a wide row,
 * widened the whole page by a hundred pixels.
 */
const Scroller = styled.div`
  position: relative;
  max-width: 100%;
  overflow-x: auto;
`;

const Plane = styled.table`
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

/** Whether the frame holds more than it shows, followed as the layout changes. */
function useOverflowing() {
  const frame = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    // Observing takes the first reading too: an observer reports once on `observe`.
    const resized = new ResizeObserver(() =>
      setOverflowing(element.scrollWidth > element.clientWidth),
    );
    resized.observe(element);
    if (element.firstElementChild) resized.observe(element.firstElementChild);
    return () => resized.disconnect();
  }, []);
  return { frame, overflowing };
}

/**
 * A data table's plane: full width, collapsed borders, the body font at the
 * small size, left-aligned cells with a quiet rule between rows and muted,
 * semibold headers — in a frame that scrolls sideways when the columns need
 * more room than the page gives them. While it scrolls, the frame is a named
 * region a keyboard can focus and move; while it fits, it is nothing at all.
 *
 * Only the look. Columns, captions, sorting and the empty state are the
 * consumer's — a table with no rows is a `Text` line saying so, never a header
 * row over nothing (which reads as broken and fails accessibility checks).
 * Give it an `aria-label` so the table can be found by name; the scrolling
 * region is named after it.
 */
export function Table(props: ComponentProps<'table'>) {
  const { frame, overflowing } = useOverflowing();
  return (
    <Scroller
      ref={frame}
      {...(overflowing
        ? {
            role: 'region',
            tabIndex: 0,
            'aria-label': `${props['aria-label'] ?? 'Table'}, scrolls sideways`,
          }
        : {})}
    >
      <Plane {...props} />
    </Scroller>
  );
}
