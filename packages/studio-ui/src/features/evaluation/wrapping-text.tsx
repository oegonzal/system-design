'use client';

import styled from '@emotion/styled';
import { Text } from '@sysdesign/design-system';

/**
 * Body copy that may carry a long unbroken token — a ref list the loop wrote,
 * an id no glossary held — and must wrap inside the dock rather than widen it.
 */
export const WrappingText = styled(Text)`
  overflow-wrap: anywhere;
`;
