/**
 * Response schema for the scenario pass, enum-locked to the deterministic
 * selection — the model cannot report on a scenario it was not given — and,
 * per request, to THIS prompt's NFRs (which requirement a failure violates)
 * and THIS canvas's nodes (the weakest components). The verdict is the
 * model's; the engine maps it to a weakness magnitude.
 */
import {
  AXIS_FACTOR_LEVELS,
  SCENARIO_VERDICTS,
  type AxisFactorLevel,
  type CanvasGraph,
  type ScenarioVerdict,
} from '@sysdesign/contracts';
import { z } from 'zod';

import type { PromptFacts } from '../../types';
import { enumTuple } from '../graded-grounding';
import type { ScenarioDef } from './scenario-table';

export interface ScenarioReportRaw {
  scenarioId: string;
  verdict: ScenarioVerdict;
  story: string;
  weakestNodeIds: string[];
  /** The NFR this failure would violate; null when the scenario stresses no stated requirement. */
  violatesRequirementId: string | null;
  confidence: AxisFactorLevel;
}

export interface ScenarioCritique {
  reports: ScenarioReportRaw[];
}

export function buildScenarioSchema(
  selected: readonly ScenarioDef[],
  graph: CanvasGraph,
  facts: PromptFacts,
): z.ZodType<ScenarioCritique> {
  const ids = selected.map((scenario) => scenario.id) as [string, ...string[]];
  const nfrTuple = enumTuple(facts.nfrs.map((nfr) => nfr.id));
  const nodeTuple = enumTuple(graph.nodes.map((node) => node.id));
  return z.object({
    reports: z
      .array(
        z.object({
          scenarioId: z.enum(ids),
          verdict: z.enum(SCENARIO_VERDICTS),
          /** The failure walked through THIS design, node ids named. */
          story: z.string().max(800),
          weakestNodeIds: nodeTuple
            ? z.array(z.enum(nodeTuple)).max(10)
            : z.array(z.string()).max(0),
          violatesRequirementId: (nfrTuple ? z.enum(nfrTuple).nullable() : z.null()).describe(
            'The stated requirement this scenario would break; null if it stresses none of them.',
          ),
          confidence: z
            .enum(AXIS_FACTOR_LEVELS)
            .describe('How sure you are of the verdict given what is actually drawn.'),
        }),
      )
      .max(selected.length),
  }) as z.ZodType<ScenarioCritique>;
}
