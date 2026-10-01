import styled from '@emotion/styled';
import type { ReactNode } from 'react';

/**
 * The one look every form field shares: a label over a control over, when
 * the value is refused, the reason — all reading only semantic theme roles.
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

const messageIdOf = (controlId: string): string => `${controlId}-error`;

/**
 * The control's half of the error wiring: invalid while there is an error,
 * and described by the message alongside whatever described it already.
 */
export function invalidAttributes(
  controlId: string,
  error: string | null | undefined,
  describedBy: string | undefined,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  if (!error) return describedBy ? { 'aria-describedby': describedBy } : {};
  return {
    'aria-invalid': true,
    'aria-describedby': [describedBy, messageIdOf(controlId)].filter(Boolean).join(' '),
  };
}

export interface FieldFrameProps extends FieldProps {
  controlId: string;
  /** The control — its `id` is `controlId`. */
  children: ReactNode;
}

/** The label, the control and the reason it is refused, in that order. */
export function FieldFrame({ label, error, controlId, children }: FieldFrameProps) {
  return (
    <FieldRoot>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      {children}
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
