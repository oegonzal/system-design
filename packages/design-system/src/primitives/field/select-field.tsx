import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { FieldFrame, invalidAttributes, SelectControl, type FieldProps } from './field-control';

export interface SelectFieldProps extends FieldProps, SelectHTMLAttributes<HTMLSelectElement> {
  /** The `<option>` elements. */
  children?: ReactNode;
}

/** A labelled native select — the options are the caller's. */
export function SelectField({
  label,
  error,
  id,
  children,
  'aria-describedby': describedBy,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldFrame label={label} error={error} controlId={selectId}>
      <SelectControl id={selectId} {...invalidAttributes(selectId, error, describedBy)} {...rest}>
        {children}
      </SelectControl>
    </FieldFrame>
  );
}
