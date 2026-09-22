/**
 * The brief classifier: one structured model call that says which registered
 * judge a brief belongs to. Not a child run, on the query-probes precedent:
 * its answer is never a verdict, only what dispatches, and the schema is
 * locked to the ids the registry offers, so the model cannot name a judge
 * that does not exist. Null on a miss; the step says `unclassified`.
 */
import type { RouteDto } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';
import { z } from 'zod';

import persona from './classifier.md?raw';

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

const RATIONALE_MAX = 400;

/** The judges as the model reads them: id and what it grades, one per line. */
export const renderRoutes = (routes: readonly RouteDto[]): string =>
  routes.map((route) => `- ${route.id}: ${route.description}`).join('\n');

export const renderBrief = (goal: string, routes: readonly RouteDto[]): string =>
  `## Judges\n${renderRoutes(routes)}\n\n## Brief\n${goal}`;

export class LlmBriefClassifier implements BriefClassifier {
  constructor(
    private readonly client: LlmClient,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  get enabled(): boolean {
    return this.client.enabled;
  }

  get model(): string | null {
    return this.client.model;
  }

  async classify(goal: string, routes: readonly RouteDto[]): Promise<Classification | null> {
    if (!this.client.enabled || routes.length === 0) return null;
    const ids = routes.map((route) => route.id) as [string, ...string[]];
    try {
      return await this.client.completeStructured({
        system: persona,
        user: renderBrief(goal, routes),
        schema: z.strictObject({
          pipeline: z.enum(ids),
          rationale: z.string().min(1).max(RATIONALE_MAX),
        }),
        maxTokens: 600,
      });
    } catch (error) {
      // The client's contract is null on failure; a throw here must not take the run down.
      this.warn(`brief not classified: ${String(error)}`);
      return null;
    }
  }
}

/** No model: every brief is unclassified, and the step says why. */
export const noClassifier: BriefClassifier = {
  enabled: false,
  model: null,
  classify: () => Promise.resolve(null),
};
