import { useId, type TextareaHTMLAttributes } from 'react';

import { Area, FieldLabel, FieldRoot } from './field-control';

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

/** A labelled multi-line input; four rows unless told otherwise. */
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
