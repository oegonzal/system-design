/**
 * An evaluator lens: criteria-oriented. "How well does the artifact satisfy
 * each criterion of my kinds?" — one result per criterion, enum-locked to the
 * criteria it is the sole judge of. Its advisory verdict is recorded and goes
 * no further.
 */
import type { EvaluationReport } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { EvaluatorSpec } from '../pipeline';
import type { Evaluator, LensContext } from '../ports';
import {
  artifactSection,
  criteriaSection,
  goalSection,
  joinSections,
  locationsSection,
  systemPrompt,
  upstreamSections,
} from './prompting';
import { enumTuple, evaluationSchema } from './schemas';
import { planned, sampleUnits, skipped } from './shared';

export function createLlmEvaluator<T>(
  spec: EvaluatorSpec,
  clients: readonly LlmClient[],
): Evaluator<T> {
  return {
    id: spec.id,
    consumes: spec.consumes,
    plan(ctx: LensContext<T>) {
      const criteria = ctx.contract.criteria.filter((criterion) =>
        spec.criterionKinds.includes(criterion.kind),
      );
      const ids = enumTuple(criteria.map((criterion) => criterion.id));
      if (!ids) {
        return planned(skipped(spec.id, null, 'not-applicable', 'no criteria of its kinds'));
      }

      const request = {
        system: systemPrompt('evaluator', spec.persona),
        user: joinSections(
          goalSection(ctx.contract.goal).text,
          criteriaSection(criteria),
          artifactSection(ctx.rendered),
          locationsSection(ctx.locations),
          ...upstreamSections(ctx.upstream, spec.consumes),
        ),
        schema: evaluationSchema(
          ids,
          ctx.locations.map((location) => location.id),
        ),
        maxTokens: spec.maxTokens,
      };

      return sampleUnits(spec.id, clients, request, (sample, response): EvaluationReport => ({
        evaluatorId: spec.id,
        sample,
        results: response.results,
        advisoryVerdict: response.advisoryVerdict,
      }));
    },
  };
}
