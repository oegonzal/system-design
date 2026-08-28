import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';

/**
 * Content for assistive technology only.
 *
 * A type alias rather than an empty interface, which sidesteps
 * `@typescript-eslint/no-empty-object-type` without an eslint-disable.
 */
export type VisuallyHiddenProps = HTMLAttributes<HTMLElement>;

/**
 * The modern clip-path recipe. `display: none` and `visibility: hidden`
 * remove the node from the accessibility tree, which is the opposite of the
 * intent.
 *
 * Styled with the `transient` filter so `as` swaps the tag — a hidden
 * heading or list item keeps its semantics.
 *
 * There is deliberately no `:focus` un-hiding here — a control that reveals
 * itself on focus is a `SkipLink`, and conflating the two produces a
 * component that is wrong for both jobs.
 */
export const VisuallyHidden = styled('span', transient)<VisuallyHiddenProps>`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
`;
