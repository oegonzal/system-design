/**
 * The register-memory orchestrator's one step, as an adapter. `digest` runs
 * the register-digest pipeline over the text the request carries and reports
 * what the space may write, read off the run (`readRegisterDigest`). It writes
 * nothing itself — the host writes what the step endorsed — and decides its
 * own closed reason; the runner owns the ledger and the child ids.
 */
import { DEFAULT_QUALITY_RUN_ITERATIONS } from '@sysdesign/contracts';

import { outputsOf } from '../../core/outputs';
import { REGISTER_DIGEST_ID } from '../../pipelines/register-digest/input';
import { completed, runFailed, skipped } from '../common';
import type { StepContext, StepResult } from '../runner/definition';
import { readRegisterDigest } from './read-register-digest';

/** The step hands nothing on: no step comes after it, and the host reads its report. */
export interface RegisterMemoryOutputs {
  digest: undefined;
}

/**
 * Digest the text and report every memory proposed, those endorsed and those
 * withheld, with the reason it endorsed none. The child is handed the goal and
 * a budget, nothing else: the definition refuses a digest or a rubric handed
 * in before a row exists. The budget is the request's, else the default — what
 * the service records for an orchestrator that names no target — so the
 * record states the budget the child runs under.
 */
export async function digest(
  ctx: StepContext<RegisterMemoryOutputs, unknown>,
): Promise<StepResult<undefined>> {
  const acceptAt = ctx.acceptAtOf(REGISTER_DIGEST_ID);
  if (acceptAt === null) return skipped('pipeline-unavailable', REGISTER_DIGEST_ID);
  const child = await ctx.execute({
    goal: ctx.request.goal,
    maxIterations: ctx.request.maxIterations ?? DEFAULT_QUALITY_RUN_ITERATIONS,
  });
  if (!completed(child)) return runFailed(child);
  const { reason, note, counts, report } = readRegisterDigest(outputsOf(child.trace), acceptAt);
  return { status: 'complete', reason, note, counts, report };
}
