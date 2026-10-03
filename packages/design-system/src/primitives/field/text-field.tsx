import { useId, type InputHTMLAttributes } from 'react';

import { FieldFrame, Input, invalidAttributes, type FieldProps } from './field-control';
import { useFieldLimit, type LimitNoticeProps } from './field-limit';

export interface TextFieldProps
  extends FieldProps, LimitNoticeProps, InputHTMLAttributes<HTMLInputElement> {}

/**
 * A labelled single-line input; the label names the control, and clicking
 * it focuses the field. A `hint` under it says what the value is for and
 * stays while it is typed. Given a `maxLength`, it says how much is left as
 * the limit nears (`limitNotice`), so the cap never cuts text off unsaid —
 * and, given a `target` under it, counts down to the ask and says how far
 * over it the value runs before the limit is reached.
 */
export function TextField({
  label,
  hint,
  error,
  id,
  limitNotice,
  target,
  onChange,
  'aria-describedby': describedBy,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const limited = useFieldLimit<HTMLInputElement>({ ...rest, limitNotice, target, onChange });
  return (
    <FieldFrame label={label} hint={hint} error={error} controlId={inputId} limit={limited.limit}>
      <Input
        id={inputId}
        {...invalidAttributes(inputId, { hint, error, describedBy, limit: limited.limit })}
        {...rest}
        onChange={limited.onChange}
      />
    </FieldFrame>
  );
}
