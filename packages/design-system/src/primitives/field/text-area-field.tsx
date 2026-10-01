import { useId, type TextareaHTMLAttributes } from 'react';

import { Area, FieldFrame, invalidAttributes, type FieldProps } from './field-control';

export interface TextAreaFieldProps
  extends FieldProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}

/** A labelled multi-line input; four rows unless told otherwise. */
export function TextAreaField({
  label,
  error,
  id,
  rows = 4,
  'aria-describedby': describedBy,
  ...rest
}: TextAreaFieldProps) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <FieldFrame label={label} error={error} controlId={areaId}>
      <Area id={areaId} rows={rows} {...invalidAttributes(areaId, error, describedBy)} {...rest} />
    </FieldFrame>
  );
}
