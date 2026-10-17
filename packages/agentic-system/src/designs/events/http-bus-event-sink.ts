import { randomUUID } from 'node:crypto';

import {
  AGENTIC_SYSTEM_SOURCE,
  DESIGN_TOPICS,
  INTERACTION_TOPICS,
  type InteractionPrompt,
} from '@sysdesign/contracts';
import type { BusClient } from '@sysdesign/notifications-client';

import type { Clock } from '../../common/clock';
import type { MemoryDesignCycle } from '../cycle';
import type { DesignEventSink } from '../ports';

/** The design event for a cycle at its current status, or null for a status that has none (failed). */
export const eventOf = (
  cycle: MemoryDesignCycle,
): { topic: string; payload: Record<string, string> } | null => {
  const { id: cycleId, sessionId, designRunId, orchestrationRunId } = cycle;
  switch (cycle.status) {
    case 'running':
      return { topic: DESIGN_TOPICS.started, payload: { cycleId, sessionId } };
    case 'coached':
      return designRunId === null
        ? null
        : { topic: DESIGN_TOPICS.revised, payload: { cycleId, sessionId, designRunId } };
    case 'stored':
      return designRunId === null || orchestrationRunId === null
        ? null
        : {
            topic: DESIGN_TOPICS.stored,
            payload: { cycleId, sessionId, designRunId, orchestrationRunId },
          };
    default:
      return null;
  }
};

/** A week: a design ping is a progress note, not a question that must be answered in a hurry. */
const DESIGN_PROMPT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

/** The one line a person reads for a transition, or null for a status that carries no ping. */
const promptLine = (cycle: MemoryDesignCycle): { title: string; detail: string } | null => {
  switch (cycle.status) {
    case 'running':
      return {
        title: 'Memory design started',
        detail: 'Coaching a memory strategy on the quality loop.',
      };
    case 'coached':
      return {
        title: 'Memory design coached',
        detail: 'The memory strategy is ready; read it from the coach run.',
      };
    case 'stored':
      return {
        title: 'Memory design stored',
        detail: 'The coach run was digested and its lessons kept in memory.',
      };
    default:
      return null;
  }
};

/**
 * The human-facing ping for a cycle transition: the same transition the raw
 * event records, put to a person on whatever channel carries `agentic-system`.
 * A notify-only prompt — one `Noted` choice, no free text, no commands — so a
 * channel renders it as progress, never a question. Null for a status with no
 * event (a failed cycle is read off its row, not pushed).
 */
export const designPromptOf = (cycle: MemoryDesignCycle, now: Date): InteractionPrompt | null => {
  const line = promptLine(cycle);
  if (line === null) return null;
  return {
    id: randomUUID(),
    origin: { kind: 'design-cycle', id: cycle.sessionId, label: cycle.sessionId },
    title: line.title,
    details: [line.detail],
    choices: [{ id: 'noted', label: 'Noted', note: null }],
    freeText: null,
    commands: [],
    expiresAt: new Date(now.getTime() + DESIGN_PROMPT_TTL_MS).toISOString(),
  };
};

/**
 * Announces a cycle's lifecycle on the notifications bus: the machine record on
 * its `design.*` topic, and — for a person watching — the same transition as an
 * `interaction.prompted` a channel can deliver. The service calls it
 * fire-and-forget; a bus that is down never fails a cycle.
 */
export class HttpBusEventSink implements DesignEventSink {
  constructor(
    private readonly bus: BusClient,
    private readonly clock: Clock,
  ) {}

  async emit(cycle: MemoryDesignCycle): Promise<void> {
    const event = eventOf(cycle);
    if (event === null) return;
    await this.bus.publish({
      topic: event.topic,
      source: AGENTIC_SYSTEM_SOURCE,
      payload: event.payload,
    });
    const prompt = designPromptOf(cycle, this.clock());
    if (prompt !== null) {
      await this.bus.publish({
        topic: INTERACTION_TOPICS.prompted,
        source: AGENTIC_SYSTEM_SOURCE,
        payload: prompt,
      });
    }
  }
}
