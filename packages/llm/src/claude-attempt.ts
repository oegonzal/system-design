import {
  describeIssue,
  type LlmReplySource,
  type ModelSchema,
  type SchemaIssue,
} from '@sysdesign/contracts';

import { TurnTranscript } from './claude-turn';
import type { LlmCall, LlmCallSink } from './exchange';
import type { LlmFailureKind, LlmRetryPolicy } from './llm-failure';
import { causeOf, type StructuredReply, type StructuredRequest } from './llm-client';
import {
  FEEDBACK_HEADING,
  parseStructured,
  PREVIOUS_REPLY_HEADING,
  SALVAGED,
  type Miss,
  type Read,
} from './structured-reply';

/**
 * One attempt of a structured call: the ask it puts, and what it comes to —
 * a value, a miss worth naming in the next ask, or an ending — each recorded
 * once, in its own right.
 */

/** A reply the schema refused, carried to the next attempt so the ask can name what broke. */
export interface Refusal {
  issues: SchemaIssue[];
  text: string;
}

/** What one attempt came to: the reply, whether it is worth asking again, and what the next ask is told. */
export interface Attempt<T> {
  reply: StructuredReply<T>;
  kind: LlmFailureKind | null;
  refusal: Refusal | null;
}

/** How a turn ended without a result to read, in the words the record keeps. */
export interface Ending {
  error: NonNullable<LlmCall['error']>;
  kind: LlmFailureKind;
  usage: LlmCall['usage'];
  stopReason: string | null;
}

/**
 * The section the next ask gains after `# Output format` when the last reply
 * was refused: one line per fault, and the reply as written when it fits.
 */
function feedbackSection(previous: Refusal, policy: LlmRetryPolicy['feedback']): string[] {
  const lines = [FEEDBACK_HEADING, ...previous.issues.map((issue) => `- ${describeIssue(issue)}`)];
  if (previous.text.length <= policy.replyMaxChars) {
    lines.push('', PREVIOUS_REPLY_HEADING, previous.text);
  }
  return lines;
}

/**
 * What the model is asked: the caller's ask, the schema it must answer in,
 * and — when the last reply was refused and the policy says to — what broke.
 */
export function askOf(
  user: string,
  shown: ModelSchema,
  refused: Refusal | null,
  policy: LlmRetryPolicy['feedback'],
): string {
  const sections = [
    user,
    '',
    '# Output format',
    'Respond with ONLY one JSON object — no prose before or after, no markdown',
    'fence. It must validate against this JSON Schema:',
    JSON.stringify(shown.json),
  ];
  if (refused !== null) sections.push('', ...feedbackSection(refused, policy));
  return sections.join('\n');
}

/** What an attempt is, to its record: the call it belongs to and where it is put. */
export interface AttemptOf<T> {
  model: string;
  sink: LlmCallSink | null;
  request: StructuredRequest<T>;
  maxTokens: number;
  attempt: number;
  queuedMs: number;
  /** Whether this ask carried the last refusal's faults. */
  feedback: boolean;
}

/**
 * How one attempt ends, recorded as it ends. It owns the turn's transcript,
 * so whatever ends the turn, what the turn streamed before the end is still
 * in hand to be read, and the schema as the model was shown it — null until
 * it is converted, which is itself an attempt that can fail.
 */
export class AttemptOutcome<T> {
  readonly transcript = new TurnTranscript();
  /** The schema as the model sees it, once converted; null until then. */
  shown: ModelSchema | null = null;
  private readonly startedAt = new Date();
  private readonly started = Date.now();

  constructor(private readonly of: AttemptOf<T>) {}

  /** A value read: recorded `ok` with what the ladder kept, and nothing left to ask. */
  answered(
    read: Read<T>,
    text: string,
    from: LlmReplySource,
    ended: Pick<LlmCall, 'error' | 'usage' | 'stopReason'>,
  ): Attempt<T> {
    this.record({
      outcome: 'ok',
      text,
      response: read.value,
      ...ended,
      salvage: {
        overruns: read.overruns,
        repairs: read.repairs,
        issues: [],
        from,
        feedback: this.of.feedback,
      },
      apiCalls: this.transcript.apiCalls,
    });
    return {
      reply: { value: read.value, issues: [], overruns: read.overruns, cause: null },
      kind: null,
      refusal: null,
    };
  }

  /**
   * No value: recorded with the faults of the miss when a reply was parsed
   * at all, and carried to the next ask when it had faults to name.
   */
  missed(
    miss: Miss | null,
    text: string,
    kind: LlmFailureKind,
    ended: Pick<LlmCall, 'outcome' | 'error' | 'usage' | 'stopReason'>,
  ): Attempt<T> {
    this.record({
      text: text || null,
      response: null,
      ...ended,
      salvage:
        miss === null
          ? null
          : {
              overruns: [],
              repairs: [],
              issues: miss.issues,
              from: null,
              feedback: this.of.feedback,
            },
      apiCalls: this.transcript.apiCalls,
    });
    return {
      reply: {
        value: null,
        issues: miss?.issues ?? [],
        overruns: [],
        cause: ended.error === null ? null : causeOf(ended.error),
      },
      kind,
      refusal: miss !== null && miss.issues.length > 0 ? { issues: miss.issues, text } : null,
    };
  }

  /**
   * A turn that ended without a result to read — the call's limit, the
   * provider's error, a broken pipe — is still read: what it streamed before
   * the end may hold the whole object, and then the attempt answers `ok`,
   * read from the transcript, with what ended the turn kept under `Salvaged`.
   * Otherwise the ending is the record, with the partial text beside it.
   */
  settle({ error, kind, usage, stopReason }: Ending): Attempt<T> {
    const text = this.transcript.text;
    const extraction =
      text.length > 0 && this.shown !== null
        ? parseStructured(text, this.of.request.schema, this.shown.bounds)
        : null;
    if (extraction?.ok) {
      const salvaged = { name: SALVAGED, message: `${error.name}: ${error.message}` };
      return this.answered(extraction, text, 'transcript', { error: salvaged, usage, stopReason });
    }
    return this.missed(extraction, text, kind, { outcome: 'error', error, usage, stopReason });
  }

  private record(
    call: Pick<
      LlmCall,
      'outcome' | 'text' | 'response' | 'error' | 'usage' | 'stopReason' | 'salvage' | 'apiCalls'
    >,
  ): void {
    const { model, sink, request, maxTokens, attempt, queuedMs } = this.of;
    sink?.({
      model,
      system: request.system,
      user: request.user,
      schema: this.shown?.json ?? null,
      maxTokens,
      startedAt: this.startedAt.toISOString(),
      durationMs: Date.now() - this.started,
      requestId: null,
      attempt,
      queuedMs,
      ...call,
    });
  }
}
