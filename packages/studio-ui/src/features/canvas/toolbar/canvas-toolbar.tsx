'use client';

import type { QualityRunStatus } from '@sysdesign/contracts';
import { Badge, Button, Toolbar } from '@sysdesign/design-system';
import { useReactFlow } from '@xyflow/react';

import { useCanvasStore } from '../canvas-store-context';

export interface CanvasToolbarProps {
  onSubmit: () => void;
  /** True while the POST is in flight or the grading run is still running. */
  submitting: boolean;
  revisionStatus: QualityRunStatus | null;
  revisionNumber: number | null;
  /** Download the run (diagram PDF + per-artifact Markdown) as one zip. */
  onExport: () => void;
  exporting: boolean;
}

const STATUS_LABEL: Record<QualityRunStatus, string> = {
  running: 'grading…',
  complete: 'graded',
  failed: 'grading failed',
};

/**
 * The canvas instrument panel. Submit is the page's one solid button; Clear
 * confirms through `window.confirm` — the design system has no Dialog
 * primitive yet, and a native confirm beats a hand-rolled half-modal. The
 * coach has its own dock tab, so no Improve button lives here.
 */
export function CanvasToolbar({
  onSubmit,
  submitting,
  revisionStatus,
  revisionNumber,
  onExport,
  exporting,
}: CanvasToolbarProps) {
  const dirty = useCanvasStore((state) => state.dirty);
  const isEmpty = useCanvasStore((state) => state.nodes.length === 0);
  const setGraph = useCanvasStore((state) => state.setGraph);
  const markDirty = useCanvasStore((state) => state.markDirty);
  const { fitView } = useReactFlow();

  const gradingInFlight = submitting || revisionStatus === 'running';

  const handleClear = () => {
    if (isEmpty) return;
    if (!window.confirm('Clear the canvas? The current draft is lost.')) return;
    setGraph({ nodes: [], edges: [] });
    markDirty();
  };

  return (
    <Toolbar aria-label="Canvas actions" gap={3}>
      <Button
        variant="solid"
        onClick={onSubmit}
        disabled={gradingInFlight || isEmpty}
        data-testid="submit-revision"
      >
        Submit for grading
      </Button>
      <Button variant="subtle" onClick={handleClear} disabled={isEmpty}>
        Clear
      </Button>
      <Button variant="subtle" onClick={() => void fitView({ padding: 0.2 })}>
        Fit view
      </Button>
      <Button
        variant="subtle"
        onClick={onExport}
        disabled={exporting || isEmpty}
        data-testid="export-run"
      >
        {exporting ? 'Exporting…' : 'Export'}
      </Button>
      {dirty ? <Badge tone="accent">unsaved draft</Badge> : null}
      {revisionStatus && revisionNumber !== null ? (
        <Badge tone={revisionStatus === 'failed' ? 'critical' : 'neutral'}>
          {`rev #${revisionNumber} · ${STATUS_LABEL[revisionStatus]}`}
        </Badge>
      ) : null}
    </Toolbar>
  );
}
