import { useId, type InputHTMLAttributes } from 'react';

import { FieldFrame, Input, invalidAttributes, type FieldProps } from './field-control';
import { useFieldLimit, type LimitNoticeProps } from './field-limit';

export interface TextFieldProps
  extends FieldProps, LimitNoticeProps, InputHTMLAttributes<HTMLInputElement> {}

/**
 * A labelled single-line input; the label names the control, and clicking
 * it focuses the field. Given a `maxLength`, it says how much is left as
 * the limit nears (`limitNotice`), so the cap never cuts text off unsaid.
 */
export function TextField({
  label,
  error,
  id,
  limitNotice,
  onChange,
  'aria-describedby': describedBy,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const limited = useFieldLimit<HTMLInputElement>({ ...rest, limitNotice, onChange });
  return (
    <FieldFrame label={label} error={error} controlId={inputId} limit={limited.limit}>
      <Input
        id={inputId}
        {...invalidAttributes(inputId, error, describedBy, limited.limit)}
        {...rest}
        onChange={limited.onChange}
      />
    </FieldFrame>
  );
}
