import styled from '@emotion/styled';
import {
  createContext,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { transient } from '../../theme/styled';
import { revealScrollLeft } from './reveal';

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
   * the panel: one row that scrolls sideways and keeps the selected tab in
   * view, however it was chosen — a click, the arrow keys, or the page
   * selecting it from code.
   */
  overflow?: TabListOverflow;
}

const List = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]}px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
`;

/** One row as wide as its tabs, so the underline runs the whole row inside the scroller. */
const OneRowList = styled(List)`
  flex-wrap: nowrap;
  min-width: max-content;

  & > [role='tab'] {
    white-space: nowrap;
  }
`;

/**
 * The sideways scroller a one-row list sits in. Positioned, so a tab's
 * `offsetLeft` is measured from it; never shrunk by a column flex parent, so
 * the row keeps its height in a dock.
 */
const Scroller = styled.div`
  position: relative;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: thin;
`;

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
 * time the selected value changes, the scroller moves just far enough to
 * show that tab — the scroller, never the page.
 */
export function TabList({ overflow = 'wrap', ...props }: TabListProps) {
  // Requiring the context also keeps a stray TabList from rendering a
  // tablist whose tabs would all throw.
  const { value } = useTabsContext('TabList');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = scroller.current;
    const selected = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !selected) return;
    strip.scrollLeft = revealScrollLeft(
      { start: selected.offsetLeft, end: selected.offsetLeft + selected.offsetWidth },
      { scrollLeft: strip.scrollLeft, width: strip.clientWidth },
    );
  }, [value, overflow]);

  if (overflow === 'wrap') return <List role="tablist" onKeyDown={moveFocus} {...props} />;
  return (
    <Scroller ref={scroller}>
      <OneRowList role="tablist" onKeyDown={moveFocus} {...props} />
    </Scroller>
  );
}

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  /** Identity within the tablist; matches a `TabPanel`'s `value`. */
  value: string;
}

const TabButton = styled('button', transient)<{ $selected: boolean }>`
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[4]}px`};
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
