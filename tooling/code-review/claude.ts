import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HERE = __dirname;

/**
 * Envelope returned by `claude --output-format json`. `result` is a JSON
 * *string* when a schema is in force, not an object.
 */
interface ClaudeEnvelope {
  is_error: boolean;
  result: string;
  total_cost_usd: number;
  subtype?: string;
}

export interface ClaudeCall {
  /** Replaces Claude Code's own system prompt rather than appending to it. */
  systemPrompt: string;
  userPrompt: string;
  /** Parsed JSON Schema object; stringified and passed inline. */
  schema: unknown;
  model: string;
  budgetUsd: number;
  timeoutMs?: number;
}

export interface ClaudeResult<T> {
  data: T;
  costUsd: number;
}

/**
 * Raised when the CLI stopped for a reason that says nothing about the code —
 * today, the spend cap or a timeout. Callers treat this as "not reviewed"
 * rather than "review failed", because refusing a commit over cost would be
 * indefensible.
 */
export class ReviewUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewUnavailableError';
  }
}

export const readPrompt = (relativePath: string): string =>
  readFileSync(join(HERE, relativePath), 'utf8');

export const readSchema = (relativePath: string): unknown =>
  JSON.parse(readFileSync(join(HERE, relativePath), 'utf8'));

/**
 * One bounded reasoning step.
 *
 * The pipeline's rule is that deterministic code owns workflow control and the
 * model only performs bounded steps, so this deliberately offers no tools, no
 * session continuity and no ability to read the repository — the caller
 * supplies every byte of context the model sees.
 *
 * Flags worth knowing, all established by testing the CLI rather than reading
 * about it:
 *
 * - `--system-prompt` *replaces* Claude Code's system prompt. That is what makes
 *   a critic bounded, and it drops thousands of cached input tokens per call.
 * - `--json-schema` takes inline JSON, not a path, and enforces the shape at the
 *   API layer — which is why there is no validator or retry loop here.
 * - `--bare` looks appropriate and is not: it skips credential loading and the
 *   call fails with "Not logged in".
 * - **the prompt goes on stdin, not in argv.** A packed diff runs to tens of
 *   thousands of characters, far more than a command-line argument was ever
 *   meant to carry — `ARG_MAX` covers argv and the environment together, and
 *   the failure when it is exceeded is not a friendly one.
 */
export async function runClaude<T>({
  systemPrompt,
  userPrompt,
  schema,
  model,
  budgetUsd,
  timeoutMs = 900_000,
}: ClaudeCall): Promise<ClaudeResult<T>> {
  const pending = execFileAsync(
    'claude',
    [
      // No positional prompt: the CLI reads it from stdin, written below.
      '--print',
      '--system-prompt',
      systemPrompt,
      '--json-schema',
      JSON.stringify(schema),
      '--output-format',
      'json',
      '--tools',
      '',
      '--model',
      model,
      '--max-budget-usd',
      String(budgetUsd),
    ],
    {
      cwd: HERE,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      // The pre-commit hook checks this so a commit made from inside a review
      // can never start a second, recursive review.
      env: { ...process.env, CODE_REVIEW_RUNNING: '1' },
    },
  );

  // The prompt itself, on the one channel that can carry it. `end` both flushes
  // and closes, so the CLI stops waiting for more input.
  pending.child.stdin?.end(userPrompt);

  let stdout: string;
  try {
    ({ stdout } = await pending);
  } catch (error) {
    throw classifyFailure(error as ExecFailure, budgetUsd, timeoutMs);
  }
  let envelope: ClaudeEnvelope;
  try {
    envelope = JSON.parse(stdout) as ClaudeEnvelope;
  } catch {
    throw new Error(`claude returned output that is not JSON:\n${stdout.slice(0, 500)}`);
  }

  if (envelope.is_error) {
    throw new Error(`claude reported an error: ${envelope.result}`);
  }

  let data: T;
  try {
    data = JSON.parse(envelope.result) as T;
  } catch {
    throw new Error(
      `claude returned a non-JSON result despite a schema being supplied:\n${String(
        envelope.result,
      ).slice(0, 500)}`,
    );
  }

  return { data, costUsd: envelope.total_cost_usd ?? 0 };
}

export interface ExecFailure {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  signal?: string;
  code?: number | string;
}

/**
 * Turns a failed CLI invocation into the right kind of error.
 *
 * Exported because this decides whether a review *blocks* a change or merely
 * stands aside, which makes it as gate-critical as the merge policy itself:
 *
 *   - the CLI still writes a well-formed envelope to **stdout** on a non-zero
 *     exit, and that envelope holds the real reason. Discarding it turns
 *     "budget reached" into an opaque "exit 1";
 *   - a budget stop or a timeout says nothing about the code, so it is a
 *     ReviewUnavailableError and the caller stands aside;
 *   - anything else is a genuine failure and must surface.
 */
export function classifyFailure(failure: ExecFailure, budgetUsd: number, timeoutMs: number): Error {
  const envelope = tryParse<ClaudeEnvelope>(failure.stdout ?? '');

  if (envelope?.is_error) {
    if (overBudget(envelope, budgetUsd)) {
      return new ReviewUnavailableError(
        `the $${budgetUsd.toFixed(2)} budget was reached ` +
          `($${(envelope.total_cost_usd ?? 0).toFixed(4)} spent). ` +
          'Reduce the change set, or raise the budget for this profile.',
      );
    }
    const detail = String(envelope.result ?? '').trim();
    return new Error(`claude reported an error: ${detail || 'no detail supplied'}`);
  }

  if (failure.killed) {
    return new ReviewUnavailableError(`claude timed out after ${timeoutMs}ms`);
  }

  const stderr = (failure.stderr ?? '').trim().slice(0, 800);
  return new Error(
    `claude failed (exit ${String(failure.code ?? failure.signal ?? 'unknown')})` +
      (stderr ? `:\n${stderr}` : ''),
  );
}

const overBudget = (envelope: ClaudeEnvelope, budgetUsd: number): boolean =>
  typeof envelope.total_cost_usd === 'number' && envelope.total_cost_usd >= budgetUsd;

function tryParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** True when the CLI is reachable at all. */
export async function claudeAvailable(): Promise<boolean> {
  try {
    await execFileAsync('claude', ['--version'], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

export interface CriticGateInput {
  /** Reviewable code files in the change set. */
  reviewableFiles: number;
  /** `Boolean(process.env.ANTHROPIC_API_KEY)` — CI's explicit contract. */
  keyPresent: boolean;
  /** `await claudeAvailable()`. */
  cliAvailable: boolean;
}

/**
 * Why the critics will not run, or `undefined` when they will.
 *
 * Pure and exported so the skip messages are testable: each reason is a
 * different fix — a fork PR cannot mint a secret, a laptop can install the CLI,
 * and a docs-only change needs neither. Failing instead of skipping would be
 * indistinguishable from finding a real problem, so the review says plainly
 * that the critics did not look, runs the deterministic rules regardless, and
 * lets the exit code reflect what the rules found.
 */
export function criticGate({
  reviewableFiles,
  keyPresent,
  cliAvailable,
}: CriticGateInput): string | undefined {
  if (reviewableFiles === 0) {
    return 'critics skipped: no reviewable code in the change set';
  }
  if (!keyPresent) {
    return 'critics skipped: ANTHROPIC_API_KEY is not set — deterministic rules only';
  }
  if (!cliAvailable) {
    return 'critics skipped: the claude CLI is unavailable or not authenticated';
  }
  return undefined;
}
