import { describe, expect, it } from 'vitest';

import { classifyFailure, criticGate, ReviewUnavailableError } from './claude';

const envelope = (over: Record<string, unknown>) =>
  JSON.stringify({ is_error: true, result: '', total_cost_usd: 0, ...over });

/**
 * This decides whether a failed call *blocks* a change or merely stands aside,
 * which makes it as gate-critical as the merge policy. Getting it wrong in
 * either direction is bad: a budget stop that blocks refuses a commit over cost,
 * and a genuine failure that stands aside lets an unreviewed change through.
 */
describe('classifyFailure', () => {
  it('reads the reason from the envelope the CLI writes to stdout on a non-zero exit', () => {
    const error = classifyFailure(
      { stdout: envelope({ result: 'model unavailable' }), code: 1 },
      0.25,
      1000,
    );
    expect(error).not.toBeInstanceOf(ReviewUnavailableError);
    expect(error.message).toContain('model unavailable');
  });

  it('treats reaching the spend cap as "not reviewed", not as a failure', () => {
    const error = classifyFailure(
      { stdout: envelope({ total_cost_usd: 0.31 }), code: 1 },
      0.25,
      1000,
    );
    expect(error).toBeInstanceOf(ReviewUnavailableError);
    expect(error.message).toContain('budget was reached');
    expect(error.message).toContain('0.3100');
  });

  it('does not mistake a cheap genuine error for a budget stop', () => {
    // Same shape, but the spend is nowhere near the cap — this must block.
    const error = classifyFailure(
      { stdout: envelope({ total_cost_usd: 0.01, result: 'invalid schema' }), code: 1 },
      0.25,
      1000,
    );
    expect(error).not.toBeInstanceOf(ReviewUnavailableError);
    expect(error.message).toContain('invalid schema');
  });

  it('treats a timeout as "not reviewed"', () => {
    const error = classifyFailure({ killed: true, signal: 'SIGTERM' }, 0.25, 600_000);
    expect(error).toBeInstanceOf(ReviewUnavailableError);
    expect(error.message).toContain('600000ms');
  });

  it('surfaces stderr when there is no envelope to read', () => {
    const error = classifyFailure({ stderr: 'command not found', code: 127 }, 0.25, 1000);
    expect(error).not.toBeInstanceOf(ReviewUnavailableError);
    expect(error.message).toContain('exit 127');
    expect(error.message).toContain('command not found');
  });

  it('survives stdout that is not JSON at all', () => {
    const error = classifyFailure({ stdout: '<html>502</html>', code: 1 }, 0.25, 1000);
    expect(error).not.toBeInstanceOf(ReviewUnavailableError);
    expect(error.message).toContain('exit 1');
  });

  it('says something useful when the envelope carries no detail', () => {
    const error = classifyFailure({ stdout: envelope({}), code: 1 }, 0.25, 1000);
    expect(error.message).toContain('no detail supplied');
  });
});

/**
 * The rules-only fallback hangs off these messages: CI prints them into the
 * job log, and a fork PR's contributor reads them to learn why no critic
 * commented. Each reason is a different fix, so each gets its own words.
 */
describe('criticGate', () => {
  const open = { reviewableFiles: 3, keyPresent: true, cliAvailable: true };

  it('lets the critics run when everything is in place', () => {
    expect(criticGate(open)).toBeUndefined();
  });

  it('skips when the change holds no reviewable code', () => {
    const reason = criticGate({ ...open, reviewableFiles: 0 });
    expect(reason).toContain('critics skipped');
    expect(reason).toContain('no reviewable code');
  });

  it('skips without an API key — the fork-PR case CI documents', () => {
    const reason = criticGate({ ...open, keyPresent: false });
    expect(reason).toContain('critics skipped');
    expect(reason).toContain('ANTHROPIC_API_KEY');
    expect(reason).toContain('deterministic rules only');
  });

  it('skips when the CLI is missing, and says so distinctly from the key case', () => {
    const reason = criticGate({ ...open, cliAvailable: false });
    expect(reason).toContain('critics skipped');
    expect(reason).toContain('claude CLI');
    expect(reason).not.toContain('ANTHROPIC_API_KEY');
  });

  it('reports the no-code case ahead of credentials, because it needs no fixing', () => {
    const reason = criticGate({ reviewableFiles: 0, keyPresent: false, cliAvailable: false });
    expect(reason).toContain('no reviewable code');
  });
});
