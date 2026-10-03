import { useId, type TextareaHTMLAttributes } from 'react';

import { Area, FieldFrame, invalidAttributes, type FieldProps } from './field-control';
import { useFieldLimit, type LimitNoticeProps } from './field-limit';

export interface TextAreaFieldProps
  extends FieldProps, LimitNoticeProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * A labelled multi-line input; four rows unless told otherwise. A `hint`
 * under it says what the value is for and stays while it is typed. Given a
 * `maxLength`, it says how much is left as the limit nears (`limitNotice`),
 * so the cap never cuts text off unsaid — and, given a `target` under it,
 * counts down to the ask and says how far over it the value runs before the
 * limit is reached.
 */
export function TextAreaField({
  label,
  hint,
  error,
  id,
  rows = 4,
  limitNotice,
  target,
  onChange,
  'aria-describedby': describedBy,
  ...rest
}: TextAreaFieldProps) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const limited = useFieldLimit<HTMLTextAreaElement>({ ...rest, limitNotice, target, onChange });
  return (
    <FieldFrame label={label} hint={hint} error={error} controlId={areaId} limit={limited.limit}>
      <Area
        id={areaId}
        rows={rows}
        {...invalidAttributes(areaId, { hint, error, describedBy, limit: limited.limit })}
        {...rest}
        onChange={limited.onChange}
      />
    </FieldFrame>
  );
}
