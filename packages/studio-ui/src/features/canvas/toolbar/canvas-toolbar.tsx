'use client';

import type { QualityRunStatus } from '@sysdesign/contracts';
import { Badge, type BadgeTone, Button, Toolbar } from '@sysdesign/design-system';
import { useReactFlow } from '@xyflow/react';

import { useCanvasStore } from '../canvas-store-context';
import type { DraftSaveStatus } from '../draft-status';

export interface CanvasToolbarProps {
  onSubmit: () => void;
  /** True while the POST is in flight or the grading run is still running. */
  submitting: boolean;
  revisionStatus: QualityRunStatus | null;
  revisionNumber: number | null;
  /** A revision is on screen: nothing here may change or submit it. */
  readOnly?: boolean;
  /** The session's prompt is archived: the studio refuses a submit until it is back. */
  promptArchived?: boolean;
  /** Where the unsubmitted draft stands against the server. */
  draftStatus?: DraftSaveStatus;
  /** Download the run (diagram PDF + per-artifact Markdown) as one zip. */
  onExport: () => void;
  exporting: boolean;
}

const STATUS_LABEL: Record<QualityRunStatus, string> = {
  running: 'grading…',
  complete: 'graded',
  failed: 'grading failed',
};

const ARCHIVED_TITLE = 'This prompt is archived — reactivate it to submit.';

/** The draft badge per status; null shows nothing — a clean canvas has no draft to report. */
const DRAFT_BADGE: Record<DraftSaveStatus, { tone: BadgeTone; label: string } | null> = {
  clean: null,
  unsaved: { tone: 'accent', label: 'unsaved draft' },
  saving: { tone: 'neutral', label: 'saving draft…' },
  saved: { tone: 'success', label: 'draft saved' },
  failed: { tone: 'critical', label: 'draft not saved' },
};

/**
 * The canvas instrument panel. Submit is the page's one solid button; Clear
 * confirms through `window.confirm` — the design system has no Dialog
 * primitive yet, and a native confirm beats a hand-rolled half-modal. The
 * coach has its own dock tab, so no Improve button lives here. The draft
 * badge reports the autosave; without one the canvas's own dirty flag
 * stands in.
 */
export function CanvasToolbar({
  onSubmit,
  submitting,
  revisionStatus,
  revisionNumber,
  readOnly = false,
  promptArchived = false,
  draftStatus,
  onExport,
  exporting,
}: CanvasToolbarProps) {
  const dirty = useCanvasStore((state) => state.dirty);
  const isEmpty = useCanvasStore((state) => state.nodes.length === 0);
  const setGraph = useCanvasStore((state) => state.setGraph);
  const markDirty = useCanvasStore((state) => state.markDirty);
  const { fitView } = useReactFlow();

  const gradingInFlight = submitting || revisionStatus === 'running';
  const draftBadge = DRAFT_BADGE[draftStatus ?? (dirty ? 'unsaved' : 'clean')];

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
        disabled={gradingInFlight || isEmpty || readOnly || promptArchived}
        title={promptArchived ? ARCHIVED_TITLE : undefined}
        data-testid="submit-revision"
      >
        Submit for grading
      </Button>
      <Button variant="subtle" onClick={handleClear} disabled={isEmpty || readOnly}>
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
      {draftBadge !== null ? (
        <Badge tone={draftBadge.tone} data-testid="draft-status" data-status={draftStatus}>
          {draftBadge.label}
        </Badge>
      ) : null}
      {revisionStatus && revisionNumber !== null ? (
        <Badge tone={revisionStatus === 'failed' ? 'critical' : 'neutral'}>
          {`rev #${revisionNumber} · ${STATUS_LABEL[revisionStatus]}`}
        </Badge>
      ) : null}
    </Toolbar>
  );
}
