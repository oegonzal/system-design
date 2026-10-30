/**
 * The space-store contract every `SpaceStore` holds — the in-memory fake and
 * the Postgres store run the same cases, so a spec on the fake proves what the
 * database does. `setup` answers an empty store.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { SpaceStore } from '../ports';
import { spaceFixture } from './fixtures';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function spaceStoreContract(label: string, setup: () => Promise<SpaceStore>): void {
  describe(`the space store contract (${label})`, () => {
    let store: SpaceStore;

    beforeEach(async () => {
      store = await setup();
    });

    it('[AGM-10] keeps the strategy and the policy a space was created under, as written, and a copy of them', async () => {
      expect(await store.insert(spaceFixture({ id: id(1) }))).toBe('inserted');
      const read = await store.get(id(1));
      expect(read).toEqual(spaceFixture({ id: id(1) }));
      // What a caller does to what it read cannot change what is stored.
      (read?.strategy as { registers: unknown[] }).registers.pop();
      expect(await store.get(id(1))).toEqual(spaceFixture({ id: id(1) }));
      expect(await store.get(id(2))).toBeNull();
    });

    it('[AGM-10] holds one space per name, finds it by name, and keeps every unnamed space', async () => {
      expect(await store.insert(spaceFixture({ id: id(1), name: 'alpha' }))).toBe('inserted');
      expect(
        await store.insert(spaceFixture({ id: id(2), name: 'alpha', designRunId: 'run-2' })),
      ).toBe('name_taken');
      expect(await store.get(id(2))).toBeNull();
      expect(await store.findByName('alpha')).toEqual(spaceFixture({ id: id(1), name: 'alpha' }));
      expect(await store.findByName('beta')).toBeNull();
      // Unnamed spaces never collide with one another.
      expect(await store.insert(spaceFixture({ id: id(3) }))).toBe('inserted');
      expect(await store.insert(spaceFixture({ id: id(4) }))).toBe('inserted');
    });
  });
}
