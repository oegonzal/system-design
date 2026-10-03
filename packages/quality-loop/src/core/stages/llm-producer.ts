/**
 * The generator. It sees the goal, the criteria, any advisory memories the run
 * was handed, and — on a revise or retry — the remediations the policy
 * selected, in the lenses' own words, and why its last attempt was refused,
 * when it was: by a validator, or by the schema before anything was judged;
 * or, when its last attempt was judged and did not beat the best, what the
 * judges found wrong with it. It never sees a score: the producer improves
 * against reasons, not against a number.
 */
import type { RemediationNote } from '@sysdesign/contracts';
import { asDetailed, type LlmClient } from '@sysdesign/llm';

import type { TaskSpec } from '../contracts';
import type { ProducerSpec } from '../pipeline';
import type { Producer, ProducerInput } from '../ports';
import {
  criteriaSection,
  goalSection,
  joinSections,
  memoriesSection,
  remediationsSection,
  systemPrompt,
} from './prompting';
import { failedDiagnostic, PRODUCER_STAGE, stageDiagnostic } from './shared';

/** What refused the last attempt, by what the refusal names: the schema read a reply, a validator a revision. */
const REFUSALS_HEADINGS = {
  reply: 'Why your previous reply was refused before any judge read it — do not repeat these',
  revision: 'Why your previous revision was refused before any judge read it — do not repeat these',
} as const;

const refusedBy = (note: RemediationNote): keyof typeof REFUSALS_HEADINGS =>
  'schema' in note.subject ? 'reply' : 'revision';

const SETBACKS_HEADING =
  'Your last attempt was judged and did not beat the best — its defects; do not repeat them';

/** A setback's refs point into an artifact this prompt does not show, so its notes go without them. */
const unlocated = (note: RemediationNote): RemediationNote => ({ ...note, targetRefs: [] });

const INSTRUCTIONS = {
  initial: 'Produce the artifact for this goal, addressing every success criterion.',
  revise:
    'Return the WHOLE artifact again with every remediation applied and everything that was not criticised preserved.',
  retry: 'Start over from the goal. Avoid every listed pitfall.',
} as const;

/**
 * What the producer is briefed with: the goal, the criteria if it consumes
 * them, the run's advisory memories if it consumes those and was handed any,
 * on a revise its previous artifact and what to fix, on a retry what to
 * avoid, the defects of a last attempt that did not beat the best if it
 * consumes those, and the instruction for the mode.
 */
function briefing<T>(
  task: TaskSpec<T>,
  spec: ProducerSpec,
  { contract, mode, prior, remediations, refusals, setbacks, memories }: ProducerInput<T>,
): { sections: string[]; clipped: boolean } {
  const goal = goalSection(contract.goal);
  const sections = [goal.text];
  if (spec.consumes.includes('criteria')) sections.push(criteriaSection(contract.criteria));
  if (spec.consumes.includes('memories') && memories.length > 0) {
    sections.push(memoriesSection(memories));
  }
  if (mode === 'revise' && prior !== null) {
    sections.push(
      ['# Your previous artifact', '', task.output.render(prior)].join('\n'),
      remediationsSection('Remediations to apply', remediations),
    );
  } else if (mode === 'retry') {
    sections.push(remediationsSection('Pitfalls of the discarded attempt', remediations));
  }
  if (spec.consumes.includes('setbacks') && setbacks.length > 0) {
    sections.push(remediationsSection(SETBACKS_HEADING, setbacks.map(unlocated)));
  }
  for (const [kind, heading] of Object.entries(REFUSALS_HEADINGS)) {
    const notes = refusals.filter((note) => refusedBy(note) === kind);
    if (notes.length > 0) sections.push(remediationsSection(heading, notes));
  }
  sections.push(['# Instructions', '', INSTRUCTIONS[mode]].join('\n'));
  return { sections, clipped: goal.clipped };
}

export function createLlmProducer<T>(
  task: TaskSpec<T>,
  spec: ProducerSpec,
  llm: LlmClient,
): Producer<T> {
  return {
    async produce(input) {
      const briefed = briefing(task, spec, input);
      const reply = await asDetailed(llm).completeStructuredDetailed({
        system: systemPrompt('producer', spec.persona),
        user: joinSections(...briefed.sections),
        schema: task.output.schema,
        maxTokens: spec.maxTokens,
      });

      if (reply.value === null) {
        return {
          output: null,
          diagnostic: failedDiagnostic(PRODUCER_STAGE, null, reply.issues),
          model: llm.model,
          issues: reply.issues,
          overruns: [],
        };
      }

      return {
        output: reply.value,
        diagnostic: briefed.clipped
          ? stageDiagnostic(PRODUCER_STAGE, 'token-clipped', 'goal exceeded the prompt budget')
          : null,
        model: llm.model,
        issues: [],
        overruns: reply.overruns,
      };
    },
  };
}
