import { STATUS_CODES } from 'node:http';

import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MemoryRefused } from '@sysdesign/agentic-memory';
import type {
  ApiErrorResponse,
  ApiValidationIssue,
  CompileReportDto,
  MemoryRefusal,
  MemoryRefusalDto,
} from '@sysdesign/contracts';
import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

import { RunRefused, type RunRefusal } from './spaces.service';

/** A refusal from either vocabulary: the runtime's, or the spaces service's own. */
type Refusal = MemoryRefusal | RunRefusal;

/** What a refusal answers: the framework's error shape around a `MemoryRefusalDto`, whichever vocabulary its code is from. */
type RefusalBody = ApiErrorResponse & Omit<MemoryRefusalDto, 'code'> & { code: Refusal };

/**
 * Every refusal the memory routes answer, with its one status: what an address
 * does not find is 404, a record that has moved on or a write that lost its
 * race is 409, and a request the space's declarations do not serve is 422.
 * Declared with `satisfies`, so a refusal added to either vocabulary does not
 * compile until it has its status here.
 */
const REFUSAL_STATUS = {
  'run.not_found': 404,
  'run.in_flight': 409,
  'run.no_strategy': 422,
  'space.not_found': 404,
  'space.not_compiled': 422,
  'register.unknown': 422,
  'operation.undeclared': 422,
  'scope.invalid': 422,
  'candidate.invalid': 422,
  'metadata.undeclared': 422,
  'record.not_found': 404,
  'record.not_current': 409,
  'identity.mismatch': 422,
  conflict: 409,
  'consolidation.unavailable': 422,
} as const satisfies Record<Refusal, number>;

type NotFound = {
  [K in Refusal]: (typeof REFUSAL_STATUS)[K] extends 404 ? K : never;
}[Refusal];

/**
 * What each not-found names as missing, by kind (the envelope's rule for every
 * 404 an API raises itself). Typed over exactly the codes declared 404, so a
 * not-found added to either vocabulary does not compile until it says what.
 */
const MISSING = {
  'run.not_found': 'run',
  'space.not_found': 'space',
  'record.not_found': 'record',
} as const satisfies Record<NotFound, string>;

const isNotFound = (code: Refusal): code is NotFound => code in MISSING;

/** The framework's own fields of an error answered at a status. */
const framed = (status: number) => ({ statusCode: status, error: STATUS_CODES[status] });

/** A refusal by its code, at its declared status. */
function refusal(code: Refusal, message: string, issues: ApiValidationIssue[] = []): HttpException {
  const status = REFUSAL_STATUS[code];
  const body = {
    ...framed(status),
    code,
    message,
    issues,
    ...(isNotFound(code) ? { missing: MISSING[code] } : {}),
  } satisfies RefusalBody;
  return new HttpException(body, status);
}

/** A run's strategy that does not compile: 422 with the compile report, its problems named. */
export function notCompiled(report: CompileReportDto): HttpException {
  const problems = report.problems.map(({ code }) => code).join(', ');
  const body = {
    ...framed(422),
    message: `the strategy does not compile: ${problems}`,
    report,
  } satisfies ApiErrorResponse & { report: CompileReportDto };
  return new HttpException(body, 422);
}

/**
 * A refusal as its answer, and the loop client's errors as gateway statuses —
 * nobody answered is 503, too slow is 504, the loop said no is 502 (the
 * studio's table, restated: one app never imports another). Anything else goes
 * on as the error it is.
 */
function asHttp(error: unknown): unknown {
  if (error instanceof MemoryRefused) return refusal(error.code, error.message, error.issues);
  if (error instanceof RunRefused) return refusal(error.code, error.message);
  if (error instanceof LoopUnreachable) return new ServiceUnavailableException(error.message);
  if (error instanceof LoopTimeout) return new GatewayTimeoutException(error.message);
  if (error instanceof LoopRefused) {
    return new BadGatewayException(`the quality loop refused: ${error.status} ${error.message}`);
  }
  return error;
}

/** A call with its refusals answered as HTTP. */
export async function answered<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw asHttp(error);
  }
}
