import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import {
  createContext,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { transient } from '../../theme/styled';
import type { SpaceIndex } from '../../theme/tokens';
import {
  hiddenEnds,
  NONE_HIDDEN,
  pageScrollLeft,
  revealScrollLeft,
  type HiddenEnds,
  type RowView,
} from './reveal';

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  /** Prefix for the tab/panel id handshake — `aria-controls` needs real ids. */
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(consumer: string): TabsContextValue {
  const context = use(TabsContext);
  if (!context) throw new Error(`${consumer} must be rendered inside <Tabs>`);
  return context;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** The selected tab's value. Controlled — this component holds no state. */
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}

/**
 * The provider half of the widget. Renders a plain wrapper, **not** the
 * tablist: `role="tablist"` may only contain tabs, and the panels have to
 * live inside the provider to reach the id handshake — so the roles sit on
 * `TabList`, one level down.
 *
 * Controlled (`value` + `onChange`) because the selected tab is usually
 * routing state, not widget state.
 */
export function Tabs({ value, onChange, children, ...rest }: TabsProps) {
  const baseId = useId();
  const context = useMemo(() => ({ value, onChange, baseId }), [value, onChange, baseId]);

  return (
    <TabsContext value={context}>
      <div {...rest}>{children}</div>
    </TabsContext>
  );
}

/**
 * What a row of tabs does when it outgrows its container: `wrap` breaks onto
 * another row; `scroll` stays one row that scrolls sideways.
 */
export type TabListOverflow = 'wrap' | 'scroll';

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Required in spirit: a page with two tablists is unnavigable without
   * names. TypeScript cannot demand it without forbidding `aria-labelledby`,
   * so it is documented instead.
   */
  'aria-label'?: string;
  /**
   * `wrap` (the default) for a page-wide header. `scroll` for a narrow
   * container — a dock, a side panel — where a second row of tabs would eat
   * the panel: one row that scrolls sideways and keeps the selected tab
   * wholly in view, however it was chosen — a click, the arrow keys, or the
   * page selecting it from code. An end that holds more tabs says so: the
   * row fades out there under a button that pages toward them.
   */
  overflow?: TabListOverflow;
}

const List = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]}px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
`;

/**
 * One row as wide as its tabs, so the underline runs the whole row inside
 * the scroller. A scroller clips what is drawn outside it, so a tab's focus
 * ring is drawn inside the tab here.
 */
const OneRowList = styled(List)`
  flex-wrap: nowrap;
  min-width: max-content;

  & > [role='tab'] {
    white-space: nowrap;
  }

  & > [role='tab']:focus-visible {
    outline-offset: -2px;
  }
`;

/**
 * How much of an end of a scrolling row its edge affordance covers — the
 * fade and the button over it — as a step of the space scale. The one
 * width the styles and the reveal rule both read.
 */
const EDGE_SPACE = 6 satisfies SpaceIndex;

/**
 * A tab's padding either side of its label, as a step of the space scale.
 * The tab's own inset, and the most of a row an end may hide without an edge
 * affordance: an end past the view by no more than this cuts into a tab's
 * padding, never its label, so the row reads as fitting there.
 */
const TAB_INLINE_SPACE = 4 satisfies SpaceIndex;

/** The scroller and the edge buttons laid over its ends; never shrunk by a column flex parent, so the row keeps its height in a dock. */
const Strip = styled.div`
  position: relative;
  flex-shrink: 0;
`;

/**
 * The row fading out toward each end that holds more, as a mask — it fades
 * the tabs themselves, so it reads the same on any surface. The outer half
 * of an edge is clear for the button's arrow.
 */
const fadeMask = ({ start, end }: HiddenEnds, edge: number): string =>
  start || end
    ? `linear-gradient(to right, ${
        start ? `transparent ${edge / 2}px, #000 ${edge}px` : '#000 0'
      }, ${end ? `#000 calc(100% - ${edge}px), transparent calc(100% - ${edge / 2}px)` : '#000 100%'})`
    : 'none';

/**
 * The sideways scroller a one-row list sits in. Positioned, so a tab's
 * `offsetLeft` is measured from it. It shows no scrollbar: the edge buttons
 * are what say there is more, and what a mouse without a sideways wheel
 * reaches it with.
 */
const Scroller = styled('div', transient)<{ $hidden: HiddenEnds; $edge: number }>`
  position: relative;
  overflow-x: auto;
  scrollbar-width: none;
  /* The stored motion level; the OS preference is global.ts's to enforce. */
  scroll-behavior: ${({ theme }) => (theme.motion.level === 'reduced' ? 'auto' : 'smooth')};
  mask-image: ${({ $hidden, $edge }) => fadeMask($hidden, $edge)};

  &::-webkit-scrollbar {
    display: none;
  }
