'use client';

import styled from '@emotion/styled';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/**
 * App-local form fields.
 *
 * The design system ships no TextField / Select / TextArea / Checkbox
 * primitives yet, so these live here — one module, one shared look — until
 * they graduate. They read only semantic theme roles, so a promotion into
 * the design system is a file move, not a redesign.
 */

const FieldRoot = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]}px;
  font-family: ${({ theme }) => theme.font.family.base};
`;

const FieldLabel = styled.span`
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.text.secondary};
`;

/** The one control recipe every field shares. */
const controlCss = `
  width: 100%;
  box-sizing: border-box;
  font: inherit;
`;

const Input = styled.input`
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

  &:disabled {
    background: ${({ theme }) => theme.color.bg.subtle};
    cursor: not-allowed;
  }
`;

const Area = Input.withComponent('textarea');
const SelectControl = Input.withComponent('select');

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldRoot htmlFor={inputId}>
      <FieldLabel>{label}</FieldLabel>
      <Input id={inputId} {...rest} />
    </FieldRoot>
  );
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function TextAreaField({ label, id, rows = 4, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <FieldRoot htmlFor={areaId}>
      <FieldLabel>{label}</FieldLabel>
      <Area id={areaId} rows={rows} {...rest} />
    </FieldRoot>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children?: ReactNode;
}

export function SelectField({ label, id, children, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldRoot htmlFor={selectId}>
      <FieldLabel>{label}</FieldLabel>
      <SelectControl id={selectId} {...rest}>
        {children}
      </SelectControl>
    </FieldRoot>
  );
}

const CheckboxRoot = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  font-family: ${({ theme }) => theme.font.family.base};
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text.primary};
  cursor: pointer;
`;

const CheckboxInput = styled.input`
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: ${({ theme }) => theme.color.accent.default};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function CheckboxField({ label, id, ...rest }: CheckboxFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <CheckboxRoot htmlFor={inputId}>
      <CheckboxInput type="checkbox" id={inputId} {...rest} />
      <span>{label}</span>
    </CheckboxRoot>
  );
}
