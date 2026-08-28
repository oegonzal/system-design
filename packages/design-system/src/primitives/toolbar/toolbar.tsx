import styled from '@emotion/styled';
import type { HTMLAttributes } from 'react';

import { transient } from '../../theme/styled';
import type { SpaceIndex } from '../../theme/tokens';

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Gap between grouped controls, as a space-scale index. */
  gap?: SpaceIndex;
  /**
   * Required in spirit: a page with several toolbars — canvas controls,
   * evaluation actions — is unnavigable without names. TypeScript cannot
   * demand it without forbidding `aria-labelledby`, so it is documented
   * instead.
   */
  'aria-label'?: string;
}

const Root = styled('div', transient)<{ $gap: SpaceIndex }>`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme, $gap }) => theme.space[$gap]}px;
`;

/**
 * A horizontal group of controls.
 *
 * `role="toolbar"` is the point of the primitive: it tells assistive
 * technology the buttons inside are one instrument panel, not scattered
 * actions. Wrapping is on by default because a canvas toolbar meets a narrow
 * viewport long before it deserves a redesign.
 */
export function Toolbar({ gap = 3, ...rest }: ToolbarProps) {
  return <Root role="toolbar" $gap={gap} {...rest} />;
}
