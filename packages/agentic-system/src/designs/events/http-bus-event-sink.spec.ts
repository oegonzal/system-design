import { randomUUID } from 'node:crypto';

import {
  DESIGN_TOPICS,
  INTERACTION_TOPICS,
  interactionPromptSchema,
  type EventEnvelope,
  type InteractionPrompt,
  type PublishEventRequest,
} from '@sysdesign/contracts';
import type { BusClient } from '@sysdesign/notifications-client';

import { HttpBusEventSink, designPromptOf, eventOf } from './http-bus-event-sink';
import type { MemoryDesignCycle } from '../cycle';

const clock = (): Date => new Date('2026-10-16T00:00:00Z');

const cycle = (over: Partial<MemoryDesignCycle>): MemoryDesignCycle => ({
  id: 'c1',
  goalDigest: 'g1',
  status: 'running',
  designRunId: null,
  orchestrationRunId: null,
  note: null,
  startedAt: new Date('2026-10-16T00:00:00Z'),
  updatedAt: new Date('2026-10-16T00:00:00Z'),
  ...over,
});

class FakeBus {
  readonly published: PublishEventRequest[] = [];
  publish(request: PublishEventRequest): Promise<EventEnvelope> {
    this.published.push(request);
    return Promise.resolve({
      seq: String(this.published.length),
      ...request,
      publishedAt: clock().toISOString(),
    });
  }
}

describe('the design event sink', () => {
  it('[AGS-7] records each transition on its design topic and pushes a matching person-facing prompt', async () => {
    const bus = new FakeBus();
    const sink = new HttpBusEventSink(bus as unknown as BusClient, clock, randomUUID);

    await sink.emit(cycle({ status: 'running' }));
    await sink.emit(cycle({ status: 'coached', designRunId: 'run-1' }));
    await sink.emit(
      cycle({ status: 'stored', designRunId: 'run-1', orchestrationRunId: 'orch-1' }),
    );
    await sink.emit(cycle({ status: 'failed', note: 'loop down' }));

    // The machine record: one design.* event per announced transition, in order.
    const designTopics = bus.published
      .filter((event) => event.topic.startsWith('agentic-system.design.'))
      .map((event) => event.topic);
    expect(designTopics).toEqual([
      DESIGN_TOPICS.started,
      DESIGN_TOPICS.revised,
      DESIGN_TOPICS.stored,
    ]);
    const stored = bus.published.find((event) => event.topic === DESIGN_TOPICS.stored);
    expect(stored?.payload).toEqual({
      cycleId: 'c1',
      goalDigest: 'g1',
      designRunId: 'run-1',
      orchestrationRunId: 'orch-1',
    });

    // The person-facing ping: one valid interaction.prompted per transition, sourced agentic-system.
    const prompts = bus.published.filter((event) => event.topic === INTERACTION_TOPICS.prompted);
    expect(prompts).toHaveLength(3);
    expect(prompts.every((event) => event.source === 'agentic-system')).toBe(true);
    for (const event of prompts) {
      expect(interactionPromptSchema.safeParse(event.payload).success).toBe(true);
      expect((event.payload as InteractionPrompt).origin).toMatchObject({
        kind: 'design-cycle',
        id: 'c1',
      });
      expect((event.payload as InteractionPrompt).choices).toEqual([
        { id: 'noted', label: 'Noted', note: null },
      ]);
    }

    // A coached cycle with no run id yet, and any failed cycle, carry neither a record nor a ping.
    expect(eventOf(cycle({ status: 'coached' }))).toBeNull();
    expect(eventOf(cycle({ status: 'failed' }))).toBeNull();
    expect(designPromptOf(cycle({ status: 'failed' }), clock(), randomUUID())).toBeNull();
  });
});
