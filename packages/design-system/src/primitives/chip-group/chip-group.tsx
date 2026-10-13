import type { ReactNode } from 'react';

import { Button } from '../button/button';
import { Stack } from '../stack/stack';
import { Text } from '../text/text';

export interface ChipOption {
  id: string;
  label: ReactNode;
  /** What the chip stands for, when its label is a code — shown on hover and read with the name. */
  description?: string;
}

export interface ChipGroupProps {
  /** The group's accessible name. */
  label: string;
  /** Show the name before the chips, for a row that would otherwise not say what it chooses. */
  showLabel?: boolean;
  options: readonly ChipOption[];
  /** The ids pressed: one for a single choice, any number for a set. */
  value: readonly string[];
  /** One chip pressed or released; what that does to `value` is the owner's rule. */
  onToggle(id: string): void;
  disabled?: boolean;
}

/**
 * A row of toggle chips under one name: a set of codes pressed in and out,
 * or one choice among a few. Each chip is a button that says whether it is
 * pressed, the row wraps when it runs out of room, and the owner decides
 * what a press means — so one component serves a multi-select and a
 * single-select alike without knowing which it is.
 */
export function ChipGroup({
  label,
  showLabel = false,
  options,
  value,
  onToggle,
  disabled = false,
}: ChipGroupProps) {
  return (
    <Stack direction="row" gap={2} wrap align="center" role="group" aria-label={label}>
      {showLabel ? (
        <Text as="span" tone="secondary" size="sm">
          {label}
        </Text>
      ) : null}
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant="subtle"
          size="sm"
          selected={value.includes(option.id)}
          title={option.description}
          disabled={disabled}
          onClick={() => onToggle(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </Stack>
  );
}
