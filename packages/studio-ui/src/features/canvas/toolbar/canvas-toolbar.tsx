'use client';

import styled from '@emotion/styled';
import { PROMPT_COPY } from '@sysdesign/contracts';
import { Badge, type BadgeTone, Button, Toolbar } from '@sysdesign/design-system';

import { selectCanRedo, selectCanUndo } from '../store/state';
import { useCanvasStore } from '../canvas-store-context';
import type { DraftSaveStatus } from '../draft-status';
import { CANVAS_SHORTCUTS } from '../use-canvas-shortcuts';

export interface CanvasToolbarProps {
  onSubmit: () => void;
  /** True while the POST is in flight or the grading run is still running. */
  submitting: boolean;
  /** The latest submission's grade is still running: nothing else is submitted until it lands. */
  grading?: boolean;
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

/** The draft badge per status; null shows nothing — a clean canvas has no draft to report. */
const DRAFT_BADGE: Record<DraftSaveStatus, { tone: BadgeTone; label: string } | null> = {
  clean: null,
  unsaved: { tone: 'accent', label: 'unsaved draft' },
  saving: { tone: 'neutral', label: 'saving draft…' },
  saved: { tone: 'success', label: 'draft saved' },
  failed: { tone: 'critical', label: 'draft not saved' },
};

/** Every label the draft badge can show: its slot is as wide as the widest of them, whatever it says. */
const DRAFT_LABELS = Object.values(DRAFT_BADGE).flatMap((badge) => (badge ? [badge.label] : []));

/**
 * The draft badge's place. Every label it can show is laid out in the same
 * cell, unseen, so the slot keeps one width through every status — the row
 * never rewraps, and the canvas under it never jumps, because an edit turned
 * `draft saved` into `unsaved draft`.
 */
const DraftSlot = styled.span`
  display: inline-grid;
  justify-items: start;
  align-items: center;

  > * {
    grid-area: 1 / 1;
  }
`;

/** One label's width, without its words: the text is generated content, so nothing reads or finds it. */
const LabelWidth = styled(Badge)`
  visibility: hidden;

  &::after {
    content: attr(data-label);
  }
`;

/**
 * The canvas instrument panel. Submit is the page's one solid button; Clear
 * confirms through `window.confirm` — the design system has no Dialog
 * primitive yet, and a native confirm beats a hand-rolled half-modal — and
 * is one undo step like every other edit. Fit view asks the canvas to frame
 * the diagram the same way a load does. The coach has its own dock tab, so
 * no Improve button lives here. The draft badge reports the autosave;
 * without one the canvas's own dirty flag stands in. It comes last, in a
 * slot of fixed width, so the toolbar's layout is the same in every draft
 * status. The session's own status — the latest submission and its grade
 * (`SubmissionStatus`) — sits beside the page's title, not here: the
 * toolbar is about the canvas and its draft, and six buttons plus the slot
 * are what fit on one row in the canvas column at a laptop's width.
 */
export function CanvasToolbar({
  onSubmit,
  submitting,
  grading = false,
  promptArchived = false,
  submitBlockedReason = null,
  draftStatus,
  onExport,
  exporting,
}: CanvasToolbarProps) {
  const dirty = useCanvasStore((state) => state.dirty);
  const isEmpty = useCanvasStore((state) => state.nodes.length === 0);
  const readOnly = useCanvasStore((state) => state.readOnly);
  const canUndo = useCanvasStore(selectCanUndo);
  const canRedo = useCanvasStore(selectCanRedo);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const clear = useCanvasStore((state) => state.clear);
  const requestFit = useCanvasStore((state) => state.requestFit);

  const gradingInFlight = submitting || grading;
  const draftBadge = DRAFT_BADGE[draftStatus ?? (dirty ? 'unsaved' : 'clean')];
  // The first reason that applies is the one the button explains itself with.
  const submitTitle = submitBlockedReason ?? (promptArchived ? PROMPT_COPY.archived : undefined);

  const handleClear = () => {
    if (isEmpty) return;
    if (!window.confirm('Clear the canvas? Undo brings it back.')) return;
    clear();
  };

  return (
    <Toolbar aria-label="Canvas actions" gap={2}>
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
      <DraftSlot data-testid="draft-slot">
        {DRAFT_LABELS.map((label) => (
          <LabelWidth key={label} aria-hidden data-label={label} />
        ))}
        {draftBadge !== null ? (
          <Badge tone={draftBadge.tone} data-testid="draft-status" data-status={draftStatus}>
            {draftBadge.label}
          </Badge>
        ) : null}
      </DraftSlot>
    </Toolbar>
  );
}
