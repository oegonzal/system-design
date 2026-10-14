'use client';

import {
  DEFAULT_PIPELINE_LIMIT,
  TARGET_KINDS,
  type SaveTargetRequest,
  type Target,
  type TargetKind,
  type TargetStage,
} from '@sysdesign/contracts';
import { Alert, LiveRegion, SelectField, Spinner, Stack, Surface } from '@sysdesign/design-system';
import { useAction, useResource } from '@sysdesign/web-kit';
import { useState } from 'react';

import { api } from '../../api/client';
import { TARGET_KIND_LABEL } from './target-kinds';
import { TargetSummaryTiles } from './target-summary-tiles';
import { TargetsTable } from './targets-table';

const EVERY_KIND = 'all';

/**
 * The tracked firms and awards: the counts, then the rows — of both kinds,
 * or of one — paged. A row's stage changes in place and the whole of it
 * opens under the row; every change is one write, after which the open
 * panel closes and the page and the counts are read again.
 */
export function TargetsView() {
  const [shown, setShown] = useState<TargetKind | typeof EVERY_KIND>(EVERY_KIND);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const kind = shown === EVERY_KIND ? undefined : shown;

  const summary = useResource((signal) => api.getTargetSummary({ signal }), []);
  const page = useResource(
    (signal) => api.listTargets({ kind, limit: DEFAULT_PIPELINE_LIMIT, offset }, { signal }),
    [kind, offset],
  );
  /** One write to one target: `change` does it and answers what to announce. */
  const write = useAction(async (change: () => Promise<string>) => {
    setMessage(await change());
    setEditing(null);
    page.reload();
    summary.reload();
  });
  const move = (target: Target, stage: TargetStage) =>
    void write.run(async () => {
      const saved = await api.saveTarget(target.kind, target.subject, {
        label: target.label,
        stage,
      });
      return `${target.label} moved to ${saved.stage}.`;
    });
  const save = (target: Target, request: SaveTargetRequest) =>
    void write.run(async () => {
      await api.saveTarget(target.kind, target.subject, request);
      return `${target.label} saved.`;
    });
  const remove = (target: Target) =>
    void write.run(async () => {
      await api.removeTarget(target.kind, target.subject);
      return `${target.label} is no longer tracked.`;
    });

  return (
    <Stack gap={5}>
      <Surface as="section" aria-label="Targets summary">
        {summary.data ? (
          <TargetSummaryTiles summary={summary.data} />
        ) : summary.error ? (
          <Alert tone="danger">{summary.error}</Alert>
        ) : (
          <Spinner label="Counting the targets" />
        )}
      </Surface>
      <Surface as="section" aria-label="Tracked firms and awards">
        <Stack gap={4}>
          {/* A row, so the control is as wide as its choices and no wider. */}
          <Stack direction="row" gap={3} align="end" wrap>
            <SelectField
              label="Show"
              value={shown}
              onChange={(event) => {
                setShown(event.target.value as TargetKind | typeof EVERY_KIND);
                setOffset(0);
                setEditing(null);
              }}
            >
              <option value={EVERY_KIND}>Firms and awards</option>
              {TARGET_KINDS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {TARGET_KIND_LABEL[candidate]}s only
                </option>
              ))}
            </SelectField>
          </Stack>
          {page.data ? (
            <TargetsTable
              rows={page.data.data}
              total={page.data.meta.total}
              limit={page.data.meta.limit}
              offset={page.data.meta.offset}
              nowMs={Date.now()}
              onStageChange={move}
              editing={editing}
              onEdit={(id) => {
                write.reset();
                setEditing(id);
              }}
              onSave={save}
              onRemove={remove}
              onPage={setOffset}
              saving={write.pending}
              error={write.error}
            />
          ) : page.error ? (
            <Alert tone="danger">{page.error}</Alert>
          ) : (
            <Spinner label="Loading the targets" />
          )}
          {write.error && editing === null ? <Alert tone="danger">{write.error}</Alert> : null}
        </Stack>
      </Surface>
      <LiveRegion message={message} />
    </Stack>
  );
}
