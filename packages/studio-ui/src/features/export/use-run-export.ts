'use client';

import { useTheme } from '@emotion/react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback } from 'react';

import { exportRun, type RunExportInput } from './export-run';

/**
 * The run export as a page calls it: everything about the diagram — which
 * element to capture, where its blocks sit, what it is drawn on — comes from
 * the flow instance and the theme here, so the page passes only the run.
 * Must be used inside the `ReactFlowProvider` the canvas renders in.
 */
export function useRunExport(): (input: RunExportInput) => Promise<void> {
  const theme = useTheme();
  const { getNodes, getNodesBounds } = useReactFlow();
  const flow = useStoreApi();

  return useCallback(
    async (input: RunExportInput) => {
      const nodes = getNodes();
      const viewport =
        flow.getState().domNode?.querySelector<HTMLElement>('.react-flow__viewport') ?? null;
      await exportRun(
        input,
        viewport && nodes.length > 0
          ? { viewport, bounds: getNodesBounds(nodes), background: theme.color.bg.surface }
          : null,
      );
    },
    [flow, getNodes, getNodesBounds, theme],
  );
}
