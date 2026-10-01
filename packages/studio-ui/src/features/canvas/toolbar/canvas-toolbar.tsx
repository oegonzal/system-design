'use client';

import { PROMPT_COPY, type QualityRunStatus } from '@sysdesign/contracts';
import { Badge, type BadgeTone, Button, Toolbar } from '@sysdesign/design-system';

import { selectCanRedo, selectCanUndo } from '../canvas-store';
import { useCanvasStore } from '../canvas-store-context';
import type { DraftSaveStatus } from '../draft-status';
import { CANVAS_SHORTCUTS } from '../use-canvas-shortcuts';

export interface CanvasToolbarProps {
  onSubmit: () => void;
  /** True while the POST is in flight or the grading run is still running. */
  submitting: boolean;
  revisionStatus: QualityRunStatus | null;
  revisionNumber: number | null;
  /**
   * @deprecated The canvas store's `readOnly` is the source of truth; this is
   * OR-ed with it until every caller has moved.
   */
  readOnly?: boolean;
  /** The session's prompt is archived: the studio refuses a submit until it is back. */
  promptArchived?: boolean;
  /**
   * Why the grader cannot take a submit right now — a run already holds the
   * session, say (`describeInFlight`). Disables Submit and is its title.
   */
  submitBlockedReason?: string | null;
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
 * primitive yet, and a native confirm beats a hand-rolled half-modal — and
 * is one undo step like every other edit. Fit view asks the canvas to frame
 * the diagram the same way a load does. The coach has its own dock tab, so
 * no Improve button lives here. The draft badge reports the autosave;
 * without one the canvas's own dirty flag stands in.
 */
export function CanvasToolbar({
  onSubmit,
  submitting,
  revisionStatus,
  revisionNumber,
  readOnly: readOnlyProp = false,
  promptArchived = false,
  submitBlockedReason = null,
  draftStatus,
  onExport,
  exporting,
}: CanvasToolbarProps) {
  const dirty = useCanvasStore((state) => state.dirty);
  const isEmpty = useCanvasStore((state) => state.nodes.length === 0);
  const readOnly = useCanvasStore((state) => state.readOnly) || readOnlyProp;
  const canUndo = useCanvasStore(selectCanUndo);
  const canRedo = useCanvasStore(selectCanRedo);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const clear = useCanvasStore((state) => state.clear);
  const requestFit = useCanvasStore((state) => state.requestFit);

  const gradingInFlight = submitting || revisionStatus === 'running';
  const draftBadge = DRAFT_BADGE[draftStatus ?? (dirty ? 'unsaved' : 'clean')];
  // The first reason that applies is the one the button explains itself with.
  const submitTitle = submitBlockedReason ?? (promptArchived ? PROMPT_COPY.archived : undefined);

  const handleClear = () => {
    if (isEmpty) return;
    if (!window.confirm('Clear the canvas? Undo brings it back.')) return;
    clear();
  };

  return (
    <Toolbar aria-label="Canvas actions" gap={3}>
      <Button
        variant="solid"
        onClick={onSubmit}
        disabled={
          gradingInFlight || isEmpty || readOnly || promptArchived || submitBlockedReason !== null
        }
        title={submitTitle}
        data-testid="submit-revision"
      >
        Submit for grading
      </Button>
      <Button
        variant="subtle"
        onClick={undo}
        disabled={!canUndo}
        aria-keyshortcuts={CANVAS_SHORTCUTS.undo.ariaKeys}
        title="Undo (⌘Z / Ctrl+Z)"
        data-testid="canvas-undo"
      >
        Undo
      </Button>
      <Button
        variant="subtle"
        onClick={redo}
        disabled={!canRedo}
        aria-keyshortcuts={`${CANVAS_SHORTCUTS.redo.ariaKeys} ${CANVAS_SHORTCUTS.redoAlternate.ariaKeys}`}
        title="Redo (⇧⌘Z / Ctrl+Shift+Z)"
        data-testid="canvas-redo"
      >
        Redo
      </Button>
      <Button variant="subtle" onClick={handleClear} disabled={isEmpty || readOnly}>
        Clear
      </Button>
      <Button variant="subtle" onClick={requestFit} data-testid="canvas-fit">
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
