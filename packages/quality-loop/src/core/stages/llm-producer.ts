/**
 * The generator. It sees the goal, the criteria, any advisory memories the run
 * was handed, and — on a revise or retry — the remediations the policy
 * selected, in the lenses' own words, and why its last attempt was refused,
 * when it was: by a validator, or by the schema before anything was judged;
 * or, when its last attempt was judged and did not beat the best, what the
 * judges found wrong with it. It never sees a score: the producer improves
 * against reasons, not against a number.
 *
 * One ask per call. A revise of a prior under a pipeline that declares a
 * revise shape asks for a CHANGE against the prior — the shape's schema and
 * instruction — and the output is the shape's `apply(prior, change)`; every
 * other call asks for the whole artifact in the output schema. An overrun
 * recorded on a change-set reply therefore names a path of the change
 * schema, not of the artifact.
 */
import type { ProduceMode, RemediationNote } from '@sysdesign/contracts';
import { asDetailed, type LlmClient } from '@sysdesign/llm';
import type { ZodType } from 'zod';

import type { ReviseShape, TaskSpec } from '../contracts';
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

/**
 * The heading over what to fix or avoid, saying how many of the best's
 * remediations this ask carries when the policy's briefing cap kept some back.
 */
const capped = (heading: string, handed: number, withheld: number): string =>
  withheld > 0 ? `${heading} (the ${handed} worst of ${handed + withheld})` : heading;

/**
 * What a revision and a fresh start are asked for when the pipeline declares
 * no revise shape: the loop's mechanics, the same for every pipeline.
 */
const INSTRUCTIONS = {
  revise:
    'Return the WHOLE artifact again with every remediation applied and everything that was not criticised preserved.',
  retry: 'Start over from the goal. Avoid every listed pitfall.',
} as const;

/**
 * What a first draft is asked for: the pipeline's own words when it declares
 * them; otherwise the artifact, with the success criteria named only when the
 * producer is shown them — never a checklist it cannot see.
 */
const firstAsk = (spec: ProducerSpec): string =>
  spec.instruction ??
  (spec.consumes.includes('criteria')
    ? 'Produce the artifact for this goal, addressing every success criterion.'
    : 'Produce the artifact for this goal.');

/** One ask of the model: the schema it answers in, the instruction it is given, and how its reply becomes the artifact. */
interface Ask<T> {
  readonly schema: ZodType<unknown>;
  readonly instruction: string;
  settle(value: unknown): T;
}

/** An ask sealed on its reply type: the seam answers only what `schema` parsed, so `settle` reads the reply as an R. */
const ask = <T, R>(schema: ZodType<R>, instruction: string, settle: (reply: R) => T): Ask<T> => ({
  schema,
  instruction,
  settle: (value) => settle(value as R),
});

/** The whole artifact in the output schema: a first draft in the pipeline's words, a revision or a retry in the loop's. */
const wholeAsk = <T>(task: TaskSpec<T>, spec: ProducerSpec, mode: ProduceMode): Ask<T> =>
  ask(
    task.output.schema,
    mode === 'initial' ? firstAsk(spec) : INSTRUCTIONS[mode],
    (artifact) => artifact,
  );

/** A change against the artifact under revision, in the shape's schema and words; the reply applied to the prior is the artifact. */
const changeAsk = <T, C>(revise: ReviseShape<T, C>, prior: T): Ask<T> =>
  ask(revise.schema, revise.instruction, (change) => revise.apply(prior, change));

/** This call's one ask: a change against the prior when there is one and the pipeline declares how; else the whole artifact. */
const askOf = <T>(task: TaskSpec<T>, spec: ProducerSpec, input: ProducerInput<T>): Ask<T> => {
  const { revise } = task.output;
  return input.mode === 'revise' && input.prior !== null && revise !== undefined
    ? changeAsk(revise, input.prior)
    : wholeAsk(task, spec, input.mode);
};

/**
 * What the producer is briefed with: the goal, the criteria if it consumes
 * them, the run's advisory memories if it consumes those and was handed any,
 * on a revise its previous artifact and what to fix, on a retry what to
 * avoid — each list saying how many were kept back when the policy's cap
 * did — the defects of a last attempt that did not beat the best if it
 * consumes those, and the ask's instruction.
 */
function briefing<T>(
  task: TaskSpec<T>,
  spec: ProducerSpec,
  { contract, mode, prior, remediations, withheld, refusals, setbacks, memories }: ProducerInput<T>,
  instruction: string,
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
      remediationsSection(
        capped('Remediations to apply', remediations.length, withheld),
        remediations,
      ),
    );
  } else if (mode === 'retry') {
    sections.push(
      remediationsSection(
        capped('Pitfalls of the discarded attempt', remediations.length, withheld),
        remediations,
      ),
    );
  }
  if (spec.consumes.includes('setbacks') && setbacks.length > 0) {
    sections.push(remediationsSection(SETBACKS_HEADING, setbacks.map(unlocated)));
  }
  for (const [kind, heading] of Object.entries(REFUSALS_HEADINGS)) {
    const notes = refusals.filter((note) => refusedBy(note) === kind);
    if (notes.length > 0) sections.push(remediationsSection(heading, notes));
  }
  sections.push(['# Instructions', '', instruction].join('\n'));
  return { sections, clipped: goal.clipped };
}

export function createLlmProducer<T>(
  task: TaskSpec<T>,
  spec: ProducerSpec,
  llm: LlmClient,
): Producer<T> {
  return {
    async produce(input) {
      const asked = askOf(task, spec, input);
      const briefed = briefing(task, spec, input, asked.instruction);
      const reply = await asDetailed(llm).completeStructuredDetailed({
        system: systemPrompt('producer', spec.persona),
        user: joinSections(...briefed.sections),
        schema: asked.schema,
        maxTokens: spec.maxTokens,
        effort: spec.effort,
      });

      if (reply.value === null) {
        return {
          output: null,
          diagnostic: failedDiagnostic(PRODUCER_STAGE, null, reply),
          model: llm.model,
          issues: reply.issues,
          overruns: [],
        };
      }

      return {
        output: asked.settle(reply.value),
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