`;

type RowEnd = keyof HiddenEnds;

const EdgeButton = styled('button', transient)<{ $end: RowEnd; $edge: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  ${({ $end }) => ($end === 'start' ? 'left' : 'right')}: 0;
  width: ${({ $edge }) => $edge}px;
  display: flex;
  align-items: center;
  justify-content: ${({ $end }) => ($end === 'start' ? 'flex-start' : 'flex-end')};
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.color.text.secondary};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.color.text.primary};
  }
`;

/** The arrow's two strokes, pointing at the end it pages toward. */
const ARROW: Record<RowEnd, string> = { start: 'M10 3 5 8l5 5', end: 'M6 3l5 5-5 5' };

interface EdgeProps {
  end: RowEnd;
  width: number;
  onPage: (toward: RowEnd) => void;
}

/**
 * A pointer's way to the tabs past one end. Not in the tab order and hidden
 * from assistive technology: the tablist already holds every tab, and the
 * arrow keys reach them — this is the same reach for a mouse. It never
 * takes focus, so a tab that had it keeps it.
 */
function Edge({ end, width, onPage }: EdgeProps) {
  return (
    <EdgeButton
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      data-tabs-edge={end}
      $end={end}
      $edge={width}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPage(end)}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" focusable="false">
        <path
          d={ARROW[end]}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </EdgeButton>
  );
}

/** What a scroller shows of its row, read from the layout. */
const viewOf = (strip: HTMLElement): RowView => ({
  scrollLeft: strip.scrollLeft,
  width: strip.clientWidth,
  contentWidth: strip.scrollWidth,
});

/** Moves the scroller just far enough that the selected tab is wholly in view, clear of the edges. */
function revealSelected(strip: HTMLElement, inset: number): void {
  const selected = strip.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  if (!selected) return;
  strip.scrollLeft = revealScrollLeft(
    { start: selected.offsetLeft, end: selected.offsetLeft + selected.offsetWidth },
    viewOf(strip),
    inset,
  );
}

/**
 * Focus movement for the tablist, resolved from the DOM rather than a
 * registry: the tabs render in document order, so the document *is* the
 * order, and a context full of refs would be a second copy of it.
 */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
  if (!keys.includes(event.key)) return;

  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ).filter((tab) => !tab.disabled);
  if (tabs.length === 0) return;

  const current = tabs.findIndex((tab) => tab === document.activeElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowRight'
          ? (current + 1) % tabs.length
          : (current - 1 + tabs.length) % tabs.length;

  event.preventDefault();
  const target = tabs[next];
  target.focus();
  // Selection follows focus (automatic activation): a settings-style tablist
  // has cheap panels, so making the user press Enter as well is friction with
  // no payoff. click() routes through the Tab's own handler, so there is one
  // activation code path, not two.
  target.click();
}

/**
 * The `role="tablist"` element. Renders `Tab`s and nothing else. With
 * `overflow="scroll"` it sits in a scroller that follows the selection: each
 * time the selected value changes — or the row or its container changes
 * size — the scroller moves just far enough to show that tab whole, clear
 * of the edges; the scroller, never the page. An end with tabs out of view
 * fades out under a button that pages toward them.
 */
