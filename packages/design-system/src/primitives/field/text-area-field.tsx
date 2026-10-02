import { useId, type TextareaHTMLAttributes } from 'react';

import { Area, FieldFrame, invalidAttributes, type FieldProps } from './field-control';
import { useFieldLimit, type LimitNoticeProps } from './field-limit';

export interface TextAreaFieldProps
  extends FieldProps, LimitNoticeProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * A labelled multi-line input; four rows unless told otherwise. Given a
 * `maxLength`, it says how much is left as the limit nears (`limitNotice`),
 * so the cap never cuts text off unsaid.
 */
export function TextAreaField({
  label,
  error,
  id,
  rows = 4,
  limitNotice,
  onChange,
  'aria-describedby': describedBy,
  ...rest
}: TextAreaFieldProps) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const limited = useFieldLimit<HTMLTextAreaElement>({ ...rest, limitNotice, onChange });
  return (
    <FieldFrame label={label} error={error} controlId={areaId} limit={limited.limit}>
      <Area
        id={areaId}
        rows={rows}
        {...invalidAttributes(areaId, error, describedBy, limited.limit)}
        {...rest}
        onChange={limited.onChange}
      />
    </FieldFrame>
  );
}
