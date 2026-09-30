/**
 * Turning a goal into what to search for, with a model.
 *
 * A goal is a problem statement; a stored lesson is filed under the condition
 * it applies to. Embedding the whole goal once compares a problem against a
 * condition and averages every demand the goal makes into a single point —
 * measured on the live corpus, that put the lesson about p99 budgets last for
 * a prompt whose own table states a p99 target. Probes fix both halves: short
 * texts, written as conditions, one per demand.
 *
 * They are derived by a model because the alternative is a rule over the
 * goal's typography — splitting on blank lines or headings — which is a rule
 * that parses prose the module did not write, and which on this repo's own
 * prompts yields as many bare section headings as it does content. Nothing
 * here is trusted: a probe only decides which candidates are *offered* to the
 * memory-recall pipeline, which judges them as it always did, and the goal is
 * always probe zero, so the fused result can only add to what a bare search
 * would have found.
 */
import type { LlmClient } from '@sysdesign/llm';
import { z } from 'zod';

import { MAX_PROBES, type QueryProbes } from '../../../orchestrators/memory/ports';
import persona from './probes.md?raw';

const PROBE_MAX = 240;
/** Six short conditions, with room to spare. */
const PROBES_MAX_TOKENS = 1000;

const probesSchema = z.strictObject({
  probes: z
    .array(z.string().min(1).max(PROBE_MAX))
    .max(MAX_PROBES)
    .describe('One condition per demand the goal makes, in the register of a stored condition.'),
});

export class LlmQueryProbes implements QueryProbes {
  constructor(
    private readonly client: LlmClient,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  async derive(goal: string): Promise<string[]> {
    try {
      const answer = await this.client.completeStructured({
        system: persona,
        user: goal,
        schema: probesSchema,
        maxTokens: PROBES_MAX_TOKENS,
      });
      return answer?.probes ?? [];
    } catch (error) {
      // The client's contract is null on failure, but a throw here would fail
      // a memory run over an optimisation. Recall degrades to the goal alone.
      this.warn(`query probes not derived: ${String(error)}`);
      return [];
    }
  }
}
