import { describe, expect, it } from 'vitest';

import { NoopLlmClient } from '@sysdesign/llm';

import { graph, node, flashSaleFacts } from '../testing';
import { DEFAULT_PROFILE } from '../profiles/default.profile';
import { createPassRegistry } from '../passes';
import type { EvidenceArtifact } from './artifacts';
import { composeRecorders, runEvaluation, type PassRecorder } from './orchestrator';
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
      'llm.narrative:diagnostics',
      'llm.workability:diagnostics',
      'llm.scenarios:diagnostics',
    ]);
    expect(run.result.gradedEvidence).toEqual([]);
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

  it('[EVAL-16] carries graded evidence through from an llm pass, and it scores', async () => {
    // A deterministic pass establishes a reliability baseline…
    const base: EvalPass = {
      id: 'rules.base',
      mode: 'deterministic',
      run: () =>
        Promise.resolve<EvidenceArtifact[]>([
          {
            passId: 'rules.base',
            kind: 'coverage',
            entries: [
              {
                expectationId: 'exp.base',
                dimension: 'reliability',
                weight: 1,
                met: true,
                nfrId: null,
                evidenceNodeIds: [],
                evidenceEdgeIds: [],
              },
            ],
          },
        ]),
    };
    // …then the same llm-mode pass whose findings/coverage would be dropped emits
    // graded evidence — grounded ordinals, not a raw number — and the engine's
    // bounded scorer lowers the dimension it grounds a weakness in.
    const lens: EvalPass = {
      id: 'llm.critic',
      mode: 'llm',
      run: () =>
        Promise.resolve<EvidenceArtifact[]>([
          {
            passId: 'llm.critic',
            kind: 'graded-evidence',
            lens: 'critic',
            summary: null,
            model: 'm',
            items: [
              {
                dimension: 'reliability',
                level: 'high',
                confidence: 'high',
                severity: 'high',
                requirementId: 'exp.base',
                affectedNodeIds: [],
                rationale: 'A grounded reliability gap.',
                suggestion: null,
              },
            ],
          },
        ]),
    };

    const run = await runEvaluation({
      graph: graph([]),
      facts: flashSaleFacts(),
      llm,
      profile: {
        ...DEFAULT_PROFILE,
        passes: [
          { pass: 'rules.base', enabled: true },
          { pass: 'llm.critic', enabled: true },
        ],
      },
      registry: new Map([base, lens].map((pass) => [pass.id, pass])),
    });

    // It survives enforceMode (neither findings nor coverage)…
    expect(run.artifacts.some((a) => a.kind === 'graded-evidence')).toBe(true);
    // …and it moved the score: reliability was pulled below its deterministic base.
    const reliability = run.result.trace.dimensions.find((d) => d.dimension === 'reliability');
    expect(reliability?.base).toBe(100);
    expect(reliability?.gradedPenalties).toHaveLength(1);
    expect(reliability?.score).toBe(92);
  });

  /**
   * Attribution for a run dump is derived here, from the id that already
   * stamps the artifacts — never declared by a pass or threaded through the
   * LLM port, where a second copy could drift.
   */
  it('brackets every enabled pass in profile order for a recorder', async () => {
    const seen: string[] = [];
    const rejected: EvidenceArtifact[] = [];

    const rogue: EvalPass = {
      id: 'llm.rogue',
      mode: 'llm',
      run: () => Promise.resolve([{ passId: 'llm.rogue', kind: 'findings', findings: [] }]),
    };
    const plain: EvalPass = {
      id: 'rules.plain',
      mode: 'deterministic',
      run: () => Promise.resolve([]),
    };

    const run = await runEvaluation({
      graph: graph([]),
      facts: flashSaleFacts(),
      llm,
      profile: {
        ...DEFAULT_PROFILE,
        passes: [
          { pass: 'rules.plain', enabled: true, options: { depth: 2 } },
          { pass: 'llm.rogue', enabled: true },
          { pass: 'rules.disabled', enabled: false },
        ],
      },
      registry: new Map([rogue, plain].map((pass) => [pass.id, pass])),
      recorder: {
        beginPass: (passId, mode, options) =>
          seen.push(`begin:${passId}:${mode}:${JSON.stringify(options)}`),
        endPass: (passId, produced) => {
          seen.push(`end:${passId}:${produced.length}`);
          rejected.push(...produced);
        },
      },
    });

    expect(seen).toEqual([
      'begin:rules.plain:deterministic:{"depth":2}',
      'end:rules.plain:0',
      'begin:llm.rogue:llm:{}',
      'end:llm.rogue:1',
    ]);
    // endPass sees the artifact BEFORE mode enforcement drops it — the
    // diagnostic that replaces it records only a count.
    expect(rejected).toEqual([{ passId: 'llm.rogue', kind: 'findings', findings: [] }]);
    expect(run.artifacts.map((artifact) => artifact.kind)).toEqual(['diagnostics']);
  });

  it('composeRecorders hands every observer the same boundaries, in order', async () => {
    const seen: string[] = [];
    const observer = (name: string): PassRecorder => ({
      beginPass: (passId) => seen.push(`${name}:begin:${passId}`),
      endPass: (passId, produced) => seen.push(`${name}:end:${passId}:${produced.length}`),
    });
    const plain: EvalPass = {
      id: 'rules.plain',
      mode: 'deterministic',
      run: () => Promise.resolve([{ passId: 'rules.plain', kind: 'findings', findings: [] }]),
    };
    await runEvaluation({
      graph: graph([]),
      facts: flashSaleFacts(),
      llm,
      profile: { ...DEFAULT_PROFILE, passes: [{ pass: 'rules.plain', enabled: true }] },
      registry: new Map([[plain.id, plain]]),
      recorder: composeRecorders(observer('dump'), observer('heartbeat')),
    });
    expect(seen).toEqual([
      'dump:begin:rules.plain',
      'heartbeat:begin:rules.plain',
      'dump:end:rules.plain:1',
      'heartbeat:end:rules.plain:1',
    ]);
  });

  it('is unchanged by the presence of a recorder', async () => {
    const canvas = graph([node('n-1', 'client'), node('n-2', 'service'), node('n-3', 'database')]);
    const base = {
      graph: canvas,
      facts: flashSaleFacts(),
      llm,
      profile: DEFAULT_PROFILE,
      registry: createPassRegistry(),
    };
    const without = await runEvaluation(base);
    const withRecorder = await runEvaluation({
      ...base,
      recorder: { beginPass: () => undefined, endPass: () => undefined },
    });

    expect(withRecorder.result).toEqual(without.result);
    expect(withRecorder.artifacts).toEqual(without.artifacts);
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