export function TabList({ overflow = 'wrap', ...props }: TabListProps) {
  // Requiring the context also keeps a stray TabList from rendering a
  // tablist whose tabs would all throw.
  const { value } = useTabsContext('TabList');
  const scroller = useRef<HTMLDivElement>(null);
  const { space } = useTheme();
  const edge = space[EDGE_SPACE];
  const sliver = space[TAB_INLINE_SPACE];
  const [hidden, setHidden] = useState<HiddenEnds>(NONE_HIDDEN);

  /** Reads which ends hold more; the same answer keeps the same state, so a scroll re-renders only when an end changes. */
  const measure = () => {
    const strip = scroller.current;
    if (!strip) return;
    const next = hiddenEnds(viewOf(strip), sliver);
    setHidden((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    );
  };

  useEffect(() => {
    if (scroller.current) revealSelected(scroller.current, edge);
  }, [value, overflow, edge]);

  // A row that grows or a dock that narrows moves what is in view without a
  // scroll: follow the layout, which also takes the first reading on mount.
  useEffect(() => {
    const strip = scroller.current;
    if (!strip || typeof ResizeObserver === 'undefined') return undefined;
    const resized = new ResizeObserver(() => {
      revealSelected(strip, edge);
      measure();
    });
    resized.observe(strip);
    if (strip.firstElementChild) resized.observe(strip.firstElementChild);
    return () => resized.disconnect();
  }, [overflow, edge, sliver]);

  if (overflow === 'wrap') return <List role="tablist" onKeyDown={moveFocus} {...props} />;

  const page = (toward: RowEnd) => {
    const strip = scroller.current;
    if (strip) strip.scrollLeft = pageScrollLeft(viewOf(strip), toward, edge);
  };
  return (
    <Strip>
      <Scroller ref={scroller} $hidden={hidden} $edge={edge} onScroll={measure}>
        <OneRowList role="tablist" onKeyDown={moveFocus} {...props} />
      </Scroller>
      {hidden.start ? <Edge end="start" width={edge} onPage={page} /> : null}
      {hidden.end ? <Edge end="end" width={edge} onPage={page} /> : null}
    </Strip>
  );
}

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  /** Identity within the tablist; matches a `TabPanel`'s `value`. */
  value: string;
}

const TabButton = styled('button', transient)<{ $selected: boolean }>`
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[TAB_INLINE_SPACE]}px`};
  border: none;
  border-radius: ${({ theme }) => `${theme.radius.sm} ${theme.radius.sm} 0 0`};
  background: transparent;
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;

  color: ${({ theme, $selected }) =>
    $selected ? theme.color.text.primary : theme.color.text.secondary};
  /* Inset underline rather than border: no layout shift on selection. */
  box-shadow: ${({ theme, $selected }) =>
    $selected ? `inset 0 -2px 0 0 ${theme.color.accent.default}` : 'none'};

  transition:
    color ${({ theme }) => theme.motion.duration.fast}
      ${({ theme }) => theme.motion.easing.standard},
    box-shadow ${({ theme }) => theme.motion.duration.fast}
      ${({ theme }) => theme.motion.easing.standard};

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.text.primary};
    background: ${({ theme }) => theme.color.bg.subtle};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

/**
 * Roving tabindex: exactly one tab — the selected one — is in the tab order,
 * and the arrow keys move between the rest. That is what keeps a six-tab
 * header from costing six Tab presses to cross.
 */
export function Tab({ value, onClick, ...rest }: TabProps) {
  const context = useTabsContext('Tab');
  const selected = context.value === value;

  return (
    <TabButton
      type="button"
      role="tab"
      id={`${context.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${context.baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      $selected={selected}
      onClick={(event) => {
        onClick?.(event);
        if (!selected) context.onChange(value);
      }}
      {...rest}
    />
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Matches the `Tab` this panel belongs to. */
  value: string;
}

/**
 * Hidden with the `hidden` attribute rather than unmounted, so panel state —
 * a scrolled list, a half-typed field — survives switching away and back.
 */
export function TabPanel({ value, ...rest }: TabPanelProps) {
  const context = useTabsContext('TabPanel');
  const selected = context.value === value;

  return (
    <div
      role="tabpanel"
      id={`${context.baseId}-panel-${value}`}
      aria-labelledby={`${context.baseId}-tab-${value}`}
      tabIndex={0}
      hidden={!selected}
      {...rest}
    />
  );
}
