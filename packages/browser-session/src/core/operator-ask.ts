import {
  answerSuggestionsSchema,
  bestIterationOf,
  parseLenient,
  SUGGESTION_BASES,
  suggestionLocation,
  type Admission,
  type AnsweringSettings,
  type FieldSpec,
  type InteractionAnswer,
  type QualityRunDto,
  type WithheldRef,
  excerpt,
  quoted,
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
import { OperatorInterrupted, QuestionWithdrawn, type Withdrawal } from './ports';

/**
 * Putting a field to the operator, with the suggested answers readied for it.
 * Suggestions are asked for once per form, for every field going to the
 * operator that has no options, as soon as the fields are routed — and never
 * waited on: a question goes out at once, and when its suggestions arrive
 * before an answer it is withdrawn as superseded and asked again with them.
 * Measured 2026-10-11 on the subscription, a form run takes 50 s at the median
 * and 142 s at p90; no fixed wait would be right for both. A run that fails,
 * or offers nothing, leaves the question as it was asked.
 *
 * A suggestion the answering settings' `drafts` table fills — the first in
 * lettering order whose basis it says to type, the record's own by the shipped
 * file — is typed instead of asked: ready before the question, no question
 * goes out; arriving while one waits, the question is withdrawn saying what
 * was filled, an answer given in the same moment standing. Measured
 * 2026-10-12: offered drafts, the operator picked a letter 19 times and typed
 * 4, and a record suggestion is the record's own words — asking only costs the
 * wait.
 */

/** The suggestions a run offers each field, by ref, the ones a reader of the run withholds left out. */
function offeredSuggestions(
  run: QualityRunDto,
  withheld: readonly WithheldRef[],
): ReadonlyMap<string, OfferedSuggestion[]> {
  const best = bestIterationOf(run);
  const parsed =
    best === null || best.artifact === null
      ? null
      : parseLenient(answerSuggestionsSchema, best.artifact);
  if (parsed === null || !parsed.ok) return new Map();
  const kept = (field: number, position: number): boolean =>
    !withheld.some((item) => item.ref === suggestionLocation(field, position));
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
  withheld: readonly WithheldRef[];
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
            : {
                label: state.tasks.open.label,
                url: state.tasks.open.url,
                facets: [...state.tasks.open.facets],
              },
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

/** How much of a typed suggestion the withdrawal quotes. */
const FILLED_QUOTED = 60;

/** The question withdrawn because a suggestion was typed in its place. */
const filledWithdrawal = (suggestion: OfferedSuggestion): Withdrawal => ({
  reason: 'superseded',
  note: `filled from your record: ${quoted(excerpt(suggestion.text, FILLED_QUOTED))}`,
});

/** The first suggestion in lettering order whose basis the settings type, or null when every one is offered. */
export function fillableSuggestion(
  suggestions: readonly OfferedSuggestion[],
  drafts: AnsweringSettings['drafts'],
): OfferedSuggestion | null {
  for (const basis of SUGGESTION_BASES) {
    if (drafts[basis] !== 'fill') continue;
    const found = suggestions.find((suggestion) => suggestion.basis === basis);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * What putting a field to the operator came to: their reply, a suggestion
 * typed in their place, or the session stopping — the question withdrawn
 * from every channel, or never asked, and Ctrl-C at an open terminal
 * question read as that same stop.
 */
export type AskOutcome =
  | { kind: 'asked'; answer: InteractionAnswer; reply: OperatorReply; chosen: AnswerSource | null }
  | {
      kind: 'filled';
      suggestion: OfferedSuggestion;
      run: { runId: string | null; orchestrationRunId: string | null };
    }
  | { kind: 'stopped' };

const STOPPED: AskOutcome = { kind: 'stopped' };

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

/**
 * The operator's answer to a field, with the suggestions readied for it as
 * they come — or a suggestion typed in their place, when the settings fill
 * its basis and `typing` is allowed (a suggestion the page refused is asked
 * again, never typed again).
 */
export async function askOperator(
  ctx: EngineContext,
  prompt: Omit<OperatorPrompt, 'suggestions'>,
  prefetch: SuggestionsPrefetch | null,
  typing = true,
): Promise<AskOutcome> {
  const ask = async (
    suggestions: readonly OfferedSuggestion[],
    signal?: AbortSignal,
  ): Promise<AskOutcome> => {
    if (ctx.stopping.aborted) return STOPPED;
    const asked = fieldQuestion({ ...prompt, suggestions }, askingOf(ctx));
    const withdrawing =
      signal === undefined ? ctx.stopping : AbortSignal.any([ctx.stopping, signal]);
    try {
      const answer = await ctx.deps.operator.ask(asked.question, withdrawing);
      return { kind: 'asked', answer, ...fieldReplyOf(asked, answer) };
    } catch (error) {
      // Ctrl-C at an open terminal question is the operator's stop, as is a question the stop withdrew.
      if (error instanceof OperatorInterrupted) return STOPPED;
      if (error instanceof QuestionWithdrawn && ctx.stopping.aborted) return STOPPED;
      throw error;
    }
  };
  const typed = (suggestions: readonly OfferedSuggestion[]): OfferedSuggestion | null =>
    typing && prefetch !== null
      ? fillableSuggestion(suggestions, ctx.options.answering.drafts)
      : null;
  const filled = (suggestion: OfferedSuggestion): AskOutcome => {
    const record = prefetch?.record();
    return {
      kind: 'filled',
      suggestion,
      run: {
        runId: record?.runId ?? null,
        orchestrationRunId: record?.orchestrationRunId ?? null,
      },
    };
  };
  const ref = prompt.field.ref;
  const ready = prefetch?.now(ref) ?? null;
  if (prefetch === null || !prefetch.covers(ref) || ready !== null) {
    const auto = typed(ready ?? []);
    return auto === null ? ask(ready ?? []) : filled(auto);
  }
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
  const auto = typed(arrived);
  withdrawing.abort(auto === null ? SUPERSEDED : filledWithdrawal(auto));
  try {
    // An answer given in the same moment stands.
    return await first;
  } catch (error) {
    if (!(error instanceof QuestionWithdrawn)) throw error;
    return auto === null ? ask(arrived) : filled(auto);
  }
}
