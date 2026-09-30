/**
 * The brief classifier over a model: one structured call that says which
 * registered judge a brief belongs to. Not a child run, on the query-probes
 * precedent: its answer is never a verdict, only what dispatches, and the
 * schema is locked to the ids the registry offers, so the model cannot name a
 * judge that does not exist. Null on a miss; the step says `unclassified`.
 */
import type { RouteDto } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';
import { z } from 'zod';

import type { BriefClassifier, Classification } from '../../../orchestrators/router/ports';
import persona from './classifier.md?raw';

const RATIONALE_MAX = 400;
/** Room for the id and one short reason, no more. */
const CLASSIFY_MAX_TOKENS = 600;

/** The judges as the model reads them: id and what it grades, one per line. */
export const renderRoutes = (routes: readonly RouteDto[]): string =>
  routes.map((route) => `- ${route.id}: ${route.description}`).join('\n');

const renderBrief = (goal: string, routes: readonly RouteDto[]): string =>
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
        maxTokens: CLASSIFY_MAX_TOKENS,
      });
    } catch (error) {
      // The client's contract is null on failure; a throw here must not take the run down.
      this.warn(`brief not classified: ${String(error)}`);
      return null;
    }
  }
}
