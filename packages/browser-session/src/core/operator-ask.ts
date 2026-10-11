import {
  answerSuggestionsSchema,
  bestIterationOf,
  parseLenient,
  suggestionLocation,
  type Admission,
  type FieldSpec,
  type InteractionAnswer,
  type QualityRunDto,
} from '@sysdesign/contracts';

import type { EngineContext } from './engine-context';
import type { RoutedField } from './field-routing';
import {
  fieldQuestion,
  fieldReplyOf,
  type AnswerSource,
  type Asking,
  type OfferedSuggestion,
  type OperatorPrompt,
  type OperatorReply,
} from './operator-interaction';
import { QuestionWithdrawn, type Withdrawal } from './ports';

/**
 * Putting a field to the operator, with the suggested answers readied for it.
 * Suggestions are asked for once per form, for every field going to the
 * operator that has no options, as soon as the fields are routed — and never
 * waited on: a question goes out at once, and when its suggestions arrive
 * before an answer it is withdrawn as superseded and asked again with them.
 * Measured 2026-10-11 on the subscription, a form run takes 50 s at the median
 * and 142 s at p90; no fixed wait would be right for both. A run that fails,
 * or offers nothing, leaves the question as it was asked.
 */

/** The suggestions a run offers each field, by ref, the ones a reader of the run withholds left out. */
function offeredSuggestions(
  run: QualityRunDto,
  withheld: readonly string[],
): ReadonlyMap<string, OfferedSuggestion[]> {
  const best = bestIterationOf(run);
  const parsed =
    best === null || best.artifact === null
      ? null
      : parseLenient(answerSuggestionsSchema, best.artifact);
  if (parsed === null || !parsed.ok) return new Map();
  const kept = (field: number, position: number): boolean =>
    !withheld.includes(suggestionLocation(field, position));
  return new Map(
    parsed.value.fields.map((field, at) => [
      field.ref,
      field.suggestions
        .filter((_, position) => kept(at, position))
        .map(({ text, basis, why }) => ({ text, basis, why })),
    ]),
  );
}

/**
 * What became of one form's suggestions, as its fields file records it.
 * `pending` is a form settled before they came: the run goes on in the loop,
 * opened by this session's step, and nothing here waits for it.
 */
export interface SuggestionsRecord {
  requested: string[];
  state: 'pending' | 'settled' | 'faulted';
  runId: string | null;
  orchestrationRunId: string | null;
  admission: Admission | null;
  withheld: readonly string[];
  durationMs: number | null;
  fault: string | null;
  offered: Record<string, OfferedSuggestion[]>;
}

/** The suggestions for one form, asked for once and read without waiting. */
export class SuggestionsPrefetch {
  private current: SuggestionsRecord;
  private readonly arrived: Promise<void>;

  private constructor(
    ctx: EngineContext,
    private readonly fields: readonly FieldSpec[],
  ) {
    const { deps, state } = ctx;
    const { step } = state;
    const startedAt = deps.clock.now().getTime();
    this.current = {
      requested: fields.map((field) => field.ref),
      state: 'pending',
      runId: null,
      orchestrationRunId: null,
      admission: null,
      withheld: [],
      durationMs: null,
      fault: null,
      offered: {},
    };
    this.arrived = deps.brain
      .suggestAnswers({
        session: { sessionId: state.sessionId, step },
        mission: ctx.mission,
        task:
          state.tasks.open === null
            ? null
            : { label: state.tasks.open.label, url: state.tasks.open.url },
        fields,
        criteria: ctx.criteria.suggest,
      })
      .then(
        (decided) => {
          // Admitted or fell short, the judged suggestions stand, less what a judge faulted;
          // a run with no judged artifact offers nothing, since no label on it was checked.
          const judged = decided.admission === 'admitted' || decided.admission === 'fell-short';
          const offered = judged ? offeredSuggestions(decided.run, decided.withheld) : new Map();
          this.current = {
            ...this.current,
            state: 'settled',
            runId: decided.runId,
            orchestrationRunId: decided.orchestrationRunId,
            admission: decided.admission,
            withheld: decided.withheld,
            durationMs: deps.clock.now().getTime() - startedAt,
            offered: Object.fromEntries(offered),
          };
        },
        (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.current = {
            ...this.current,
            state: 'faulted',
            durationMs: deps.clock.now().getTime() - startedAt,
            fault: message,
          };
          deps.warn(`step ${step}: no suggested answers — ${message}`);
        },
      );
  }

  /** The prefetch for a form's fields going to the operator with no options; null when there are none. */
  static for(ctx: EngineContext, routed: readonly RoutedField[]): SuggestionsPrefetch | null {
    const fields = routed
      .filter((field) => field.route === 'ask-operator' && field.field.options === null)
      .map((field) => field.field);
    return fields.length === 0 ? null : new SuggestionsPrefetch(ctx, fields);
  }

  covers(ref: string): boolean {
    return this.fields.some((field) => field.ref === ref);
  }

  /** The field's suggestions once they arrived, none for a field they skipped; null while still coming. */
  now(ref: string): OfferedSuggestion[] | null {
    return this.current.state === 'pending' ? null : (this.current.offered[ref] ?? []);
  }

  /** The field's suggestions when they arrive; none when the run faulted. */
  async later(ref: string): Promise<OfferedSuggestion[]> {
    await this.arrived;
    return this.current.offered[ref] ?? [];
  }

  record(): SuggestionsRecord {
    return this.current;
  }
}

const SUPERSEDED: Withdrawal = { reason: 'superseded', note: 'suggested answers arrived' };

/** Who asks for this step, and until when a channel keeps offering the question. */
const askingOf = (ctx: EngineContext): Asking => {
  const task = ctx.state.tasks.open?.label ?? null;
  return {
    origin: {
      kind: 'browser-session',
      id: ctx.state.sessionId,
      label: `step ${ctx.state.step}${task === null ? '' : ` · ${task}`}`,
    },
    expiresAt: new Date(ctx.deps.clock.now().getTime() + ctx.options.questionExpiresAfterMs),
  };
};

/** The operator's answer to a field, with the suggestions readied for it as they come. */
export async function askOperator(
  ctx: EngineContext,
  prompt: Omit<OperatorPrompt, 'suggestions'>,
  prefetch: SuggestionsPrefetch | null,
): Promise<{ answer: InteractionAnswer; reply: OperatorReply; chosen: AnswerSource | null }> {
  const ask = async (suggestions: readonly OfferedSuggestion[], signal?: AbortSignal) => {
    const asked = fieldQuestion({ ...prompt, suggestions }, askingOf(ctx));
    const answer = await ctx.deps.operator.ask(asked.question, signal);
    return { answer, ...fieldReplyOf(asked, answer) };
  };
  const ref = prompt.field.ref;
  const ready = prefetch?.now(ref) ?? null;
  if (prefetch === null || !prefetch.covers(ref) || ready !== null) return ask(ready ?? []);
  const withdrawing = new AbortController();
  const first = ask([], withdrawing.signal);
  const arrived = await Promise.race([
    first.then(
      () => null,
      () => null,
    ),
    prefetch.later(ref),
  ]);
  if (arrived === null || arrived.length === 0) return first;
  withdrawing.abort(SUPERSEDED);
  try {
    // An answer given in the same moment stands.
    return await first;
  } catch (error) {
    if (!(error instanceof QuestionWithdrawn)) throw error;
    return ask(arrived);
  }
}
