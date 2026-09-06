import { useId, type InputHTMLAttributes } from 'react';

import { CheckboxInput, CheckboxRoot } from './field-control';

export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** A labelled checkbox; the label sits beside the box and toggles it. */
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
