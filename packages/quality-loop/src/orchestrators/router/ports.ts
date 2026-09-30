/**
 * The router's one port: a classifier that says which registered judge a
 * brief belongs to. Its answer is never a verdict, only what dispatches; the
 * module that owns the model binds the adapter.
 */
import type { LlmAvailabilityDto, RouteDto } from '@sysdesign/contracts';

export interface Classification {
  pipeline: string;
  rationale: string;
}

export interface BriefClassifier {
  readonly enabled: boolean;
  readonly model: string | null;
  /** One of the routes' ids and why, or null when the model could not say. */
  classify(goal: string, routes: readonly RouteDto[]): Promise<Classification | null>;
}

/** No model: every brief is unclassified, and the step says why. */
export const noClassifier: BriefClassifier = {
  enabled: false,
  model: null,
  classify: () => Promise.resolve(null),
};

/** The ports the router runs over; the module that owns the classifier binds them. */
export interface RouterPorts {
  classifier: BriefClassifier;
  llm: LlmAvailabilityDto;
}
