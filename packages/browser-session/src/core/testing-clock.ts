import type { Clock } from './ports';

/** A clock that moves a fixed step on every read, jumps when a spec says so, and fires the timers armed on it as its time comes. */
export class FixedClock implements Clock {
  private ms: number;
  private readonly timers: { due: number; then: () => void }[] = [];

  constructor(
    start = new Date('2026-10-03T10:00:00.000Z'),
    private readonly stepMs = 1_000,
  ) {
    this.ms = start.getTime();
  }

  now(): Date {
    const now = new Date(this.ms);
    this.ms += this.stepMs;
    this.fire();
    return now;
  }

  advance(ms: number): void {
    this.ms += ms;
    this.fire();
  }

  at(when: Date, then: () => void): () => void {
    const timer = { due: when.getTime(), then };
    this.timers.push(timer);
    return () => {
      const at = this.timers.indexOf(timer);
      if (at >= 0) this.timers.splice(at, 1);
    };
  }

  /** Timers armed and neither fired nor cancelled. */
  get pendingTimers(): number {
    return this.timers.length;
  }

  /** Every timer whose time has come, once each, in the order they fell due. */
  private fire(): void {
    const due = this.timers.filter((timer) => timer.due <= this.ms).sort((a, b) => a.due - b.due);
    for (const timer of due) {
      this.timers.splice(this.timers.indexOf(timer), 1);
      timer.then();
    }
  }
}

/** A dump that keeps its files in memory, by path. */
