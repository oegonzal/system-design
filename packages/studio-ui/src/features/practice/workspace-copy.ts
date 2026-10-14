import type { DraftSaveStatus } from '../canvas/draft-status';

/** What the tab says before it lets an in-app navigation leave an unsaved edit behind. */
export const LEAVE_WHILE_SAVING = 'Your draft is still being saved. Leave anyway?';

/**
 * What loading a revision onto the canvas costs the draft, by where the
 * autosave stands; null asks nothing. A saved draft stays on the server —
 * the session reopens on it — and only "Restore as draft" replaces it;
 * edits that have not reached the server leave the screen with nothing
 * behind them.
 */
export const LOAD_REVISION_CONFIRM: Record<DraftSaveStatus, string | null> = {
  clean: null,
  saved:
    'Load this revision read-only? Your draft stays saved — the session reopens on it, and only restoring this revision as the draft replaces it.',
  unsaved: 'Load this revision? Your latest edits are not saved yet and will be lost.',
  saving: 'Load this revision? Your latest edits are still being saved and may be lost.',
  failed: 'Load this revision? Your latest edits could not be saved and will be lost.',
};
