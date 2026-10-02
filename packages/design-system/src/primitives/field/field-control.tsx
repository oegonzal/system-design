import styled from '@emotion/styled';
import type { ReactNode } from 'react';

import { transient } from '../../theme/styled';
import { VisuallyHidden } from '../visually-hidden/visually-hidden';
import { limitAnnouncement, limitCopy, type FieldLimit } from './field-limit';

/**
 * The one look every form field shares: a label over a control over, when
 * the value is refused, the reason — and, for a text field with a length
 * limit, how much of it is left — all reading only semantic theme roles.
 * Internal to the field primitives; each public field composes these.
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

/** What every field takes beyond its native control's attributes. */
export interface FieldProps {
  label: string;
  /**
   * Why the current value is refused. Shown under the control, and the
   * control is marked invalid and described by it; nothing while null.
   */
  error?: string | null;
}

/** How much of the length limit is left; it turns to a warning once none is. */
const FieldCount = styled('span', transient)<{ $reached: boolean }>`
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme, $reached }) => ($reached ? theme.color.warn.fg : theme.color.text.muted)};
`;

const messageIdOf = (controlId: string): string => `${controlId}-error`;
const countIdOf = (controlId: string): string => `${controlId}-limit`;

/**
 * The control's half of the wiring: invalid while there is an error, and
 * described by everything shown under it — the count while it shows, then
 * the reason — alongside whatever described it already.
 */
export function invalidAttributes(
  controlId: string,
  error: string | null | undefined,
  describedBy: string | undefined,
  limit: FieldLimit | null = null,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  const described = [
    describedBy,
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
 * The label, the control, how much of its limit is left and the reason it
 * is refused, in that order. A limited field's announcer is mounted from
 * the start — a live region must exist before it has anything to say — and
 * is a plain polite region rather than a `status`: a form of capped fields
 * is not a form of statuses, and the page's own status stays the only one.
 */
export function FieldFrame({ label, error, controlId, limit = null, children }: FieldFrameProps) {
  return (
    <FieldRoot>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      {children}
      {limit?.shown ? (
        <FieldCount id={countIdOf(controlId)} $reached={limit.remaining === 0}>
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
