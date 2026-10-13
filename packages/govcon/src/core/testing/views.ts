/** Saved views in memory. */
import type { SavedViewInput, SavedViewRecord, SavedViewRepository } from '../ports';

export class InMemorySavedViewRepository implements SavedViewRepository {
  readonly rows = new Map<string, SavedViewRecord>();
  private minted = 0;

  async listByProfile(profileId: string): Promise<SavedViewRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.profileId === profileId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(profileId: string, input: SavedViewInput, at: Date): Promise<SavedViewRecord> {
    const kept = [...this.rows.values()].find(
      (row) => row.profileId === profileId && row.name === input.name,
    );
    this.minted += kept ? 0 : 1;
    const row: SavedViewRecord = kept
      ? { ...kept, href: input.href, updatedAt: at }
      : { id: `v-${this.minted}`, profileId, ...input, createdAt: at, updatedAt: at };
    this.rows.set(row.id, row);
    return row;
  }

  async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}
