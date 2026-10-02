'use client';

import type { OrchestrationRunDto, QualityRunDto } from '@sysdesign/contracts';
import { usePolledResource } from '@sysdesign/web-kit';
import { useEffect, useRef, useState } from 'react';

import { api } from '../../api/client';
import { childrenToRead, dataFlow, MAX_CHILDREN_READ } from './model/data-flow';
import { deriveOrchestration } from './model/derive-orchestration';
import { reduceAll } from './model/reduce';
import { emptyState } from './model/state';
import { emptyTimeline, recordActions, type Timeline } from './model/timeline';

/**
 * One orchestration, followed, with its children read.
 *
 * The polling policy is the point. An orchestration's panel step can open five
 * children, and polling all of them would multiply every tick by five for
 * nothing — a reader looks at one child at a time. So the orchestration itself
 * is polled, the child being inspected is polled, and every other child is read
 * once. A child already read is not read again unless it is the one selected,
 * which is also what keeps a finished orchestration to one request per child.
 *
 * The read is bounded: at most `MAX_CHILDREN_READ` children, the selected one
 * first, so an orchestration of many samples cannot turn one page into a hundred
 * requests.
 */

const fetchOrchestration = (id: string, signal: AbortSignal) =>
  api.getOrchestration(id, { signal });
const fetchRun = (runId: string, signal: AbortSignal) => api.getRun(runId, { signal });
const isTerminal = (record: { status: string }) => record.status !== 'running';
const terminalError = (record: { status: string; error: { message: string } | null }) =>
  record.status === 'failed' ? (record.error?.message ?? 'The run failed.') : null;

export interface OrchestrationTimeline {
  timeline: Timeline;
  orchestration: OrchestrationRunDto | null;
  /** The children read so far, by run id. */
  children: Readonly<Record<string, QualityRunDto>>;
  /** The child being inspected, when one is. */
  selectedChild: QualityRunDto | null;
  error: string | null;
  isPolling: boolean;
  unreachable: boolean;
  /** Children the bound left unread, so the view can say so. */
  unread: number;
}

export function useOrchestrationTimeline(
  orchestrationRunId: string | null,
  selectedRunId: string | null,
): OrchestrationTimeline {
  const {
    resource: orchestration,
    error,
    isPolling,
    unreachable,
  } = usePolledResource<OrchestrationRunDto>({
    key: orchestrationRunId,
    fetch: fetchOrchestration,
    isTerminal,
    terminalError,
  });

  // The child under inspection is followed; the others are read once below.
  const { resource: selectedChild } = usePolledResource<QualityRunDto>({
    key: orchestrationRunId === null ? null : selectedRunId,
    fetch: fetchRun,
    isTerminal,
    terminalError,
  });

  const [children, setChildren] = useState<Record<string, QualityRunDto>>({});
  const [unread, setUnread] = useState(0);
  /** Which orchestration the log currently holds; compared, never assumed. */
  const logged = useRef<string | null>(null);
  /** The snapshot the log was opened from — everything folded in from it is reconstructed. */
  const openedFrom = useRef<OrchestrationRunDto | null>(null);
  const reading = useRef(new Set<string>());

  useEffect(() => {
    reading.current = new Set();
    /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       a different orchestration shares no children with the last one, which only
       an effect on the identity can notice */
    setChildren({});
    setUnread(0);
    /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
  }, [orchestrationRunId]);

  // Read the children that have not been read, bounded, selected one first.
  useEffect(() => {
    if (orchestration === null) return;
    const flow = dataFlow(reduceAll(emptyState(), deriveOrchestration(orchestration)), {});
    const wanted = childrenToRead(flow, selectedRunId);
    const all = flow.steps.flatMap((step) => step.runIds);
    /* eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       how many the read bound left out is a fact about the snapshot that just arrived */
    setUnread(Math.max(0, all.length - wanted.length));
    const missing = wanted.filter((runId) => !reading.current.has(runId));
    if (missing.length === 0) return;
    for (const runId of missing) reading.current.add(runId);
    const controller = new AbortController();
    void Promise.allSettled(
      // allSettled, not all: one child that cannot be read must not cost the
      // others, and a child the store has lost is a condition the inspector
      // reports rather than one that empties the page.
      missing.map((runId) => api.getRun(runId, { signal: controller.signal })),
    ).then((settled) => {
      const read: Record<string, QualityRunDto> = {};
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') read[missing[index]] = outcome.value;
        else reading.current.delete(missing[index]);
      });
      if (Object.keys(read).length > 0) setChildren((current) => ({ ...current, ...read }));
    });
    return () => controller.abort();
  }, [orchestration, selectedRunId]);

  const [timeline, setTimeline] = useState<Timeline>(emptyTimeline);
  useEffect(() => {
    if (orchestrationRunId === null) {
      /* eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
         a log with no orchestration to hold is empty, which only an effect can notice */
      setTimeline(emptyTimeline());
      logged.current = null;
      openedFrom.current = null;
      return;
    }
    if (orchestration === null) return;
    // Which orchestration the LOG holds, compared every time — not a one-way
    // "have we started" flag. Moving from one orchestration to another never
    // passes through null (the picker replaces the query parameter), so a flag
    // that only reset on null left the new orchestration's actions appended to
    // the old one's: the rail kept both, the provenance count described two runs
    // glued together, and the first new action was diffed against the previous
    // orchestration's final state — a transition that never happened.
    const merged =
      selectedChild === null ? children : { ...children, [selectedChild.runId]: selectedChild };
    const actions = deriveOrchestration(orchestration, { children: merged });
    const opening = logged.current !== orchestration.orchestrationRunId;
    if (opening) {
      logged.current = orchestration.orchestrationRunId;
      openedFrom.current = orchestration;
    }
    // Reconstructed means "read out of the snapshot the reader was handed". The
    // children are read in a second request, but they belong to that same
    // snapshot — so provenance stays reconstructed until a poll brings a new one,
    // rather than calling a child fetched half a second later "seen arriving".
    const fromOpeningSnapshot = openedFrom.current === orchestration;
    const observedAt = new Date().toISOString();
    /* eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       folding an arriving snapshot into the log is precisely this effect's contract */
    setTimeline((current) =>
      recordActions(opening ? emptyTimeline() : current, actions, {
        provenance: fromOpeningSnapshot ? 'reconstructed' : 'recorded',
        observedAt,
      }),
    );
  }, [orchestration, children, selectedChild, orchestrationRunId]);

  return {
    timeline,
    orchestration,
    children,
    selectedChild,
    error,
    isPolling,
    unreachable,
    unread,
  };
}

export { MAX_CHILDREN_READ };
