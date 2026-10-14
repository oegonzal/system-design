/** Targets in memory. */
import type {
  TargetFilter,
  TargetInput,
  TargetKey,
  TargetRecord,
  TargetRepository,
} from '../ports';

const keyOf = ({ kind, subject }: TargetKey): string => `${kind}:${subject}`;

/** Targets keyed by kind and subject; ids count up from one, so a spec can name them. */
export class InMemoryTargetRepository implements TargetRepository {
  readonly rows = new Map<string, TargetRecord>();
  private minted = 0;

  async find(key: TargetKey): Promise<TargetRecord | null> {
    return this.rows.get(keyOf(key)) ?? null;
  }

  async save(key: TargetKey, input: TargetInput, at: Date): Promise<TargetRecord> {
    const existing = this.rows.get(keyOf(key));
    const row: TargetRecord = {
      id: existing?.id ?? `target-${++this.minted}`,
      kind: key.kind,
      subject: key.subject,
      ...input,
      endsAt: existing?.endsAt ?? null,
      stageChangedAt: existing && existing.stage === input.stage ? existing.stageChangedAt : at,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.rows.set(keyOf(key), row);
    return row;
  }

  async remove(key: TargetKey): Promise<boolean> {
    return this.rows.delete(keyOf(key));
  }

  async list(filter: TargetFilter): Promise<[TargetRecord[], number]> {
    const all = (await this.listAll()).filter(
      (row) =>
        (filter.kind === null || row.kind === filter.kind) &&
        (filter.stage === null || row.stage === filter.stage),
    );
    return [all.slice(filter.offset, filter.offset + filter.limit), all.length];
  }

  async listAll(): Promise<TargetRecord[]> {
    return [...this.rows.values()].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.subject.localeCompare(b.subject),
    );
  }

  async observe(key: TargetKey, endsAt: string | null): Promise<boolean> {
    const existing = this.rows.get(keyOf(key));
    if (existing === undefined) return false;
    this.rows.set(keyOf(key), { ...existing, endsAt });
    return true;
  }
}
