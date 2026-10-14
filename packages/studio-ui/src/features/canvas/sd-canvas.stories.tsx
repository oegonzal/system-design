import styled from '@emotion/styled';
import type { CanvasGraph } from '@sysdesign/contracts';
import { Button } from '@sysdesign/design-system';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlowProvider } from '@xyflow/react';
import { useState, type ReactNode } from 'react';

import { makeGraph } from '../../testing/canvas-fixtures';
import { withCanvasStore } from '../../testing/story-decorators';
import { useCanvasStoreApi } from './canvas-store-context';
import { SdCanvas } from './sd-canvas';

/** The workspace's canvas column in miniature: whatever sits above the canvas takes its height from it. */
const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  width: 720px;
  height: 560px;
`;

const Area = styled.div`
  flex: 1 1 0;
  min-height: 0;
`;

const Banner = styled.div`
  padding: ${({ theme }) => theme.space[4]}px;
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.subtle};
  color: ${({ theme }) => theme.color.text.primary};
  font-family: ${({ theme }) => theme.font.family.base};
`;

/** The canvas as the workspace mounts it: inside the page's React Flow provider, under whatever sits above it. */
function Workspace({ above }: { above?: ReactNode }) {
  return (
    <ReactFlowProvider>
      <Column>
        {above}
        <Area>
          <SdCanvas />
        </Area>
      </Column>
    </ReactFlowProvider>
  );
}

const meta: Meta<typeof SdCanvas> = {
  title: 'Studio/Canvas/SdCanvas',
  component: SdCanvas,
  render: () => <Workspace />,
};
export default meta;

type Story = StoryObj<typeof SdCanvas>;

/** Nothing drawn yet: the viewport rests at 100% and waits for the first block. */
export const Empty: Story = { decorators: [withCanvasStore()] };

/**
 * A graph loaded before the canvas mounted — how a session opens. The whole
 * diagram is framed once the blocks are measured, never past 100%, clear of
 * the minimap and the zoom controls.
 */
export const Loaded: Story = {
  decorators: [
    withCanvasStore((store) =>
      store.getState().setGraph(
        makeGraph({
          nodes: makeGraph().nodes.map((node, index) => ({
            ...node,
            position: { x: 900 + index * 260, y: 700 + index * 180 },
          })),
        }),
      ),
    ),
  ],
};

const BUSY: CanvasGraph = {
  nodes: Array.from({ length: 15 }, (_, index) => ({
    id: `n-${index + 1}`,
    kind: 'service' as const,
    label: `Service ${index + 1}`,
    position: { x: 20 + (index % 3) * 236, y: 20 + Math.floor(index / 3) * 88 },
  })),
  edges: [],
};

/**
 * Blocks edge to edge. A block added from the palette takes whatever free
 * place is still in view; once there is none it goes beside the diagram and
 * the view moves to show it.
 */
export const Busy: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(BUSY))],
};

const CROSSING: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Client', position: { x: 200, y: 20 } },
    { id: 'n-2', kind: 'cdn', label: 'Edge CDN', position: { x: 190, y: 180 } },
    { id: 'n-3', kind: 'dns', label: 'DNS', position: { x: 200, y: 340 } },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-3', kind: 'sync', label: 'resolve' },
    { id: 'e-2', source: 'n-1', target: 'n-2', kind: 'sync', label: 'static assets' },
  ],
};

/**
 * A connection whose midpoint falls on a third block: the pill moves along
 * the line until it is clear of every block, so no title is covered.
 */
export const PillClearOfBlocks: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(CROSSING))],
};

function RevisionLoader() {
  const store = useCanvasStoreApi();
  const [viewing, setViewing] = useState(false);
  return (
    <>
      {viewing ? <Banner>Viewing revision #1 — read-only.</Banner> : null}
      <div>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            store.getState().setGraph(makeGraph());
            setViewing(true);
          }}
        >
          Load a revision
        </Button>
      </div>
    </>
  );
}

/**
 * Loading a revision puts a banner above the canvas in the same breath. The
 * diagram is framed for the frame the banner leaves, not the one before it.
 */
export const RevisionLoadedUnderABanner: Story = {
  decorators: [withCanvasStore((store) => store.getState().setGraph(makeGraph()))],
  render: () => <Workspace above={<RevisionLoader />} />,
};
