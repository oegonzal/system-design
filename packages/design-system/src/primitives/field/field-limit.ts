import { useState, type ChangeEvent } from 'react';

/**
 * When a field with a `maxLength` says how much room is left: `near` once
 * the value is within the last tenth of what is asked, `always` from the
 * first character, `never` for a caller that words the limit itself.
 */
export type LimitNotice = 'near' | 'always' | 'never';

/** What a text field takes for its length limit, beside the native `maxLength`. */
export interface LimitNoticeProps {
  /**
   * When the field says how much of its length is left — `near` unless
   * told otherwise, so no capped field ever cuts text off unsaid. The count
   * shows under the control, which is described by it; nearing what is
   * asked, reaching it and reaching the limit are each announced once,
   * politely. Nothing without a `maxLength`.
   */
  limitNotice?: LimitNotice;
  /**
   * The length asked for, when the field takes more: a bound's target under
   * its ceiling. The count runs down to it, then says how far over the ask
   * the value is and how much the field takes at most, and the limit is
   * reached only at `maxLength`. The `maxLength` itself unless given.
   */
  target?: number;
}

/** Where a value stands against its limit. */
export interface FieldLimit {
  /** What the field takes at most — its `maxLength`. */
  max: number;
  /** What is asked for; the max unless a target was given. */
  target: number;
  /** Characters left to the ask, never below none. */
  remaining: number;
  /** Characters past the ask, none until it is crossed. */
  over: number;
  /** Within the last stretch before the ask, or past it. */
  near: boolean;
  /** At the max: nothing more is taken. */
  reached: boolean;
  /** Whether the count is on screen: always, or only once near. */
  shown: boolean;
}

/** The share of an ask that counts as its last stretch. */
const NEAR_SHARE = 0.1;

/**
 * Where `length` stands against `max` and the `target` asked for, or null
 * for a field that has no limit to speak of — none set, or `never`. A target
 * past the max, or none, is the max. Pure, so the rule is testable without
 * a field.
 */
export function fieldLimit(
  length: number,
  max: number | undefined,
  notice: LimitNotice,
  target?: number,
): FieldLimit | null {
  if (max === undefined || max <= 0 || notice === 'never') return null;
  const asked = target === undefined || target <= 0 ? max : Math.min(target, max);
  const remaining = Math.max(0, asked - length);
  const near = remaining <= Math.ceil(asked * NEAR_SHARE);
  return {
    max,
    target: asked,
    remaining,
    over: Math.max(0, length - asked),
    near,
    reached: length >= max,
    shown: near || notice === 'always',
  };
}

const count = (value: number): string => value.toLocaleString('en-US');

/** Whether the field takes more than it asks for — the one case the count has to word. */
const roomPastAsk = ({ max, target }: FieldLimit): boolean => target < max;

/**
 * The count as shown under the control: what is left to the ask, then —
 * where the field takes more — that the ask is met and how far over it the
 * value runs, with what is taken at most, and the limit once nothing more
 * is taken.
 */
export function limitCopy(limit: FieldLimit): string {
  const { max, target, remaining, over, reached } = limit;
  if (reached) return `Limit reached — ${count(max)} characters at most.`;
  if (over > 0) return `${count(over)} over the ${count(target)} asked — ${count(max)} at most`;
  if (remaining === 0 && roomPastAsk(limit)) {
    return `At the ${count(target)} asked — ${count(max)} at most`;
  }
  return `${count(remaining)} ${remaining === 1 ? 'character' : 'characters'} left`;
}

/**
 * What is announced — only at the moments that matter, never per keystroke:
 * entering the last stretch before the ask, meeting the ask where the field
 * takes more, and reaching the limit. Constant within each stretch, so a
 * live region reads each once. Empty before any.
 */
export function limitAnnouncement(limit: FieldLimit): string {
  const { max, target, remaining, near, reached } = limit;
  if (reached) return `Limit of ${count(max)} characters reached.`;
  if (!near) return '';
  if (!roomPastAsk(limit)) return `Nearing the limit of ${count(max)} characters.`;
  if (remaining === 0) return `At the ${count(target)} characters asked — ${count(max)} at most.`;
  return `Nearing the ${count(target)} characters asked.`;
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;
type ControlValue = string | number | readonly string[] | undefined;

const lengthOf = (value: ControlValue): number => (value === undefined ? 0 : String(value).length);

interface LimitedControl<E extends TextControl> extends LimitNoticeProps {
  maxLength?: number;
  value?: ControlValue;
  defaultValue?: ControlValue;
  onChange?: (event: ChangeEvent<E>) => void;
}

/**
 * A text control's standing against its `maxLength` and the `target` asked
 * for, controlled or not: a controlled field is measured by its `value`, an
 * uncontrolled one by what was typed into it — followed through the
 * returned `onChange`, which still calls the caller's own. A field with
 * nothing to follow gets the caller's `onChange` back untouched.
 */
export function useFieldLimit<E extends TextControl>({
  maxLength,
  target,
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
  const limit = fieldLimit(controlled ? lengthOf(value) : typed, maxLength, limitNotice, target);
  if (controlled || limit === null) return { limit, onChange };
  return {
    limit,
    onChange: (event) => {
      setTyped(event.target.value.length);
      onChange?.(event);
    },
  };
}
