'use client';

import type { EvalStatus } from '@sysdesign/contracts';
import { Badge, Button, Toolbar } from '@sysdesign/design-system';
import { useReactFlow } from '@xyflow/react';

import { useCanvasStore } from '../canvas-store-context';

export interface CanvasToolbarProps {
  onSubmit: () => void;
  /** True while the POST is in flight or the evaluation is queued/running. */
  submitting: boolean;
  revisionStatus: EvalStatus | null;
  revisionNumber: number | null;
}

const STATUS_LABEL: Record<EvalStatus, string> = {
  queued: 'evaluation queued',
  running: 'evaluating…',
  complete: 'evaluated',
  failed: 'evaluation failed',
};

/**
 * The canvas instrument panel. Submit is the page's one solid button; Clear
 * confirms through `window.confirm` — the design system has no Dialog
 * primitive yet, and a native confirm beats a hand-rolled half-modal.
 */
export function CanvasToolbar({
  onSubmit,
  submitting,
  revisionStatus,
  revisionNumber,
}: CanvasToolbarProps) {
  const dirty = useCanvasStore((state) => state.dirty);
  const isEmpty = useCanvasStore((state) => state.nodes.length === 0);
  const setGraph = useCanvasStore((state) => state.setGraph);
  const markDirty = useCanvasStore((state) => state.markDirty);
  const { fitView } = useReactFlow();

  const evaluationInFlight =
    submitting || revisionStatus === 'queued' || revisionStatus === 'running';

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
        disabled={evaluationInFlight || isEmpty}
        data-testid="submit-revision"
      >
        Submit for evaluation
      </Button>
      <Button variant="subtle" onClick={handleClear} disabled={isEmpty}>
        Clear
      </Button>
      <Button variant="subtle" onClick={() => void fitView({ padding: 0.2 })}>
        Fit view
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
