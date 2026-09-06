import { useId, type InputHTMLAttributes } from 'react';

import { FieldLabel, FieldRoot, Input } from './field-control';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** A labelled single-line input. The label wraps the control, so clicking it focuses the field. */
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
