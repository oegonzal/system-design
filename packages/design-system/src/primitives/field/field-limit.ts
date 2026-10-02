import { useState, type ChangeEvent } from 'react';

/**
 * When a field with a `maxLength` says how much room is left: `near` once
 * the value is within the last tenth of the limit, `always` from the first
 * character, `never` for a caller that words the limit itself.
 */
export type LimitNotice = 'near' | 'always' | 'never';

/** What a text field takes for its length limit, beside the native `maxLength`. */
export interface LimitNoticeProps {
  /**
   * When the field says how much of its `maxLength` is left — `near` unless
   * told otherwise, so no capped field ever cuts text off unsaid. The count
   * shows under the control, which is described by it; reaching the last
   * stretch and reaching the limit are each announced once, politely.
   * Nothing without a `maxLength`.
   */
  limitNotice?: LimitNotice;
}

/** Where a value stands against its limit. */
export interface FieldLimit {
  max: number;
  remaining: number;
  /** Within the last stretch before the limit, or at it. */
  near: boolean;
  /** Whether the count is on screen: always, or only once near. */
  shown: boolean;
}

/** The share of a limit that counts as its last stretch. */
const NEAR_SHARE = 0.1;

/**
 * Where `length` stands against `max`, or null for a field that has no
 * limit to speak of — none set, or `never`. Pure, so the rule is testable
 * without a field.
 */
export function fieldLimit(
  length: number,
  max: number | undefined,
  notice: LimitNotice,
): FieldLimit | null {
  if (max === undefined || max <= 0 || notice === 'never') return null;
  const remaining = Math.max(0, max - length);
  const near = remaining <= Math.ceil(max * NEAR_SHARE);
  return { max, remaining, near, shown: near || notice === 'always' };
}

const count = (value: number): string => value.toLocaleString('en-US');

/** The count as shown under the control. */
export function limitCopy({ max, remaining }: FieldLimit): string {
  if (remaining === 0) return `Limit reached — ${count(max)} characters at most.`;
  return `${count(remaining)} ${remaining === 1 ? 'character' : 'characters'} left`;
}

/**
 * What is announced — only at the two moments that matter, never per
 * keystroke: entering the last stretch, and reaching the limit. Empty
 * before either.
 */
export function limitAnnouncement({ max, remaining, near }: FieldLimit): string {
  if (remaining === 0) return `Limit of ${count(max)} characters reached.`;
  return near ? `Nearing the limit of ${count(max)} characters.` : '';
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;
type ControlValue = string | number | readonly string[] | undefined;

const lengthOf = (value: ControlValue): number => (value === undefined ? 0 : String(value).length);

interface LimitedControl<E extends TextControl> {
  maxLength?: number;
  value?: ControlValue;
  defaultValue?: ControlValue;
  limitNotice?: LimitNotice;
  onChange?: (event: ChangeEvent<E>) => void;
}

/**
 * A text control's standing against its `maxLength`, controlled or not: a
 * controlled field is measured by its `value`, an uncontrolled one by what
 * was typed into it — followed through the returned `onChange`, which
 * still calls the caller's own. A field with nothing to follow gets the
 * caller's `onChange` back untouched.
 */
export function useFieldLimit<E extends TextControl>({
  maxLength,
  value,
  defaultValue,
  limitNotice = 'near',
  onChange,
}: LimitedControl<E>): {
  limit: FieldLimit | null;
  onChange: ((event: ChangeEvent<E>) => void) | undefined;
} {
  const [typed, setTyped] = useState(() => lengthOf(defaultValue));
  const controlled = value !== undefined;
  const limit = fieldLimit(controlled ? lengthOf(value) : typed, maxLength, limitNotice);
  if (controlled || limit === null) return { limit, onChange };
  return {
    limit,
    onChange: (event) => {
      setTyped(event.target.value.length);
      onChange?.(event);
    },
  };
}
