import styled from '@emotion/styled';
import type { ReactNode } from 'react';

import { transient } from '../../theme/styled';
import { VisuallyHidden } from '../visually-hidden/visually-hidden';
import { limitAnnouncement, limitCopy, type FieldLimit } from './field-limit';

/**
 * The one look every form field shares: a label over a control over what
 * the control needs saying under it — what the value is for (`hint`), how
 * much of a length limit is left or how far over the ask the value runs,
 * and, when the value is refused, the reason — all reading only semantic
 * theme roles. Internal to the field
 * primitives; each public field composes these.
 */

export const FieldRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  font-family: ${({ theme }) => theme.font.family.base};
`;

export const FieldLabel = styled.label`
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.secondary};
`;

/** Why the value is refused, beside the control it is about. */
const FieldMessage = styled.span`
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.danger.fg};
`;

/** What the value is for, or how it is read — under the control, and there whatever is typed. */
const FieldHint = styled.span`
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.text.muted};
`;

/** What every field takes beyond its native control's attributes. */
export interface FieldProps {
  label: string;
  /**
   * What the value is for, or who reads it — guidance that stays while the
   * field is typed into, unlike a placeholder. Shown under the control,
   * which is described by it.
   */
  hint?: string | null;
  /**
   * Why the current value is refused. Shown under the control, and the
   * control is marked invalid and described by it; nothing while null.
   */
  error?: string | null;
}

/** How much of the length is left; it turns to a warning once the ask is crossed, and stays one at the limit. */
const FieldCount = styled('span', transient)<{ $warn: boolean }>`
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme, $warn }) => ($warn ? theme.color.warn.fg : theme.color.text.muted)};
`;

const messageIdOf = (controlId: string): string => `${controlId}-error`;
const countIdOf = (controlId: string): string => `${controlId}-limit`;
const hintIdOf = (controlId: string): string => `${controlId}-hint`;

/** What a control is described by besides its own attributes: everything the frame shows under it. */
export interface ControlDescription {
  hint?: string | null;
  error?: string | null;
  /** Whatever described the control already — the caller's own `aria-describedby`. */
  describedBy?: string;
  limit?: FieldLimit | null;
}

/**
 * The control's half of the wiring: invalid while there is an error, and
 * described by everything shown under it — the hint, the count while it
 * shows, then the reason — alongside whatever described it already.
 */
export function invalidAttributes(
  controlId: string,
  { hint, error, describedBy, limit = null }: ControlDescription,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  const described = [
    describedBy,
    hint ? hintIdOf(controlId) : undefined,
    limit?.shown ? countIdOf(controlId) : undefined,
    error ? messageIdOf(controlId) : undefined,
  ].filter(Boolean);
  return {
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(described.length > 0 ? { 'aria-describedby': described.join(' ') } : {}),
  };
}

export interface FieldFrameProps extends FieldProps {
  controlId: string;
  /** Where the value stands against its length limit; null for a field without one. */
  limit?: FieldLimit | null;
  /** The control — its `id` is `controlId`. */
  children: ReactNode;
}

/**
 * The label, the control, what the value is for, how much of its limit is
 * left and the reason it is refused, in that order. A limited field's
 * announcer is mounted from the start — a live region must exist before it
 * has anything to say — and is a plain polite region rather than a
 * `status`: a form of capped fields is not a form of statuses, and the
 * page's own status stays the only one.
 */
export function FieldFrame({
  label,
  hint,
  error,
  controlId,
  limit = null,
  children,
}: FieldFrameProps) {
  return (
    <FieldRoot>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      {children}
      {hint ? <FieldHint id={hintIdOf(controlId)}>{hint}</FieldHint> : null}
      {limit?.shown ? (
        <FieldCount id={countIdOf(controlId)} $warn={limit.over > 0 || limit.reached}>
          {limitCopy(limit)}
        </FieldCount>
      ) : null}
      {limit !== null ? (
        <VisuallyHidden aria-live="polite" aria-atomic="true">
          {limitAnnouncement(limit)}
        </VisuallyHidden>
      ) : null}
      {error ? <FieldMessage id={messageIdOf(controlId)}>{error}</FieldMessage> : null}
    </FieldRoot>
  );
}

/** The one control recipe every field shares. */
const controlCss = `
  width: 100%;
  box-sizing: border-box;
  font: inherit;
`;

export const Input = styled.input`
  ${controlCss}
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text.primary};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.default};
  border-radius: ${({ theme }) => theme.radius.sm};

  &::placeholder {
    color: ${({ theme }) => theme.color.text.muted};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }

  &[aria-invalid='true'] {
    border-color: ${({ theme }) => theme.color.danger.fg};
  }

  &:disabled {
    background: ${({ theme }) => theme.color.bg.subtle};
    cursor: not-allowed;
  }
`;

export const Area = Input.withComponent('textarea');
export const SelectControl = Input.withComponent('select');

export const CheckboxRoot = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text.primary};
  cursor: pointer;
`;

export const CheckboxInput = styled.input`
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: ${({ theme }) => theme.color.accent.default};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;
