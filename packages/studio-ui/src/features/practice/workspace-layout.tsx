'use client';

import styled from '@emotion/styled';
import { Skeleton } from '@sysdesign/design-system';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

import { Palette } from '../canvas/palette/palette';
import { PropertiesPanel } from '../canvas/properties/properties-panel';

function CanvasSkeleton() {
  return <Skeleton variant="block" height="480px" />;
}

/**
 * React Flow measures DOM and reads `window` at module scope — client-only by
 * nature, so the canvas loads with `ssr: false` behind a skeleton while the
 * rest of the workspace server-renders.
 */
const SdCanvasLazy = dynamic(
  () => import('../canvas/sd-canvas').then((module) => ({ default: module.SdCanvas })),
  { ssr: false, loading: CanvasSkeleton },
);

const SIDE_COLUMN_WIDTH = { md: '200px', lg: '248px' };
const DOCK_COLUMN_WIDTH = { md: '320px', lg: '380px' };
/** Floor below which the shell's Main scrolls instead of crushing the canvas. */
const WORKSPACE_MIN_HEIGHT = '640px';
/** A tall node editor may not evict the palette from the side column. */
const PROPERTIES_MAX_SHARE = '45%';

/**
 * Fills the shell's Main (a flex column with a definite height): shrinkable
 * past its content so the columns clamp to the viewport and scroll
 * internally. Below the Layout floor the content overflows this box and Main
 * scrolls instead — the short-window degradation.
 */
const WorkspaceRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;

  ${({ theme }) => theme.media.md} {
    flex: 1 1 auto;
    min-height: 0;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space[5]}px;

  /* minmax(0, 1fr) on the row plus min-height: 0 on all three grid items is
     the load-bearing pair: it lets each column shrink to the row and scroll
     internally instead of content-sizing the whole page. */
  ${({ theme }) => theme.media.md} {
    grid-template-columns: ${SIDE_COLUMN_WIDTH.md} minmax(0, 1fr) ${DOCK_COLUMN_WIDTH.md};
    grid-template-rows: minmax(0, 1fr);
    flex: 1;
    min-height: ${WORKSPACE_MIN_HEIGHT};
  }

  ${({ theme }) => theme.media.lg} {
    grid-template-columns: ${SIDE_COLUMN_WIDTH.lg} minmax(0, 1fr) ${DOCK_COLUMN_WIDTH.lg};
  }
`;

const SideColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]}px;
  min-height: 0;
`;

const WorkspacePalette = styled(Palette)`
  max-height: 40vh;
  max-height: 40dvh;

  ${({ theme }) => theme.media.md} {
    flex: 1 1 0;
    min-height: 0;
    max-height: none;
  }
`;

const WorkspaceProperties = styled(PropertiesPanel)`
  overflow-y: auto;

  ${({ theme }) => theme.media.md} {
    flex: 0 1 auto;
    max-height: ${PROPERTIES_MAX_SHARE};
  }
`;

const CanvasColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]}px;
  min-width: 0;
  min-height: 0;
`;

const CanvasArea = styled.div`
  display: flex;
  flex-direction: column;
  height: 60vh; /* definite height so CanvasFrame's 100% binds when stacked */
  height: 60dvh;

  ${({ theme }) => theme.media.md} {
    height: auto;
    flex: 1;
    min-height: 0;
  }
`;

/** The session's title and, beside it, its status: the latest submission and its grade. */
const TitleRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => `${theme.space[2]}px ${theme.space[4]}px`};
`;

export interface WorkspaceLayoutProps {
  /** The session's title and, beside it, its status. */
  title: ReactNode;
  status: ReactNode;
  /** What sits above the canvas: its toolbar and the notices about it. */
  aboveCanvas: ReactNode;
  /** The dock beside the canvas. */
  dock: ReactNode;
}

/**
 * The practice page's frame: the title row, then three columns — the palette
 * and the properties, the canvas, the dock — that clamp to the viewport and
 * scroll inside, and stack when there is not room for them side by side.
 */
export function WorkspaceLayout({ title, status, aboveCanvas, dock }: WorkspaceLayoutProps) {
  return (
    <WorkspaceRoot>
      <TitleRow>
        {title}
        {status}
      </TitleRow>
      <Layout>
        <SideColumn>
          <WorkspacePalette />
          <WorkspaceProperties />
        </SideColumn>

        <CanvasColumn>
          {aboveCanvas}
          <CanvasArea>
            <SdCanvasLazy />
          </CanvasArea>
        </CanvasColumn>

        {dock}
      </Layout>
    </WorkspaceRoot>
  );
}
