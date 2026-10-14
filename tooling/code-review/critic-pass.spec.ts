import type { ClaudeQuery } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { resolveReferences, runCriticPass, type CriticPassInput } from './critic-pass';
import { CRITICS, type CriticName } from './critics';
import type { CriticReport, Finding } from './policy';
import { REPO_MAP, reviewContext } from './testing';

const finding = (problem: string): Finding => ({
  severity: 'high',
  file: 'a.ts',
  category: 'duplication',
  evidence: 'e',
  problem,
  recommendation: 'r',
});

const reports: CriticReport[] = [
  { critic: 'architecture', findings: [finding('real one'), finding('real two')] },
];

type Ref = { critic: 'architecture' | 'testability' | 'readability'; finding: number };

const evaluation = (blocking: Ref[], warnings: Ref[] = [], informational: Ref[] = []) => ({
  blockingFindings: blocking.map((b) => ({ ...b, reason: 'r' })),
  warnings: warnings.map((w) => ({ ...w, reason: 'r' })),
  informational: informational.map((i) => ({ ...i, reason: 'r' })),
  summary: 's',
});

/**
 * This is where "the evaluator must not introduce new findings" stops being a
 * line in a prompt and becomes a property of the code. The evaluator returns
 * indices, so anything that does not resolve to a finding it was actually given
 * is dropped here — these tests are what make that claim true rather than
 * hopeful.
 */
describe('resolveReferences', () => {
  it('keeps a reference that resolves to a real finding', () => {
    const { kept, dropped } = resolveReferences(
      evaluation([{ critic: 'architecture', finding: 0 }]),
      reports,
    );
    expect(kept.map((k) => k.problem)).toEqual(['real one']);
    expect(dropped).toEqual([]);
  });

  it('drops an index the critic never produced', () => {
    const { kept, dropped } = resolveReferences(
      evaluation([{ critic: 'architecture', finding: 9 }]),
      reports,
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('architecture#9');
  });

  it('drops a reference to a critic that did not run', () => {
    const { kept, dropped } = resolveReferences(
      evaluation([{ critic: 'readability', finding: 0 }]),
      reports,
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('readability#0');
  });

  it('counts a finding once even when cited as both blocking and a warning', () => {
    const { kept } = resolveReferences(
      evaluation(
        [{ critic: 'architecture', finding: 0 }],
        [{ critic: 'architecture', finding: 0 }],
      ),
      reports,
    );
    expect(kept).toHaveLength(1);
  });

  it('keeps informational findings — low severity is a channel, not a discard', () => {
    const { kept } = resolveReferences(
      evaluation([], [], [{ critic: 'architecture', finding: 1 }]),
      reports,
    );
    expect(kept.map((k) => k.problem)).toEqual(['real two']);
  });

  it('tolerates an evaluator that omits the informational array entirely', () => {
    // Older responses, or a model that returns only what it had to.
    const legacy = { blockingFindings: [], warnings: [], summary: 's' } as never;
    expect(() => resolveReferences(legacy, reports)).not.toThrow();
  });

  it('stamps the critic as the source of every surviving finding', () => {
    const { kept } = resolveReferences(
      evaluation([
        { critic: 'architecture', finding: 0 },
        { critic: 'architecture', finding: 1 },
      ]),
      reports,
    );
    expect(kept.map((k) => k.source)).toEqual(['architecture', 'architecture']);
  });
});

/** What a scripted turn answers: a critic's report or the evaluator's verdict, or a failure. */
type Answer = { report: unknown } | { fails: string };

/**
 * A stand-in for the SDK's `query` that answers each call by who asked: a
 * critic is known by the one name its schema allows, the evaluator by having
 * none. A call with no scripted answer fails, as an unreachable model would.
 */
function scripted(answers: Partial<Record<CriticName | 'evaluator', Answer>>) {
  const asked: string[] = [];
  const query = ((params: { options: { outputFormat: { schema: Record<string, unknown> } } }) => {
    const critic = params.options.outputFormat.schema['properties'] as
      { critic?: { enum: [CriticName] } } | undefined;
    const who = critic?.critic?.enum[0] ?? 'evaluator';
    asked.push(who);
    const answer = answers[who] ?? { fails: `${who} unreachable` };
    return (async function* () {
      yield 'fails' in answer
        ? {
            type: 'result',
            subtype: 'error_during_execution',
            is_error: true,
            errors: [answer.fails],
          }
        : {
            type: 'result',
            subtype: 'success',
            is_error: false,
            structured_output: answer.report,
            total_cost_usd: 0.01,
          };
    })();
  }) as unknown as ClaudeQuery;
  return { query, asked };
}

const passInput = (
  critics: readonly CriticName[],
  query: ClaudeQuery,
  buildMap: () => typeof REPO_MAP = () => REPO_MAP,
): CriticPassInput => ({
  context: reviewContext(),
  settings: {
    critics,
    model: 'claude-test',
    budgetUsd: 0.25,
    diffBudgetChars: 1_000,
    maxFileChars: 1_000,
    timeoutMs: 1_000,
  },
  runtime: { query, env: {} },
  evidenceGuard: 'off',
  buildMap,
});

const architectureReport = {
  critic: 'architecture',
  findings: [{ ...finding('duplicated'), category: CRITICS.architecture.categories[0] }],
};

describe('runCriticPass', () => {
  it('keeps every critic that answered when another fails, and names the one that failed', async () => {
    const { query } = scripted({
      architecture: { report: architectureReport },
      evaluator: { report: evaluation([{ critic: 'architecture', finding: 0 }]) },
    });
    const pass = await runCriticPass(passInput(['architecture', 'testability'], query));

    expect(pass.findings.map((kept) => [kept.source, kept.problem])).toEqual([
      ['architecture', 'duplicated'],
    ]);
    expect(pass.failed).toEqual(['testability: claude reported an error: testability unreachable']);
    expect(pass.outcomes).toEqual([
      { critic: 'architecture', ok: true, findingCount: 1 },
      {
        critic: 'testability',
        ok: false,
        findingCount: 0,
        error: 'claude reported an error: testability unreachable',
      },
    ]);
    expect(pass.evaluatorRan).toBe(true);
    expect(pass.costUsd).toBeCloseTo(0.02);
  });

  it("keeps the critics' findings as they were when the evaluator fails, and says it did not run", async () => {
    const { query, asked } = scripted({
      architecture: { report: architectureReport },
      testability: { report: { critic: 'testability', findings: [] } },
    });
    const pass = await runCriticPass(passInput(['architecture', 'testability'], query));

    expect(asked).toEqual(['architecture', 'testability', 'evaluator']);
    expect(pass.findings).toHaveLength(1);
    expect(pass.evaluatorRan).toBe(false);
    expect(pass.failed).toEqual(['evaluator: claude reported an error: evaluator unreachable']);
  });

  it('asks no evaluator of a single critic, and reviews without a map that could not be built', async () => {
    const { query, asked } = scripted({ architecture: { report: architectureReport } });
    const pass = await runCriticPass(
      passInput(['architecture'], query, () => {
        throw new Error('nx is not installed');
      }),
    );

    expect(asked).toEqual(['architecture']);
    expect(pass.findings).toHaveLength(1);
    expect(pass.mapWarnings).toEqual(['repository map unavailable — nx is not installed']);
  });
});
