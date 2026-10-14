import { renderWithTheme } from '@sysdesign/web-testing';

import { makeHeartbeat } from '../../testing/fixtures';
import { ImprovementPanel, type ImprovementPanelProps } from './improvement-panel';

export const noop = () => undefined;
/** A grader that answers, with a live heartbeat. */
export const LIVE = { status: 'reachable', model: 'claude', heartbeat: makeHeartbeat() } as const;

/** The panel with no run, a reachable grader and inert callbacks, and whatever the case adds. */
export function renderPanel(overrides: Partial<ImprovementPanelProps> = {}) {
  return renderWithTheme(
    <ImprovementPanel
      run={null}
      error={null}
      isPolling={false}
      message=""
      availability={LIVE}
      onStart={noop}
      onLoadRevision={noop}
      {...overrides}
    />,
  );
}
