import { describe, expect, it } from 'vitest';

import {
  backoffFor,
  classifyFailure,
  DEFAULT_RETRY_POLICY,
  retryable,
  type LlmFailureKind,
} from './llm-failure';

/**
 * Every member of the SDK's two closed unions, written out. If the SDK grows a
 * name, this list stops matching its type and the table is extended on purpose
 * rather than by a fallback nobody noticed.
 */
const ASSISTANT_ERRORS = [
  'authentication_failed',
  'oauth_org_not_allowed',
  'account_on_hold',
  'billing_error',
  'rate_limit',
  'overloaded',
  'invalid_request',
  'model_not_found',
  'server_error',
  'unknown',
  'max_output_tokens',
] as const;

const RESULT_SUBTYPES = [
  'error_during_execution',
  'error_max_turns',
  'error_max_budget_usd',
  'error_max_structured_output_retries',
] as const;

describe('classifying why a call produced nothing', () => {
  it('[QL-28] every name the provider can give maps to a kind, none by substring', () => {
    const kinds = ASSISTANT_ERRORS.map((assistantError) => classifyFailure({ assistantError }));
    expect(kinds).toEqual([
      'auth',
      'auth',
      'auth',
      'auth',
      'rate-limited',
      'overloaded',
      'invalid-request',
      'invalid-request',
      'overloaded',
      'unknown',
      'unparseable',
    ]);

    expect(RESULT_SUBTYPES.map((resultSubtype) => classifyFailure({ resultSubtype }))).toEqual([
      'overloaded',
      'overloaded',
      'budget',
      'invalid-request',
    ]);
  });

  it('[QL-28] our own facts outrank the provider’s, because we know them first-hand', () => {
    // An abort is ours: whatever the turn was saying when we cut it off, the
    // reason it produced nothing is that we stopped it.
    expect(classifyFailure({ aborted: true, assistantError: 'overloaded' })).toBe('timeout');
    expect(classifyFailure({ noResult: true })).toBe('transport');
    expect(classifyFailure({ schemaMiss: true })).toBe('schema-miss');
    expect(classifyFailure({ unparseable: true })).toBe('unparseable');
  });

  it('[QL-28] a name outside both unions is unknown, not guessed at', () => {
    expect(classifyFailure({ assistantError: 'teapot_on_fire' })).toBe('unknown');
    expect(classifyFailure({ resultSubtype: 'error_brand_new' })).toBe('unknown');
    expect(classifyFailure({})).toBe('unknown');
  });
});

describe('whether to ask again', () => {
  const kinds: LlmFailureKind[] = [
    'schema-miss',
    'unparseable',
    'rate-limited',
    'overloaded',
    'transport',
    'timeout',
    'unknown',
    'auth',
    'invalid-request',
    'budget',
  ];

  it('[QL-28] a sound request that met a bad attempt is retried; a rejected request never is', () => {
    expect(kinds.filter((kind) => retryable(kind, 1))).toEqual([
      'schema-miss',
      'unparseable',
      'rate-limited',
      'overloaded',
      'transport',
      'timeout',
      'unknown',
    ]);
    // The three that would fail identically however often they were sent.
    expect(kinds.filter((kind) => !retryable(kind, 1))).toEqual([
      'auth',
      'invalid-request',
      'budget',
    ]);
  });

  it('[QL-28] attempts are bounded, and a timeout gets its own smaller allowance', () => {
    expect(retryable('schema-miss', 2)).toBe(true);
    expect(retryable('schema-miss', DEFAULT_RETRY_POLICY.attempts)).toBe(false);
    // Each timeout costs the full bound, so it is allowed fewer tries than the rest.
    expect(retryable('timeout', 1)).toBe(true);
    expect(retryable('timeout', DEFAULT_RETRY_POLICY.timeoutAttempts)).toBe(false);
  });

  it('[QL-28] an unrecognised failure is given exactly one more chance', () => {
    expect(retryable('unknown', 1)).toBe(true);
    expect(retryable('unknown', 2)).toBe(false);
  });

  it('[QL-28] only a strained provider is given room, and the room is bounded', () => {
    expect(backoffFor('schema-miss', 1)).toBe(0);
    expect(backoffFor('transport', 1)).toBe(0);
    expect(backoffFor('rate-limited', 1)).toBe(DEFAULT_RETRY_POLICY.backoffMs);
    expect(backoffFor('overloaded', 2)).toBe(DEFAULT_RETRY_POLICY.backoffMs * 2);
    expect(backoffFor('rate-limited', 99)).toBe(DEFAULT_RETRY_POLICY.maxBackoffMs);
  });
});
