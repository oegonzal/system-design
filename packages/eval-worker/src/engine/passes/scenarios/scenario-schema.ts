/**
 * Response schema for the scenario pass, enum-locked to the deterministic
 * selection — the model cannot report on a scenario it was not given.
 */
import { z } from 'zod';

import { SCENARIO_VERDICTS } from '@sysdesign/contracts';

import type { ScenarioDef } from './scenario-table';

export function buildScenarioSchema(selected: readonly ScenarioDef[]) {
  const ids = selected.map((scenario) => scenario.id) as [string, ...string[]];
  return z.object({
    reports: z
      .array(
        z.object({
          scenarioId: z.enum(ids),
          verdict: z.enum(SCENARIO_VERDICTS),
          /** The failure walked through THIS design, node ids named. */
          story: z.string().max(800),
          weakestNodeIds: z.array(z.string().max(64)).max(10),
        }),
      )
      .max(selected.length),
  });
}

export type ScenarioCritique = z.infer<ReturnType<typeof buildScenarioSchema>>;
