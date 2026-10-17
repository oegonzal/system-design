/**
 * What a watcher has told already, so a poll retried from an older cursor
 * tells none of it again: the keys of the last `keep` tellings, the oldest
 * forgotten first. A watcher that advances its cursor only once everything
 * is told needs exactly this to be both complete and quiet.
 */
export class ToldOnce {
  private readonly keys = new Set<string>();

  constructor(private readonly keep: number) {}

  has(key: string): boolean {
    return this.keys.has(key);
  }

  add(key: string): void {
    this.keys.delete(key);
    this.keys.add(key);
    while (this.keys.size > this.keep) {
      const oldest = this.keys.values().next().value;
      if (oldest === undefined) break;
      this.keys.delete(oldest);
    }
  }
}
