import { SelectField } from '@sysdesign/design-system';

import type { OpenerOption } from '../model/openers';

/**
 * Whose records the lists hold: the recent ones, or everything one opener
 * opened — a browser session's runs and orchestrations, step by step.
 * Presentational: the options, the choice and what follows it are the caller's.
 */

export interface OpenerFilterProps {
  options: readonly OpenerOption[];
  /** The opener the lists are narrowed to; null for the recent lists. */
  value: string | null;
  /** What the narrowed lists hold, said under the control. */
  hint: string | null;
  onChange(next: string | null): void;
}

export function OpenerFilter({ options, value, hint, onChange }: OpenerFilterProps) {
  return (
    <SelectField
      label="Opened by"
      value={value ?? ''}
      hint={hint}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
    >
      <option value="">All recent</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.text}
        </option>
      ))}
    </SelectField>
  );
}
