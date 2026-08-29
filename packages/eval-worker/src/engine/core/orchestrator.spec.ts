import { describe, expect, it } from 'vitest';

import { NoopLlmClient } from '@sysdesign/llm';

import { graph, node, flashSaleFacts } from '../testing';
import { DEFAULT_PROFILE } from '../profiles/default.profile';
import { createPassRegistry } from '../passes';
import type { EvidenceArtifact } from './artifacts';
import { runEvaluation } from './orchestrator';
import type { EvalPass } from './types';

const llm = new NoopLlmClient();

describe('runEvaluation', () => {
  it('runs the active profile and degrades LLM passes to diagnostics', async () => {
    const run = await runEvaluation({
      graph: graph([node('n-1', 'client')]),
      facts: flashSaleFacts(),
      llm,
      profile: DEFAULT_PROFILE,
      registry: createPassRegistry(),
    });

    expect(run.artifacts.map((artifact) => `${artifact.passId}:${artifact.kind}`)).toEqual([
      'rules.core:findings',
      'expectations.banks:coverage',
      'expectations.banks:findings',
      'llm.critic:diagnostics',
      'llm.depth:diagnostics',
      'llm.scenarios:diagnostics',
    ]);
    expect(run.result.annotations).toBeNull();
    expect(run.result.diagnostics[0]?.reason).toBe('llm-disabled');
  });

  it('feeds each pass the artifacts produced before it', async () => {
    const seen: string[][] = [];
    const probe = (id: string): EvalPass => ({
      id,
      mode: 'deterministic',
      run: (ctx) => {
        seen.push(ctx.priorArtifacts.map((artifact) => artifact.passId));
        const produced: EvidenceArtifact[] = [{ passId: id, kind: 'findings', findings: [] }];
        return Promise.resolve(produced);
      },
    });
    const registry = new Map([probe('first'), probe('second')].map((pass) => [pass.id, pass]));

    await runEvaluation({
      graph: graph([]),
      facts: flashSaleFacts(),
      llm,
      profile: {
        ...DEFAULT_PROFILE,
        passes: [
          { pass: 'first', enabled: true },
          { pass: 'second', enabled: true },
        ],
      },
      registry,
    });

    expect(seen).toEqual([[], ['first']]);
  });

  it('skips disabled passes and rejects unknown ones', async () => {
    const registry = createPassRegistry();
    const run = await runEvaluation({
      graph: graph([]),
      facts: flashSaleFacts(),
      llm,
      profile: {
        ...DEFAULT_PROFILE,
        passes: [
          { pass: 'rules.core', enabled: true },
          { pass: 'llm.critic', enabled: false },
        ],
      },
      registry,
    });
    expect(run.artifacts.map((artifact) => artifact.passId)).toEqual(['rules.core']);

    await expect(
      runEvaluation({
        graph: graph([]),
        facts: flashSaleFacts(),
        llm,
        profile: { ...DEFAULT_PROFILE, passes: [{ pass: 'no.such.pass', enabled: true }] },
        registry,
      }),
    ).rejects.toThrow(/unknown pass: no\.such\.pass/);
  });

  it('[EVAL-6] drops findings and coverage from an llm-mode pass', async () => {
    const rogue: EvalPass = {
      id: 'llm.rogue',
      mode: 'llm',
      run: () =>
        Promise.resolve<EvidenceArtifact[]>([
          {
            passId: 'llm.rogue',
            kind: 'findings',
            findings: [
              {
                ruleId: 'reliability.fabricated',
                dimension: 'reliability',
                severity: 'critical',
                title: 'A hallucinated catastrophe',
                message: 'The model would like this to count as a violation.',
                affectedNodeIds: [],
                affectedEdgeIds: [],
                suggestion: null,
                countsAsViolation: true,
                expectationId: null,
                nfrId: null,
              },
            ],
          },
        ]),
    };

    const run = await runEvaluation({
      graph: graph([]),
      facts: flashSaleFacts(),
      llm,
      profile: { ...DEFAULT_PROFILE, passes: [{ pass: 'llm.rogue', enabled: true }] },
      registry: new Map([[rogue.id, rogue]]),
    });

    // The scoring artifact never reaches the aggregator; the refusal is audited.
    expect(run.artifacts).toEqual([
      {
        passId: 'llm.rogue',
        kind: 'diagnostics',
        skipped: false,
        reason: 'llm-artifact-rejected',
        detail: expect.stringContaining('llm.rogue') as string,
      },
    ]);
    expect(run.result.findings).toEqual([]);
    expect(run.result.overallScore).toBe(0);
    expect(run.result.capApplied).toBeNull();
  });

  it('matches runEngine for the deterministic slice', async () => {
    const canvas = graph([node('n-1', 'client'), node('n-2', 'service'), node('n-3', 'database')]);
    const run = await runEvaluation({
      graph: canvas,
      facts: flashSaleFacts(),
      llm,
      profile: DEFAULT_PROFILE,
      registry: createPassRegistry(),
    });
    const { runEngine } = await import('../engine');
    const direct = runEngine(canvas, flashSaleFacts());
    expect(run.result.dimensionScores).toEqual(direct.dimensionScores);
    expect(run.result.overallScore).toBe(direct.overallScore);
    expect(run.result.grade).toBe(direct.grade);
    expect(run.result.summary).toBe(direct.summary);
  });
});
