import type {
  AdvisorDescriptor,
  SessionEvent,
  UnitAdvice,
  UnitAdviceRequest,
} from '@sysdesign/contracts';

import type { SessionEventsPort } from './session-events';
import { AdvisorFaulted, type UnitAdvisorPort } from './unit-advice';

/**
 * The fakes for what a session keeps beyond itself: an advisor that answers
 * from a script and records what it was asked, and a bus that records what the
 * session published. Neither imports vitest.
 */

/** An advisor answering in turn; past the script it repeats its last answer, so a long journey scripts only what changes. */
export class ScriptedAdvisor implements UnitAdvisorPort {
  readonly requests: { request: UnitAdviceRequest; probe: boolean }[] = [];
  described = 0;
  describeFault: AdvisorFaulted | null = null;
  private readonly answers: (UnitAdvice | AdvisorFaulted)[];
  private last: UnitAdvice | null = null;

  constructor(
    readonly descriptor: AdvisorDescriptor,
    answers: readonly (UnitAdvice | AdvisorFaulted)[],
  ) {
    this.answers = [...answers];
  }

  async describe(): Promise<AdvisorDescriptor> {
    this.described += 1;
    if (this.describeFault !== null) throw this.describeFault;
    return this.descriptor;
  }

  async recall(request: UnitAdviceRequest, options: { probe: boolean }): Promise<UnitAdvice> {
    this.requests.push({ request, probe: options.probe });
    const next = this.answers.shift();
    if (next instanceof AdvisorFaulted) throw next;
    if (next !== undefined) this.last = next;
    if (this.last === null) throw new Error('the scripted advisor has no answer to give');
    return this.last;
  }
}

/** The advice an advisor gives: units on record over one facet, each with a stance and a note. */
export const advice = (
  advisor: string,
  units: readonly { name: string; value: string; stance: 'avoid' | 'forbid'; note?: string }[],
  omitted = 0,
): UnitAdvice => ({
  advisor,
  units: units.map((unit) => ({
    identity: [{ name: unit.name, value: unit.value }],
    stance: unit.stance,
    note: unit.note ?? '',
  })),
  omitted,
});

/** A bus that records what the session published; `failing` rejects every publish, `held` never settles one. */
export class RecordingEvents implements SessionEventsPort {
  readonly published: SessionEvent[] = [];
  failing: Error | null = null;
  held: Promise<void> | null = null;

  async publish(event: SessionEvent): Promise<void> {
    if (this.held !== null) await this.held;
    if (this.failing !== null) throw this.failing;
    this.published.push(event);
  }
}
