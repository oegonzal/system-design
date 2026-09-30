/**
 * Where the unsubmitted draft stands against the server: `clean` (nothing
 * unsubmitted), `unsaved` (edited, the save still debouncing), `saving`,
 * `saved`, or `failed` (the last save did not land; the next edit retries).
 * Declared beside the canvas so the toolbar that shows it and the hook that
 * drives it share one vocabulary.
 */
export const DRAFT_SAVE_STATUSES = ['clean', 'unsaved', 'saving', 'saved', 'failed'] as const;
export type DraftSaveStatus = (typeof DRAFT_SAVE_STATUSES)[number];
