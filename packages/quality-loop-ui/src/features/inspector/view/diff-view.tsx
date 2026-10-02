import { Stack, Tab, TabList, TabPanel, Tabs, Text } from '@sysdesign/design-system';
import { useState } from 'react';

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
 */

const RENDERED_PATH = 'artifact.rendered';

export interface DiffViewProps {
  before: InspectorState;
  after: InspectorState;
  changes: readonly JsonChange[];
}

export function DiffView({ before, after, changes }: DiffViewProps) {
  const renderedChanged = changes.some((change) => change.path === RENDERED_PATH);
  const [tab, setTab] = useState('changes');

  return (
    <Tabs value={tab} onChange={setTab}>
      <TabList aria-label="How to read this action">
        <Tab value="changes">Changes ({changes.length})</Tab>
        <Tab value="state">State</Tab>
        {renderedChanged && <Tab value="text">Rendered text</Tab>}
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
    </Tabs>
  );
}
