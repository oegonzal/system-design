import { Alert, Badge, Heading, Stack, Surface, Text } from '@sysdesign/design-system';

import type { ReactNode } from 'react';

import type { ActionGroup } from '../model/action';
import type { TimelineRow } from '../model/select';
import type { InspectorState } from '../model/state';
import { ActionList } from './action-list';
import { DiffView } from './diff-view';
import { ScopeChips } from './scope-chips';
import { TimelineToolbar } from './timeline-toolbar';
import { InspectorLayout } from './inspector-layout';
import { PROVENANCE_TONE } from './tones';

/**
 * The inspector as one presentational component: the toolbar, the rail of
 * actions, and the selected action's effect.
 *
 * Everything it shows arrives as props. It fetches nothing, polls nothing and
 * knows nothing about the router — which is what lets it be rendered in the
 * catalog, run through axe, and specced without a DOM-shaped harness around it.
 */

export interface InspectorProps {
  rows: readonly TimelineRow[];
  total: number;
  dropped: number;
  selectedKey: string | null;
  onSelect(key: string): void;
  /** The state the selected action was applied to, and the state after it. */
  selected: { row: TimelineRow; before: InspectorState } | null;
  available: readonly ActionGroup[];
  shown: ReadonlySet<ActionGroup>;
  onToggleGroup(group: ActionGroup): void;
  ignoreTimings: boolean;
  onIgnoreTimings(next: boolean): void;
  following: boolean | null;
  behind: number;
  onFollow(): void;
  /** A banner above everything — how much of this log is reconstructed. */
  provenanceNote: string;
  /**
   * Further readings of the selected action's state — the lenses, the policy,
   * the ledger, the model calls. Built by the container, since each is a join
   * against something the state alone does not carry.
   */
  panels?: readonly { id: string; label: string; content: ReactNode }[];
}

export function Inspector({
  rows,
  total,
  dropped,
  selectedKey,
  onSelect,
  selected,
  available,
  shown,
  onToggleGroup,
  ignoreTimings,
  onIgnoreTimings,
  following,
  behind,
  onFollow,
  provenanceNote,
  panels,
}: InspectorProps) {
  return (
    <Stack gap={5}>
      <Alert tone="info" title="What this log is">
        {provenanceNote}
      </Alert>
      <TimelineToolbar
        available={available}
        shown={shown}
        onToggleGroup={onToggleGroup}
        ignoreTimings={ignoreTimings}
        onIgnoreTimings={onIgnoreTimings}
        following={following}
        behind={behind}
        onFollow={onFollow}
        total={total}
        shownCount={rows.length}
        dropped={dropped}
      />
      <InspectorLayout
        rail={
          <Surface as="section" aria-label="What happened">
            <ActionList rows={rows} selectedKey={selectedKey} onSelect={onSelect} />
          </Surface>
        }
        detail={
          selected === null ? (
            <Surface as="section" aria-label="One action">
              <Text tone="muted">Select an action to see what it changed.</Text>
            </Surface>
          ) : (
            <Surface as="section" aria-label="One action">
              <Stack gap={4}>
                <Stack gap={2}>
                  <Stack direction="row" gap={3} align="baseline" wrap>
                    <Heading level={2}>{selected.row.entry.action.label}</Heading>
                    <Badge tone={PROVENANCE_TONE[selected.row.entry.provenance]}>
                      {selected.row.entry.provenance}
                    </Badge>
                    {selected.row.entry.corrected && <Badge tone="high">corrected</Badge>}
                  </Stack>
                  <Stack direction="row" gap={2} align="center" wrap>
                    <Badge tone="neutral">{selected.row.entry.action.type}</Badge>
                    <ScopeChips scope={selected.row.entry.action.scope} />
                  </Stack>
                </Stack>
                <DiffView
                  before={selected.before}
                  after={selected.row.entry.after}
                  changes={selected.row.changes}
                  panels={panels}
                />
              </Stack>
            </Surface>
          )
        }
      />
    </Stack>
  );
}
