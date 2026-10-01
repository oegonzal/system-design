import { useId, type InputHTMLAttributes } from 'react';

import { FieldFrame, Input, invalidAttributes, type FieldProps } from './field-control';

export interface TextFieldProps extends FieldProps, InputHTMLAttributes<HTMLInputElement> {}

/** A labelled single-line input; the label names the control, and clicking it focuses the field. */
export function TextField({
  label,
  error,
  id,
  'aria-describedby': describedBy,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldFrame label={label} error={error} controlId={inputId}>
      <Input id={inputId} {...invalidAttributes(inputId, error, describedBy)} {...rest} />
    </FieldFrame>
  );
}
