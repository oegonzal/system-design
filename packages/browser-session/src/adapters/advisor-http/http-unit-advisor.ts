import {
  ADVISOR_ROUTES,
  advisorDescriptorSchema,
  bodyMessage,
  JsonCallFailed,
  NO_RECOVERY,
  rideOut,
  sendJson,
  unitAdviceSchema,
  type AdvisorDescriptor,
  type JsonAnswer,
  type Recovery,
  type RecoveryClock,
  type UnitAdvice,
  type UnitAdviceRequest,
} from '@sysdesign/contracts';
import type { ZodType } from 'zod';

import {
  AdvisorFaulted,
  type AdvisorFaultReason,
  type UnitAdvisorPort,
} from '../../core/unit-advice';

/** An advisor answers at once: it reads its own record, never a model. */
const ADVISOR_TIMEOUT_MS = 15_000;

export interface HttpUnitAdvisorOptions {
  /** How long a call rides out an advisor that is restarting; a probe never does. */
  recovery?: Recovery;
  clock?: RecoveryClock;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** The faults asked again within the recovery: the advisor never had the call, or failed it; a refusal or a bad answer stands. */
const TRANSIENT: ReadonlySet<AdvisorFaultReason> = new Set(['unreachable', 'timeout', 'failed']);

/**
 * An advisor over HTTP: the descriptor read from its base URL, the advice
 * asked for with the contracts' request and parsed against the contracts'
 * answer, every failure an `AdvisorFaulted` saying which — so the engine
 * decides what a fault means and a bad value from a service never reaches a
 * goal's index.
 */
export class HttpUnitAdvisor implements UnitAdvisorPort {
  private readonly recovery: Recovery;
  private readonly clock: RecoveryClock | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    options: HttpUnitAdvisorOptions = {},
  ) {
    this.recovery = options.recovery ?? NO_RECOVERY;
    this.clock = options.clock;
    this.timeoutMs = options.timeoutMs ?? ADVISOR_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  describe(): Promise<AdvisorDescriptor> {
    return this.call(
      'GET',
      ADVISOR_ROUTES.describe,
      undefined,
      advisorDescriptorSchema,
      this.recovery,
    );
  }

  recall(request: UnitAdviceRequest, options: { probe: boolean }): Promise<UnitAdvice> {
    return this.call(
      'POST',
      ADVISOR_ROUTES.advice,
      request,
      unitAdviceSchema,
      options.probe ? NO_RECOVERY : this.recovery,
    );
  }

  private call<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    schema: ZodType<T>,
    recovery: Recovery,
  ): Promise<T> {
    return rideOut(
      recovery,
      () => this.attempt(method, path, body, schema),
      (outcome) =>
        'error' in outcome &&
        outcome.error instanceof AdvisorFaulted &&
        TRANSIENT.has(outcome.error.reason),
      this.clock,
    );
  }

  private async attempt<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    schema: ZodType<T>,
  ): Promise<T> {
    let answer: JsonAnswer;
    try {
      answer = await sendJson(this.fetchImpl, this.baseUrl, path, {
        method,
        body,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (!(error instanceof JsonCallFailed)) throw error;
      throw error.failure === 'timeout'
        ? new AdvisorFaulted('timeout', `${method} ${path} took over ${this.timeoutMs} ms`)
        : new AdvisorFaulted('unreachable', error.message);
    }
    const { status, body: parsed } = answer;
    if (status < 200 || status >= 300) {
      throw new AdvisorFaulted(
        status >= 500 ? 'failed' : 'refused',
        `${method} ${path} answered ${status}: ${bodyMessage(parsed)}`,
      );
    }
    const read = schema.safeParse((parsed as { data?: unknown } | undefined)?.data);
    if (!read.success) {
      throw new AdvisorFaulted(
        'malformed',
        `${method} ${path} answered something the contract does not read: ${read.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    }
    return read.data;
  }
}
