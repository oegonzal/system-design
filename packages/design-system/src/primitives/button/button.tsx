import styled from '@emotion/styled';
import type { ButtonHTMLAttributes } from 'react';

import { transient } from '../../theme/styled';

export type ButtonVariant = 'solid' | 'subtle' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `solid` is the filled call to action — one per view. `subtle` is the
   * tinted workhorse for toolbars and panels. `ghost` disappears into its
   * surface until hovered, for rows of icon-ish actions.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Toggle state. Supplying it opts the button into `aria-pressed`; leaving
   * it undefined keeps the attribute off, which is correct for buttons that
   * act rather than toggle.
   */
  selected?: boolean;
}

const Root = styled('button', transient)<{
  $variant: ButtonVariant;
  $size: ButtonSize;
  $selected: boolean;
}>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme, $size }) =>
    $size === 'sm'
      ? `${theme.space[2]}px ${theme.space[4]}px`
      : `${theme.space[3]}px ${theme.space[6]}px`};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;

  background: ${({ theme, $variant, $selected }) =>
    $variant === 'solid' || $selected
      ? theme.color.accent.default
      : $variant === 'subtle'
        ? theme.color.bg.subtle
        : 'transparent'};

  color: ${({ theme, $variant, $selected }) =>
    $variant === 'solid' || $selected ? theme.color.accent.fg : theme.color.text.primary};

  /*
   * Durations resolve through the custom properties global.ts emits, so the
   * configured motion level applies here and the OS reduced-motion preference
   * overrides it, without this component knowing either exists.
   */
  transition:
    background-color ${({ theme }) => theme.motion.duration.fast}
      ${({ theme }) => theme.motion.easing.standard},
    color ${({ theme }) => theme.motion.duration.fast}
      ${({ theme }) => theme.motion.easing.standard},
    transform ${({ theme }) => theme.motion.duration.instant}
      ${({ theme }) => theme.motion.easing.standard};

  /*
   * aria-disabled is styled alongside :disabled throughout. A control that is
   * busy rather than inapplicable stays focusable — an evaluation that is
   * running, say — and it must still look and behave unavailable while it is.
   */
  &:hover:not(:disabled):not([aria-disabled='true']) {
    background: ${({ theme, $variant, $selected }) =>
      $variant === 'solid' || $selected
        ? theme.color.accent.hover
        : $variant === 'subtle'
          ? theme.color.bg.selected
          : theme.color.bg.subtle};
  }

  &:active:not(:disabled):not([aria-disabled='true']) {
    transform: translateY(1px);
  }

  &:disabled,
  &[aria-disabled='true'] {
    cursor: not-allowed;
    background: ${({ theme, $variant }) =>
      $variant === 'solid' ? theme.color.accent.disabled : 'transparent'};
    opacity: ${({ $variant }) => ($variant === 'solid' ? 1 : 0.6)};
  }
`;

/**
 * `type` defaults to `button` rather than the HTML default of `submit`, so a
 * button dropped inside a form cannot submit it by accident. Forms that do
 * want a submit pass `type="submit"` explicitly.
 */
export function Button({
  variant = 'subtle',
  size = 'sm',
  selected,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <Root
      type={type}
      $variant={variant}
      $size={size}
      $selected={selected ?? false}
      aria-pressed={selected}
      {...rest}
    />
  );
}
