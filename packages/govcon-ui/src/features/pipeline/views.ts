/** What the pipeline tracks, one view each, in the order the tabs show them; the first is what the page opens on. */
export const PIPELINE_VIEWS = [
  { id: 'bids', label: 'Notices' },
  { id: 'targets', label: 'Firms and awards' },
] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number]['id'];

const DEFAULT_VIEW: PipelineView = PIPELINE_VIEWS[0].id;

/** The view an address names; anything else is the one the page opens on. */
export const pipelineViewOf = (raw: string | null): PipelineView =>
  PIPELINE_VIEWS.find((view) => view.id === raw)?.id ?? DEFAULT_VIEW;

/** The pipeline's address for one view — the view is the address, so a link can land on it. */
export const pipelineHref = (view: PipelineView): string =>
  view === DEFAULT_VIEW ? '/pipeline' : `/pipeline?view=${view}`;
