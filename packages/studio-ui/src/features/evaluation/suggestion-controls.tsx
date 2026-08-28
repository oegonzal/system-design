'use client';

import styled from '@emotion/styled';
import { Button, Stack, Text } from '@sysdesign/design-system';

import { useCanvasStore } from '../canvas/canvas-store-context';

const Root = styled.div`
  padding: ${({ theme }) => theme.space[4]}px;
  border: 1px dashed ${({ theme }) => theme.color.border.accent};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.selected};
`;

/**
 * Shown while a suggestion patch is previewed as ghost elements on the
 * canvas. Accept merges it into the draft; Dismiss removes the overlay.
 */
export function SuggestionControls() {
  const ghost = useCanvasStore((state) => state.ghost);
  const acceptGhost = useCanvasStore((state) => state.acceptGhost);
  const clearGhost = useCanvasStore((state) => state.clearGhost);

  if (!ghost) return null;

  return (
    <Root data-testid="suggestion-controls">
      <Stack gap={3}>
        <Text size="sm">{ghost.patch.description}</Text>
        <Stack direction="row" gap={2}>
          <Button variant="solid" onClick={acceptGhost} data-testid="accept-suggestion">
            Accept fix
          </Button>
          <Button variant="ghost" onClick={clearGhost} data-testid="dismiss-suggestion">
            Dismiss
          </Button>
        </Stack>
      </Stack>
    </Root>
  );
}
