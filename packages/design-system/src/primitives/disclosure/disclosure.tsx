import styled from '@emotion/styled';
import {
  createContext,
  use,
  useId,
  useMemo,
  useState,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import { Button, type ButtonProps } from '../button/button';

interface DisclosureContextValue {
  open: boolean;
  toggle(): void;
  /** The button/panel id handshake — `aria-controls` and `aria-labelledby` need real ids. */
  buttonId: string;
  panelId: string;
}

const DisclosureContext = createContext<DisclosureContextValue | null>(null);

function useDisclosureContext(consumer: string): DisclosureContextValue {
  const context = use(DisclosureContext);
  if (!context) throw new Error(`${consumer} must be rendered inside <Disclosure>`);
  return context;
}

export interface DisclosureProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Whether the panel shows. Given, the disclosure is controlled and
   * `onOpenChange` is where a toggle lands; absent, it keeps its own state
   * from `defaultOpen`.
   */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

/**
 * The provider half of a disclosure: one button that shows and hides one
 * panel, the pattern a "Technical details" fold or a "Show lessons" list
 * is. Renders a plain wrapper and nothing else, so the button may sit in a
 * row of its own and the panel under it — the consumer owns the layout, as
 * with `Tabs`. The state is the consumer's when it needs to read it (a
 * button that says "Hide" while open) and the widget's own when it does
 * not.
 */
export function Disclosure({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  ...rest
}: DisclosureProps) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const shown = open ?? uncontrolled;
  const context = useMemo<DisclosureContextValue>(
    () => ({
      open: shown,
      toggle() {
        const next = !shown;
        if (open === undefined) setUncontrolled(next);
        onOpenChange?.(next);
      },
      buttonId: `${baseId}-button`,
      panelId: `${baseId}-panel`,
    }),
    [shown, open, onOpenChange, baseId],
  );

  return (
    <DisclosureContext value={context}>
      <div {...rest}>{children}</div>
    </DisclosureContext>
  );
}

export interface DisclosureButtonProps extends Omit<ButtonProps, 'children'> {
  /** What the button says — or a function of whether the panel shows, for a button that says "Hide" while it does. */
  children?: ReactNode | ((open: boolean) => ReactNode);
}

/**
 * The control: a `Button` (every variant and size) that says whether the
 * panel shows (`aria-expanded`) and which panel it is (`aria-controls`).
 * It opens from the keyboard as any button does.
 */
export function DisclosureButton({ children, onClick, ...rest }: DisclosureButtonProps) {
  const { open, toggle, buttonId, panelId } = useDisclosureContext('DisclosureButton');
  return (
    <Button
      id={buttonId}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggle();
      }}
      {...rest}
    >
      {typeof children === 'function' ? children(open) : children}
    </Button>
  );
}

export interface DisclosurePanelProps extends HTMLAttributes<HTMLElement> {
  /** The element the panel is — a list, say. A div unless told otherwise. */
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Its own `display: none` under `[hidden]`: a layout `display` set on the
 * panel (through `as`, or a className) would outrank the browser's own
 * `[hidden]` rule and the panel would never collapse.
 */
const Panel = styled.div`
  &[hidden] {
    display: none;
  }
`;

/**
 * What the button shows and hides. Hidden with the `hidden` attribute rather
 * than unmounted, so what is inside — a scrolled list, a half-read line —
 * survives being folded away and back. Named after its button, so a reader
 * landing in it knows what it is the details of.
 */
export function DisclosurePanel({ as, ...rest }: DisclosurePanelProps) {
  const { open, buttonId, panelId } = useDisclosureContext('DisclosurePanel');
  return (
    <Panel
      as={as as ElementType}
      id={panelId}
      aria-labelledby={buttonId}
      hidden={!open}
      {...rest}
    />
  );
}
