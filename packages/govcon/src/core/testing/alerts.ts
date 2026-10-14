import {
  alertKeyOf,
  type AlertKey,
  type GovconAlert,
  type InteractionPrompt,
} from '@sysdesign/contracts';

import type { AlertLedger, AlertSink, RaisedAlert, StoredAlert } from '../ports';

/** The alert ledger in memory: what was recorded is raised. */
export class InMemoryAlertLedger implements AlertLedger {
  /** In the order they were recorded. */
  readonly rows: RaisedAlert[] = [];
  /** When set, every method throws — the "store unavailable" branch. */
  failing: Error | null = null;

  async raised(keys: readonly AlertKey[]): Promise<Set<string>> {
    if (this.failing) throw this.failing;
    const known = new Set(this.rows.map((row) => alertKeyOf(row.key)));
    return new Set(keys.map(alertKeyOf).filter((key) => known.has(key)));
  }

  async record(rows: readonly RaisedAlert[]): Promise<void> {
    if (this.failing) throw this.failing;
    this.rows.push(...rows);
  }

  async list({
    limit,
    offset,
  }: {
    limit: number;
    offset: number;
  }): Promise<[StoredAlert[], number]> {
    if (this.failing) throw this.failing;
    const newestFirst = this.rows
      .map((row, index) => ({ row, index }))
      .sort(
        (a, b) =>
          b.row.raisedAt.getTime() - a.row.raisedAt.getTime() ||
          a.row.position - b.row.position ||
          alertKeyOf(a.row.key).localeCompare(alertKeyOf(b.row.key)),
      )
      .map(({ row, index }) => ({
        id: `alert-${index + 1}`,
        key: row.key,
        profileId: row.profileId,
        raisedAt: row.raisedAt,
        payload: row.payload,
      }));
    return [newestFirst.slice(offset, offset + limit), newestFirst.length];
  }
}

/** An alert sink that remembers what it was given; `failing` makes every call throw, as a bus that is down does. */
export class RecordingAlertSink implements AlertSink {
  readonly published: GovconAlert[] = [];
  readonly prompts: InteractionPrompt[] = [];
  failing: Error | null = null;

  async publish(alert: GovconAlert): Promise<{ seq: string }> {
    if (this.failing) throw this.failing;
    this.published.push(alert);
    return { seq: String(this.published.length) };
  }

  async prompt(prompt: InteractionPrompt): Promise<void> {
    if (this.failing) throw this.failing;
    this.prompts.push(prompt);
  }
}
