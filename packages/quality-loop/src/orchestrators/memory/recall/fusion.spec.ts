import { describe, expect, it } from 'vitest';

import { hitOf } from '../testing';
import { fuse } from './fusion';

describe('fusion', () => {
  it("[QL-16] rewards the chunk several probes agree on over one probe's favourite", () => {
    const agreed = hitOf('agreed by two probes', 'run-a', 'memory.1');
    const favourite = hitOf("one probe's top hit", 'run-b', 'memory.1');
    const other = hitOf('also seen once', 'run-c', 'memory.1');

    // `favourite` is rank 0 of the first list and scores highest; `agreed` is
    // rank 1 of both. Rank-based fusion prefers the one both probes ranked.
    const fused = fuse(
      [
        [
          { ...favourite, score: 0.9 },
          { ...agreed, score: 0.3 },
        ],
        [
          { ...other, score: 0.4 },
          { ...agreed, score: 0.35 },
        ],
      ],
      3,
    );

    expect(fused[0].text).toBe(agreed.text);
    // A chunk carried by two lists keeps its best-scoring copy.
    expect(fused[0].score).toBe(0.35);
    expect(fused).toHaveLength(3);
  });
});
