'use client';

import styled from '@emotion/styled';
import { PROMPT_COPY, type QualityRunStatus } from '@sysdesign/contracts';
import { Badge, type BadgeTone, Button, Toolbar } from '@sysdesign/design-system';

import { GRADE_STATUS_LABEL } from '../../evaluation/score';
import { selectCanRedo, selectCanUndo } from '../canvas-store';
import { useCanvasStore } from '../canvas-store-context';
import type { DraftSaveStatus } from '../draft-status';
import { CANVAS_SHORTCUTS } from '../use-canvas-shortcuts';

export interface CanvasToolbarProps {
  onSubmit: () => void;
  /** True while the POST is in flight or the grading run is still running. */
  submitting: boolean;
  /**
   * The author's latest submission and where its grade stands — the session's
   * word, whatever the canvas shows: a revision loaded read-only, or a draft
   * restored from one, is not what this badge is about, and it says so.
   */
  revisionStatus: QualityRunStatus | null;
  revisionNumber: number | null;
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

/** The badges, kept together: they wrap under the buttons as one group or not at all. */
const Status = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
`;

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
 * without one the canvas's own dirty flag stands in. The badges come last —
 * the author's latest submission, named as that (`submitted #2 · graded`) so
 * it never reads as a label for whatever the canvas shows, then the draft in
 * its fixed slot — so the toolbar's layout is the same in every draft status.
 */
export function CanvasToolbar({
  onSubmit,
  submitting,
  revisionStatus,
  revisionNumber,
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
      <Status>
        {revisionStatus && revisionNumber !== null ? (
          <Badge
            tone={revisionStatus === 'failed' ? 'critical' : 'neutral'}
            title={`Your latest submission, revision #${revisionNumber}: ${GRADE_STATUS_LABEL[revisionStatus]}`}
            data-testid="submission-status"
            data-revision={revisionNumber}
            data-status={revisionStatus}
          >
            {`submitted #${revisionNumber} · ${GRADE_STATUS_LABEL[revisionStatus]}`}
          </Badge>
        ) : null}
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
      </Status>
    </Toolbar>
  );
}
