/**
 * The controller library: the parts a pipeline composes a controller from,
 * and the named strategies it can declare outright. A pipeline picks one by
 * reference in its definition — `controller: STANDARD` — the way it lists
 * validators; a pipeline with a rule of its own composes it in its own folder.
 * `CONTROLLERS` is what the replay tool compares.
 */
import type { Controller } from '../ports';
import { composeController } from './compose';
import { dimensionFloor } from './dimension-floor';
import {
  acceptThreshold,
  artifact,
  byRemediations,
  evidence,
  policyAllowed,
  rejectFloor,
  validators,
} from './gates';

export type { Gate, Route } from './compose';
export { composeController } from './compose';
export {
  acceptThreshold,
  artifact,
  byRemediations,
  evidence,
  policyAllowed,
  rejectFloor,
  validators,
} from './gates';

/** The doctrine's controller as it has always decided: ordered gates, thresholds, then route. */
export const STANDARD: Controller = composeController('standard', {
  gates: [artifact, validators, evidence, policyAllowed, acceptThreshold, rejectFloor],
  route: byRemediations,
});

/** Where the floor sits under every assessed dimension in the strategy that has one. */
const DEFAULT_FLOOR = 50;

/** The standard order with a floor under every assessed dimension before the accept threshold. */
export const DIMENSION_FLOOR: Controller = composeController('dimension-floor', {
  gates: [
    artifact,
    validators,
    evidence,
    policyAllowed,
    dimensionFloor(DEFAULT_FLOOR),
    acceptThreshold,
    rejectFloor,
  ],
  route: byRemediations,
});

export const CONTROLLERS: ReadonlyMap<string, Controller> = new Map(
  [STANDARD, DIMENSION_FLOOR].map((controller) => [controller.id, controller]),
);
