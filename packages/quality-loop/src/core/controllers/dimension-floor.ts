/**
 * A floor under every assessed dimension. The weighted overall can clear the
 * accept threshold while one dimension sits at a failing grade — the last
 * memory-recall run accepted at 80.6 with coverage at 59.1. Placed before the
 * accept threshold, this gate keeps such an artifact in the loop and routes it
 * exactly as the standard route would, naming the dimension. An unassessed
 * dimension has no score and is not judged.
 */
import type { Gate } from './compose';
import { settleByRemediations } from './gates';

export const DIMENSION_FLOOR_FACTOR = 'dimension-floor';

export function dimensionFloor(floor: number): Gate {
  if (!(floor >= 0 && floor <= 100)) {
    throw new Error(
      `controller gate ${DIMENSION_FLOOR_FACTOR}: floor ${floor} is outside [0, 100]`,
    );
  }
  return {
    factor: DIMENSION_FLOOR_FACTOR,
    params: { floor },
    check: (ctx) => {
      const below = ctx.scored.dimensions.filter(
        (entry) => entry.score !== null && entry.score < floor,
      );
      if (below.length === 0) {
        return { ok: true, detail: `every assessed dimension at or above ${floor}` };
      }
      const named = below.map((entry) => `${entry.dimension} ${entry.score}`).join(', ');
      const routed = settleByRemediations(ctx);
      return {
        ok: false,
        decision: routed.decision,
        reason: `below the floor ${floor}: ${named}; ${routed.reason}`,
      };
    },
  };
}
