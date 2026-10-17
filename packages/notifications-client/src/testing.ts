/**
 * The bus as a program's specs take it: one that records what was published
 * and answers nothing else, so a service's HTTP surface is specced without a
 * notifications service up. Pure — no vitest import.
 */
import { BusClient } from './bus-client';

export class RecordingBus extends BusClient {
  readonly published: { topic: string; source: string; payload: unknown }[] = [];
  publish(request: { topic: string; source: string; payload: unknown }) {
    this.published.push(request);
    return Promise.resolve({
      seq: String(this.published.length),
      topic: request.topic,
      source: request.source,
      payload: request.payload,
      publishedAt: '2026-10-16T12:00:00.000Z',
    });
  }
  subscribe(): never {
    throw new Error('the recording bus takes no subscriptions');
  }
  pull(): never {
    throw new Error('the recording bus takes no pulls');
  }
  ack(): never {
    throw new Error('the recording bus takes no acks');
  }
  unsubscribe(): Promise<void> {
    return Promise.resolve();
  }
}
