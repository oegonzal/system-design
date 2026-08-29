/**
 * Every pass the orchestrator can resolve. A profile may only name passes
 * registered here — an unknown name fails the run loudly rather than
 * silently grading with less evidence than the profile promised.
 */
import type { EvalPass } from '../core/types';
import { createCriticPass } from './critic/critic.pass';
import { createDepthPass } from './depth/depth.pass';
import { createExpectationsPass } from './expectations/expectations.pass';
import { createRulesPass } from './rules/rules.pass';
import { createScenariosPass } from './scenarios/scenarios.pass';

export function createPassRegistry(): ReadonlyMap<string, EvalPass> {
  const passes: EvalPass[] = [
    createRulesPass(),
    createExpectationsPass(),
    createCriticPass(),
    createDepthPass(),
    createScenariosPass(),
  ];
  return new Map(passes.map((pass) => [pass.id, pass]));
}
