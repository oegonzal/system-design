import { recordFixture, TEST_POLICY } from '../testing/fixtures';
import { factorsOf, fill, rank } from './rank';

const NOW = new Date('2026-10-31T00:00:00.000Z');

describe('ranking and budgeting what a recall found', () => {
  it('[AGM-6] scores by the declared weights, the factors worked by hand', () => {
    // 30 days old at a 30-day half-life: recency 0.5. Support 3: 1 − 1/3.
    const record = recordFixture({ validFrom: new Date('2026-10-01T00:00:00.000Z'), support: 3 });
    const factors = factorsOf(
      { record, similarity: 0.8, routes: new Set(['exact', 'semantic']) },
      TEST_POLICY,
      NOW,
    );
    expect(factors).toEqual({
      similarity: 0.8,
      exact: 1,
      recency: 0.5,
      support: expect.closeTo(2 / 3, 10),
    });
    const [ranked] = rank(
      [{ record, similarity: 0.8, routes: new Set(['exact', 'semantic']) }],
      TEST_POLICY,
      NOW,
    );
    expect(ranked?.score).toBeCloseTo(0.5 * 0.8 + 0.3 * 1 + 0.1 * 0.5 + 0.1 * (2 / 3), 10);
    // A negative cosine is no similarity at all, never a penalty.
    expect(
      factorsOf({ record, similarity: -0.4, routes: new Set(['semantic']) }, TEST_POLICY, NOW)
        .similarity,
    ).toBe(0);
  });

  it('[AGM-6] breaks ties by the newer valid time, then by id', () => {
    const at = new Date('2026-10-30T00:00:00.000Z');
    const a = recordFixture({ id: '00000000-0000-4000-8000-00000000000b', validFrom: at });
    const b = recordFixture({ id: '00000000-0000-4000-8000-00000000000a', validFrom: at });
    const older = recordFixture({
      id: '00000000-0000-4000-8000-00000000000c',
      validFrom: new Date('2026-10-29T00:00:00.000Z'),
    });
    const ranked = rank(
      [a, older, b].map((record) => ({
        record,
        similarity: 0,
        routes: new Set(['temporal' as const]),
      })),
      {
        ...TEST_POLICY,
        recall: {
          ...TEST_POLICY.recall,
          weights: { similarity: 1, exact: 0, recency: 0, support: 0 },
        },
      },
      NOW,
    );
    expect(ranked.map(({ record }) => record.id)).toEqual([b.id, a.id, older.id]);
  });

  it('[AGM-6] fills the budget in rank order, skipping an item too long for what is left', () => {
    const text = (length: number) => 'x'.repeat(length);
    const ranked = rank(
      [text(900), text(1500), text(600), text(400)].map((body, index) => ({
        record: recordFixture({
          id: `00000000-0000-4000-8000-00000000000${index}`,
          text: body,
          support: 4 - index,
        }),
        similarity: 0,
        routes: new Set(['temporal' as const]),
      })),
      TEST_POLICY,
      NOW,
    );
    const { items, omitted } = fill(ranked, TEST_POLICY.recall);
    expect(items.map(({ record }) => record.text.length)).toEqual([900, 600, 400]);
    expect(omitted).toBe(1);
  });
});
