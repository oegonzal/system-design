import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { FieldLabel, FieldRoot, SelectControl } from './field-control';

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** The `<option>` elements. */
  children?: ReactNode;
}

/** A labelled native select — the options are the caller's. */
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
