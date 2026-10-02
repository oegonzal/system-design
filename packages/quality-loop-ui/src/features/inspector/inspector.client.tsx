'use client';

import { Alert, Heading, Spinner, Stack, Surface, Text } from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import { useCallback, useMemo, useState } from 'react';

import { api } from '../../api/client';
import { useLink } from '../../components/link-context';
import { EvidencePanel } from '../results/evidence-panel';
import { criteriaRows, findingGroups } from '../results/select';
import { ACTION_GROUPS, type ActionGroup } from './model/action';
import { invocationsOf, invocationTotals } from './model/exchange-invocations';
import { inspectHref } from './model/inspect-link';
import { lensContributions } from './model/lens-contributions';
import { dimensionRows, gateRows, policyNumbers, validatorRows } from './model/policy-view';
import { groupsPresent, timelineRows } from './model/select';
import type { InspectorState } from './model/state';
import { beforeOf, entryByKey } from './model/timeline';
import { RunPicker } from './run-picker';
import { useInspectTarget } from './use-inspect-target';
import { useRunTimeline } from './use-run-timeline';
import { ExchangeList } from './view/exchange-list';
import { Inspector } from './view/inspector';
import { LensPanel } from './view/lens-panel';
import { PolicyPanel } from './view/policy-panel';

const RECENT_LIMIT = 30;

const ALL_GROUPS = new Set(Object.keys(ACTION_GROUPS) as ActionGroup[]);

/**
 * The inspector's one container, and the only file here that knows about the
 * router, the API or the clock.
 *
 * What is being inspected lives in the URL; which action is selected lives there
 * too, so a link reopens the same moment. Everything else below this is
 * presentational and takes what it shows as props.
 *
 * Following is a consequence of selection rather than a mode of its own: with no
 * action named, the latest is shown and keeps being the latest; naming one pins
 * it. That is why scrolling never detaches anybody — a scroll heuristic fights
 * momentum scrolling and would detach a reader who was only reading.
 */
export function InspectorClient() {
  const { target, point } = useInspectTarget();
  const Link = useLink();
  const runs = useResource((signal) => api.listRuns({ limit: RECENT_LIMIT }, { signal }), []);
  const { timeline, run, error, isPolling, unreachable } = useRunTimeline(target.run);
  const pipelines = useResource((signal) => api.listPipelines({ signal }), []);
  const pipeline =
    run === null ? null : (pipelines.data?.find((entry) => entry.id === run.pipeline) ?? null);

  const [shown, setShown] = useState<ReadonlySet<ActionGroup>>(ALL_GROUPS);
  const [ignoreTimings, setIgnoreTimings] = useState(false);

  const rows = useMemo(
    () => timelineRows(timeline, { groups: shown, ignoreTimings }),
    [timeline, shown, ignoreTimings],
  );
  const available = useMemo(() => groupsPresent(timeline), [timeline]);

  const named = entryByKey(timeline, target.action);
  // A link may name an action this log no longer holds — trimmed, or from another
  // run. The latest stands in, and the banner says the link went stale.
  const index = named === -1 ? timeline.entries.length - 1 : named;
  const stale = target.action !== null && named === -1 && timeline.entries.length > 0;

  const selectedRow = rows.find((row) => row.entry.ordinal === timeline.entries[index]?.ordinal);
  const selected =
    index < 0 || selectedRow === undefined
      ? null
      : { row: selectedRow, before: beforeOf(timeline, index) };

  const onToggleGroup = useCallback((group: ActionGroup) => {
    setShown((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const onSelect = useCallback((key: string) => point({ action: key }), [point]);
  const onFollow = useCallback(() => point({ action: null }), [point]);

  // The panels read the state the selected action produced, which is what makes
  // the rail a scrubber over the whole run rather than a log of it.
  const panels = useMemo(() => {
    const state: InspectorState | null = selected?.row.entry.after ?? null;
    if (state === null) return undefined;
    const invocations = invocationsOf(state.exchanges);
    return [
      {
        id: 'lenses',
        label: 'Lenses',
        content: <LensPanel contributions={lensContributions(state, pipeline)} />,
      },
      {
        id: 'policy',
        label: 'Policy',
        content: (
          <PolicyPanel
            numbers={policyNumbers(pipeline?.policy ?? null)}
            gates={gateRows(pipeline?.controller ?? null, state.decision?.trace ?? null)}
            dimensions={dimensionRows(pipeline?.policy ?? null, state.decision?.trace ?? null)}
            validators={validatorRows(pipeline, state.validation)}
            overall={state.decision?.scores.overall ?? null}
          />
        ),
      },
      {
        id: 'ledger',
        label: 'Ledger',
        content: (
          <EvidencePanel
            rows={criteriaRows(state.contract.criteria, state.ledger.criteria)}
            groups={findingGroups(state.ledger.findings, state.remediations)}
            remediations={state.remediations}
            diagnostics={state.ledger.diagnostics}
          />
        ),
      },
      {
        id: 'calls',
        label: 'Model calls',
        content: <ExchangeList invocations={invocations} totals={invocationTotals(invocations)} />,
      },
    ];
  }, [selected, pipeline]);

  const reconstructed = timeline.entries.filter(
    (entry) => entry.provenance === 'reconstructed',
  ).length;
  const recorded = timeline.entries.length - reconstructed;
  const provenanceNote =
    recorded === 0
      ? `All ${reconstructed} actions were read back out of one recorded snapshot. Their order and their payloads are what the engine declared; the times shown are only the ones the record itself carries.`
      : `${reconstructed} actions were read out of the first snapshot — faithful about what happened and about its order, not about wall-clock time. The other ${recorded} were seen arriving, and carry the moment they were observed.`;

  return (
    <Stack gap={6}>
      <Surface as="section" aria-label="Runs to inspect">
        <Stack gap={4}>
          <Heading level={2}>Inspect a run</Heading>
          <Text tone="secondary" size="sm">
            Pick a run to read its machinery: what each lens answered, what survived agreement, how
            the evidence became a number, and what changed from one iteration to the next.
          </Text>
          {runs.data ? (
            <RunPicker
              runs={runs.data.data}
              selectedRunId={target.run}
              hrefFor={(runId) => inspectHref({ ...target, run: runId, action: null })}
              link={Link}
            />
          ) : runs.error ? (
            <Alert tone="danger">{runs.error}</Alert>
          ) : (
            <Spinner label="Loading runs" />
          )}
        </Stack>
      </Surface>

      {target.run === null ? (
        <Alert tone="info">Select a run above to read what the loop did.</Alert>
      ) : (
        <Stack gap={4}>
          {error !== null && <Alert tone="danger">{error}</Alert>}
          {unreachable && <Alert tone="warn">Cannot reach the quality loop — retrying.</Alert>}
          {stale && (
            <Alert tone="warn">
              That link names an action this log no longer holds. Showing the latest instead.
            </Alert>
          )}
          {timeline.entries.length === 0 ? (
            <Spinner label="Reading the run" />
          ) : (
            <Inspector
              rows={rows}
              total={timeline.entries.length}
              dropped={timeline.dropped}
              selectedKey={selected?.row.entry.action.key ?? null}
              onSelect={onSelect}
              selected={selected}
              available={available}
              shown={shown}
              onToggleGroup={onToggleGroup}
              ignoreTimings={ignoreTimings}
              onIgnoreTimings={setIgnoreTimings}
              following={isPolling ? target.action === null : null}
              behind={Math.max(0, timeline.entries.length - 1 - index)}
              onFollow={onFollow}
              provenanceNote={provenanceNote}
              panels={panels}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}
