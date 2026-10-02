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
  const held = useRef<string | null>(null);
  const reading = useRef(new Set<string>());

  useEffect(() => {
    held.current = orchestrationRunId;
    reading.current = new Set();
    setChildren({});
    setUnread(0);
  }, [orchestrationRunId]);

  // Read the children that have not been read, bounded, selected one first.
  useEffect(() => {
    if (orchestration === null) return;
    const flow = dataFlow(reduceAll(emptyState(), deriveOrchestration(orchestration)), {});
    const wanted = childrenToRead(flow, selectedRunId);
    const all = flow.steps.flatMap((step) => step.runIds);
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
  const first = useRef(true);
  useEffect(() => {
    if (orchestrationRunId === null) {
      /* eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
         a log with no orchestration to hold is empty, which only an effect can notice */
      setTimeline(emptyTimeline());
      first.current = true;
      return;
    }
    if (orchestration === null) return;
    const merged =
      selectedChild === null ? children : { ...children, [selectedChild.runId]: selectedChild };
    const actions = deriveOrchestration(orchestration, { children: merged });
    const wasFirst = first.current;
    first.current = false;
    const observedAt = new Date().toISOString();
    /* eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect --
       folding an arriving snapshot into the log is precisely this effect's contract */
    setTimeline((current) =>
      recordActions(wasFirst ? emptyTimeline() : current, actions, {
        provenance: wasFirst ? 'reconstructed' : 'recorded',
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
