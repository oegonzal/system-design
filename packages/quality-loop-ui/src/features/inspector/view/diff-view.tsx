import { Stack, Tab, TabList, TabPanel, Tabs, Text } from '@sysdesign/design-system';
import { useState, type ReactNode } from 'react';

import type { JsonChange } from '../model/changes';
import type { InspectorState } from '../model/state';
import { ChangeList } from './change-list';
import { JsonTree } from './json-tree';
import { TextDiff } from './text-diff';

/**
 * One action's effect, three ways.
 *
 * The delta is the authority on what changed, so `Changes` is the default. The
 * tree is the authority on context — the unchanged siblings a delta cannot
 * mention — and `Text` appears only when the rendered artifact is one of the
 * things that moved, because that is the one field a whole-value comparison
 * fails to explain.
 *
 * The panels after those read the same state this action produced rather than
 * the latest, which is what makes the rail a scrubber: pick a moment, then read
 * the lenses, the policy or the ledger as of that moment.
 */

const RENDERED_PATH = 'artifact.rendered';

export interface DiffViewProps {
  before: InspectorState;
  after: InspectorState;
  changes: readonly JsonChange[];
  /** Further ways to read the state this action produced, each a tab of its own. */
  panels?: readonly { id: string; label: string; content: ReactNode }[];
}

const NO_PANELS: readonly { id: string; label: string; content: ReactNode }[] = [];

export function DiffView({ before, after, changes, panels = NO_PANELS }: DiffViewProps) {
  const renderedChanged = changes.some((change) => change.path === RENDERED_PATH);
  const [chosen, setChosen] = useState('changes');
  // The rendered-text tab exists only for an action that moved the artifact's
  // text. Holding a choice that is no longer offered left every panel hidden and
  // the detail pane blank, so a tab that is not on offer falls back to the one
  // that always is.
  const offered = [
    'changes',
    'state',
    ...(renderedChanged ? ['text'] : []),
    ...panels.map((p) => p.id),
  ];
  const tab = offered.includes(chosen) ? chosen : 'changes';
  const setTab = setChosen;

  return (
    <Tabs value={tab} onChange={setTab}>
      <TabList aria-label="How to read this action">
        <Tab value="changes">Changes ({changes.length})</Tab>
        <Tab value="state">State</Tab>
        {renderedChanged && <Tab value="text">Rendered text</Tab>}
        {panels.map((panel) => (
          <Tab key={panel.id} value={panel.id}>
            {panel.label}
          </Tab>
        ))}
      </TabList>
      <TabPanel value="changes">
        <ChangeList changes={changes} />
      </TabPanel>
      <TabPanel value="state">
        <Stack gap={2}>
          <Text tone="muted" size="sm">
            The state after this action, with what changed marked. Branches holding a change are
            already open.
          </Text>
          <JsonTree value={after} changes={changes} label="State after this action" />
        </Stack>
      </TabPanel>
      {renderedChanged && (
        <TabPanel value="text">
          <TextDiff
            before={before.artifact?.rendered ?? null}
            after={after.artifact?.rendered ?? null}
          />
        </TabPanel>
      )}
      {panels.map((panel) => (
        <TabPanel key={panel.id} value={panel.id}>
          {panel.content}
        </TabPanel>
      ))}
    </Tabs>
  );
}
