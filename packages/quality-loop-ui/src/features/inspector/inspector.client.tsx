'use client';

import {
  Alert,
  Heading,
  Spinner,
  Stack,
  Surface,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@sysdesign/design-system';
import { useResource } from '@sysdesign/web-kit';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { api } from '../../api/client';
import { useLink } from '../../components/link-context';
import { EvidencePanel } from '../results/evidence-panel';
import { criteriaRows, findingGroups } from '../results/select';
import { ACTION_GROUPS, type ActionGroup } from './model/action';
import { dataFlow, flowTotals } from './model/data-flow';
import { filesForCall } from './model/dump-files';
import { invocationsOf, invocationTotals, type Invocation } from './model/exchange-invocations';
import { inspectHref } from './model/inspect-link';
import { lensContributions } from './model/lens-contributions';
import { dimensionRows, gateRows, policyNumbers, validatorRows } from './model/policy-view';
import { groupsPresent, timelineRows } from './model/select';
import { beforeOf, entryByKey, type Timeline } from './model/timeline';
import { OrchestrationPicker } from './orchestration-picker';
import { RunPicker } from './run-picker';
import { useInspectTarget } from './use-inspect-target';
import { useOrchestrationTimeline } from './use-orchestration-timeline';
import { useRunTimeline } from './use-run-timeline';
import { ExchangeList } from './view/exchange-list';
import { ExchangeViewer } from './view/exchange-viewer';
import { FlowPanel } from './view/flow-panel';
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
 * too, so a link reopens the same moment. Everything below this is
 * presentational and takes what it shows as props.
 *
 * A quality run and an orchestration are the same reading with different roots:
 * an orchestration's log nests each child run's own actions under the step that
 * opened it, and `?run=` then names which child is being followed. Both hooks are
 * always called — one of them with nothing to read — because that is what the
 * rules of hooks require and what keeps the branch here rather than inside them.
 *
 * Following is a consequence of selection rather than a mode of its own: with no
 * action named, the latest is shown and keeps being the latest; naming one pins
 * it. That is why scrolling never detaches anybody.
 */
export function InspectorClient() {
  const { target, point } = useInspectTarget();
  const Link = useLink();
  const runs = useResource((signal) => api.listRuns({ limit: RECENT_LIMIT }, { signal }), []);
  const orchestrations = useResource(
    (signal) => api.listOrchestrations({ limit: RECENT_LIMIT }, { signal }),
    [],
  );
  const pipelines = useResource((signal) => api.listPipelines({ signal }), []);

  const watchingOrchestration = target.orchestration !== null;
  const runSide = useRunTimeline(watchingOrchestration ? null : target.run);
  const orchSide = useOrchestrationTimeline(target.orchestration, target.run);

  const timeline: Timeline = watchingOrchestration ? orchSide.timeline : runSide.timeline;
  const error = watchingOrchestration ? orchSide.error : runSide.error;
  const isPolling = watchingOrchestration ? orchSide.isPolling : runSide.isPolling;
  const unreachable = watchingOrchestration ? orchSide.unreachable : runSide.unreachable;
  const run = watchingOrchestration ? orchSide.selectedChild : runSide.run;
  const pipeline =
    run === null ? null : (pipelines.data?.find((entry) => entry.id === run.pipeline) ?? null);

  const [shown, setShown] = useState<ReadonlySet<ActionGroup>>(ALL_GROUPS);
  const [ignoreTimings, setIgnoreTimings] = useState(false);

  // The transcript: which model call is open, and which of its files is being
  // read. Both are local rather than in the URL — a prompt is something a reader
  // opens while reading, not a place they were.
  const [openCall, setOpenCall] = useState<Invocation | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const callRunId = openCall?.runId ?? null;
  const dump = useResource(
    (signal) => (callRunId === null ? Promise.resolve([]) : api.listRunDump(callRunId, { signal })),
    [callRunId],
  );
  const dumpFile = useResource(
    (signal) =>
      callRunId === null || openPath === null
        ? Promise.resolve(null)
        : api.readRunDumpFile(callRunId, openPath, { signal }),
    [callRunId, openPath],
  );
  const onOpenCall = useCallback((call: Invocation) => {
    setOpenCall(call);
    setOpenPath(null);
  }, []);
  const onCloseCall = useCallback(() => {
    setOpenCall(null);
    setOpenPath(null);
  }, []);

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
  const panels = useMemo(():
    readonly { id: string; label: string; content: ReactNode }[] | undefined => {
    const state = selected?.row.entry.after ?? null;
    if (state === null) return undefined;
    const invocations = invocationsOf(state.exchanges);
    const flow = dataFlow(state, orchSide.children);
    return [
      ...(state.orchestration === null
        ? []
        : [
            {
              id: 'flow',
              label: 'Steps',
              content: (
                <FlowPanel
                  flow={flow}
                  totals={flowTotals(flow)}
                  unread={orchSide.unread}
                  hrefForChild={(runId) => inspectHref({ ...target, run: runId, action: null })}
                  link={Link}
                />
              ),
            },
          ]),
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
        content: (
          <Stack gap={5}>
            <ExchangeList
              invocations={invocations}
              totals={invocationTotals(invocations)}
              selected={
                openCall === null
                  ? null
                  : { runId: openCall.runId, ordinal: openCall.attempts[0].ordinal }
              }
              onSelect={onOpenCall}
            />
            <ExchangeViewer
              invocation={openCall}
              files={
                openCall === null
                  ? []
                  : filesForCall(dump.data ?? [], openCall.scope, openCall.attempts[0].ordinal)
              }
              open={dumpFile.data}
              loadingList={openCall !== null && dump.loading}
              loadingFile={openPath !== null && dumpFile.loading}
              listError={openCall === null ? null : dump.error}
              fileError={dumpFile.error}
              onOpenFile={setOpenPath}
              onClose={onCloseCall}
            />
          </Stack>
        ),
      },
    ];
  }, [
    selected,
    pipeline,
    orchSide.children,
    orchSide.unread,
    target,
    Link,
    openCall,
    openPath,
    dump.data,
    dump.loading,
    dump.error,
    dumpFile.data,
    dumpFile.loading,
    dumpFile.error,
    onOpenCall,
    onCloseCall,
  ]);

  const reconstructed = timeline.entries.filter(
    (entry) => entry.provenance === 'reconstructed',
  ).length;
  const recorded = timeline.entries.length - reconstructed;
  const provenanceNote =
    recorded === 0
      ? `All ${reconstructed} actions were read back out of one recorded snapshot. Their order and their payloads are what the engine declared; the times shown are only the ones the record itself carries.`
      : `${reconstructed} actions were read out of the first snapshot — faithful about what happened and about its order, not about wall-clock time. The other ${recorded} were seen arriving, and carry the moment they were observed.`;

  const nothingChosen = target.run === null && target.orchestration === null;

  return (
    <Stack gap={6}>
      <Surface as="section" aria-label="What to inspect">
        <Stack gap={4}>
          <Heading level={2}>Inspect</Heading>
          <Text tone="secondary" size="sm">
            Pick a quality run to read its machinery — what each lens answered, what survived
            agreement, how the evidence became a number, what changed between iterations — or an
            orchestration to read its steps and the runs they opened.
          </Text>
          <Tabs
            value={watchingOrchestration ? 'orchestrations' : 'runs'}
            onChange={() => undefined}
          >
            <TabList aria-label="What to inspect">
              <Tab value="runs">Quality runs</Tab>
              <Tab value="orchestrations">Orchestrations</Tab>
            </TabList>
            <TabPanel value="runs">
              {runs.data ? (
                <RunPicker
                  runs={runs.data.data}
                  selectedRunId={watchingOrchestration ? null : target.run}
                  hrefFor={(runId) => inspectHref({ run: runId })}
                  link={Link}
                />
              ) : runs.error ? (
                <Alert tone="danger">{runs.error}</Alert>
              ) : (
                <Spinner label="Loading runs" />
              )}
            </TabPanel>
            <TabPanel value="orchestrations">
              {orchestrations.data ? (
                <OrchestrationPicker
                  orchestrations={orchestrations.data.data}
                  selectedId={target.orchestration}
                  hrefFor={(id) => inspectHref({ orchestration: id })}
                  link={Link}
                />
              ) : orchestrations.error ? (
                <Alert tone="danger">{orchestrations.error}</Alert>
              ) : (
                <Spinner label="Loading orchestrations" />
              )}
            </TabPanel>
          </Tabs>
        </Stack>
      </Surface>

      {nothingChosen ? (
        <Alert tone="info">Select a run or an orchestration above to read what it did.</Alert>
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
            <Spinner label="Reading the record" />
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
