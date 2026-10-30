import { STATUS_CODES } from 'node:http';

import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MemoryRefused } from '@sysdesign/agentic-memory';
import {
  SPACE_REFUSAL_MISSING,
  SPACE_REFUSAL_STATUS,
  type ApiErrorResponse,
  type ApiValidationIssue,
  type CompileReportDto,
  type MemoryRefusalDto,
  type SpaceRefusal,
} from '@sysdesign/contracts';
import { LoopRefused, LoopTimeout, LoopUnreachable } from '@sysdesign/loop-client';

import { HostRefused } from './host-refusal';

/** What a refusal answers: the framework's error shape around a `MemoryRefusalDto`, whichever vocabulary its code is from. */
type RefusalBody = ApiErrorResponse & Omit<MemoryRefusalDto, 'code'> & { code: SpaceRefusal };

/** The refusals the contracts declare 404, each naming what is missing. */
type NotFound = keyof typeof SPACE_REFUSAL_MISSING;

const isNotFound = (code: SpaceRefusal): code is NotFound => code in SPACE_REFUSAL_MISSING;

/** The framework's own fields of an error answered at a status. */
const framed = (status: number) => ({ statusCode: status, error: STATUS_CODES[status] });

/**
 * A refusal by its code, at the one status the contracts declare for it
 * (`SPACE_REFUSAL_STATUS`): what an address does not find is 404, what has
 * moved on or lost its race 409, what the space's declarations do not serve 422.
 */
function refusal(
  code: SpaceRefusal,
  message: string,
  issues: ApiValidationIssue[] = [],
): HttpException {
  const status = SPACE_REFUSAL_STATUS[code];
  const body = {
    ...framed(status),
    code,
    message,
    issues,
    ...(isNotFound(code) ? { missing: SPACE_REFUSAL_MISSING[code] } : {}),
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
  if (error instanceof HostRefused) return refusal(error.code, error.message);
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
