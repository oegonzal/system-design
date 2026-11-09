import {
  CANVAS_CRITERION_KINDS,
  CANVAS_FINDING_TYPES,
  CANVAS_MAX_CRITERIA,
  CANVAS_STANDING_CRITERIA,
  canvasChangeSchema,
  type DesignTranscript,
  isPlatformServiceId,
  PLATFORM_IDS,
  platformCatalogue,
  submissionLocations,
  TRANSCRIPT_VERSION,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { carryParts } from '../../core/contracts';
import { describePipeline } from '../../core/describe-pipeline';
import { validatePipeline } from '../../core/validate-pipeline';
import { capsAgainstMeasured } from '../../core/testing';
import { SYSTEM_DESIGN_CANVAS } from './definition';
import measured from './measured.json';
import { canvasOutput, type CanvasSubmission } from './output';
import { sampleSubmission } from './testing';

describe('the system-design-canvas pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(SYSTEM_DESIGN_CANVAS as never)).not.toThrow();
    const summary = describePipeline(SYSTEM_DESIGN_CANVAS as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...SYSTEM_DESIGN_CANVAS.critics, ...SYSTEM_DESIGN_CANVAS.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(SYSTEM_DESIGN_CANVAS.id).toBe('system-design-canvas');
    expect(SYSTEM_DESIGN_CANVAS.producer.persona).toContain('system-design-canvas');
    expect(SYSTEM_DESIGN_CANVAS.producer.persona).toContain('`ai-`');
    // [QL-84] [QL-85] A revision is the contract's change set applied to the
    // best, and a round briefs the coach with the twelve worst remediations.
    expect(canvasOutput.revise?.schema).toBe(canvasChangeSchema);
    expect(SYSTEM_DESIGN_CANVAS.policy.briefing).toEqual({ remediationsPerRound: 12 });
  });

  it('[QL-21] [QL-32] [QL-56] its kinds, its cap and its numbering are the contract’s declarations, and its coach sees the criteria, any lessons its run recalled and what its last revision no better than the best was found wrong with', () => {
    expect(Object.keys(SYSTEM_DESIGN_CANVAS.task.criterionKinds)).toEqual([
      ...CANVAS_CRITERION_KINDS,
    ]);
    expect(Object.keys(SYSTEM_DESIGN_CANVAS.policy.criterionKinds)).toEqual([
      ...CANVAS_CRITERION_KINDS,
    ]);
    // `satisfies` refuses a missing type; this refuses an extra one the contract never named.
    expect(Object.keys(SYSTEM_DESIGN_CANVAS.task.findingTypes)).toEqual([...CANVAS_FINDING_TYPES]);
    expect(Object.keys(SYSTEM_DESIGN_CANVAS.policy.findingTypes)).toEqual([
      ...CANVAS_FINDING_TYPES,
    ]);
    expect(SYSTEM_DESIGN_CANVAS.task.maxCriteria).toBe(CANVAS_MAX_CRITERIA);
    expect(SYSTEM_DESIGN_CANVAS.goalSource).toBe('composed');
    expect(SYSTEM_DESIGN_CANVAS.producer.consumes).toEqual(['criteria', 'memories', 'setbacks']);
    const submission = sampleSubmission();
    expect(canvasOutput.locate(submission)).toEqual(
      submissionLocations(submission).map(({ id, label }) => ({ id, label })),
    );
  });

  it('[QL-33] [QL-49] every declared output cap is held at least a fifth above what its stage has measurably written', () => {
    // `measured.json`, refreshed by `pnpm measure:bounds --pipeline=system-design-canvas
    // --since=2026-11-06T22:33:00Z --runs-dir=<the dumps of those runs>`. The
    // window — 3 runs, 2026-11-06T22:33Z to 2026-11-07T00:32Z — opens at the
    // low redraw the coach's effort note measured, which ran before that
    // declaration was committed (66ff7ea8, 23:15:55Z, 35 s after the run
    // finished), and holds the two coach runs that followed: an earlier
    // window would hold the coach to the thinking that change removed.
    // Every lens and the coach are measured there, so no seed stands in for
    // one; the deriver is exempt below, for the reason given. A cap is also
    // the call's time limit. The coach's reply is the contract's change set
    // (`canvasChangeSchema`), written in the submission's own element
    // schemas: the submission's fields are measured and held in
    // `canvas.schema.spec.ts`, and the change set's own paths are exempt
    // there until recorded change sets are measured into it — the first were
    // recorded 2026-11-08 (arm C, lane run 2026-11-08T22-48-49-342-e4eb2d)
    // and `measure:bounds` has not read them yet.
    expect(
      capsAgainstMeasured(SYSTEM_DESIGN_CANVAS, measured.caps, {
        exempt: {
          criteria:
            'derived only through POST /criteria, whose dumps are kind `criteria` and never measured',
        },
      }),
    ).toEqual([]);
  });

  it('[EVAL-4] [EVAL-6] grades a design as competencies: every finding type is owned by one critic, scale weighs the same as every other kind, reasoning and communication are earned by the standing criteria every rubric carries, and the hop and flow defects price onto design', () => {
    const owners = new Map<string, string[]>();
    for (const critic of SYSTEM_DESIGN_CANVAS.critics) {
      for (const type of critic.findingTypes ?? []) {
        owners.set(type, [...(owners.get(type) ?? []), critic.id]);
      }
    }
    for (const type of CANVAS_FINDING_TYPES) expect(owners.get(type)).toHaveLength(1);
    const { criterionKinds, dimensionWeights } = SYSTEM_DESIGN_CANVAS.policy;
    for (const kind of CANVAS_CRITERION_KINDS) expect(criterionKinds[kind].weight).toBe(1);
    expect(Object.keys(dimensionWeights)).toEqual([
      'coverage',
      'design',
      'qualities',
      'reasoning',
      'compliance',
    ]);
    const reasoningKinds = CANVAS_CRITERION_KINDS.filter(
      (kind) => criterionKinds[kind].dimension === 'reasoning',
    );
    expect(reasoningKinds).toEqual(['tradeoff']);
    // The standing criteria earn reasoning (the trade-off rows), design (the communication rows) and qualities (the operations row).
    expect(new Set(CANVAS_STANDING_CRITERIA.map((c) => criterionKinds[c.kind].dimension))).toEqual(
      new Set(['reasoning', 'design', 'qualities']),
    );
    expect(owners.get('placement_defect')).toEqual(['critic.structure']);
    expect(criterionKinds.communication.dimension).toBe('design');
    const judgeOf = (kind: string) =>
      SYSTEM_DESIGN_CANVAS.evaluators.find((evaluator) => evaluator.criterionKinds.includes(kind))
        ?.id;
    expect(judgeOf('tradeoff')).toBe('evaluator.reasoning');
    expect(judgeOf('communication')).toBe('evaluator.design');
    for (const type of [
      'flow_gap',
      'hop_undeclared',
      'failure_path_missing',
      'integration_misfit',
      'service_misfit',
      'tracing_gap',
    ]) {
      expect(owners.get(type)).toEqual(['critic.communication']);
      expect(SYSTEM_DESIGN_CANVAS.policy.findingTypes[type].dimension).toBe('design');
    }
    // Every judge reads the one paragraph on a declared platform, and no persona names a vendor.
    for (const lens of [...SYSTEM_DESIGN_CANVAS.critics, ...SYSTEM_DESIGN_CANVAS.evaluators]) {
      expect(lens.persona).toContain('Where the goal declares a platform and lists its catalogue');
    }
    for (const platform of PLATFORM_IDS) {
      const { label, services } = platformCatalogue(platform);
      for (const lens of [...SYSTEM_DESIGN_CANVAS.critics, ...SYSTEM_DESIGN_CANVAS.evaluators]) {
        expect(lens.persona).not.toContain(label);
        for (const service of services) expect(lens.persona).not.toContain(service.label);
      }
    }
  });

  it('[QL-81] the transcript is carried: a coached design keeps the interview it was graded with, and the coach writes none of it', () => {
    expect(SYSTEM_DESIGN_CANVAS.task.carried).toEqual(['transcript']);
    const interview: DesignTranscript = {
      version: TRANSCRIPT_VERSION,
      turns: [{ role: 'candidate', phase: 'clarify', text: 'Who calls this API?' }],
      phases: [{ id: 'clarify', startedAt: '2026-10-20T20:00:00.000Z', endedAt: null }],
    };
    const revised: CanvasSubmission = { ...sampleSubmission(), transcript: interview };
    const rewritten: CanvasSubmission = { ...sampleSubmission(), transcript: null };
    expect(carryParts(SYSTEM_DESIGN_CANVAS.task, revised, rewritten)?.transcript).toEqual(
      interview,
    );
    // A coach cannot write an interview the design never had.
    expect(carryParts(SYSTEM_DESIGN_CANVAS.task, sampleSubmission(), revised)).toEqual(
      sampleSubmission(),
    );
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(SYSTEM_DESIGN_CANVAS.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(SYSTEM_DESIGN_CANVAS.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-21] locations are positional, and each is printed verbatim beside the author’s own id', () => {
    const submission = sampleSubmission();
    const rendered = canvasOutput.render(submission);
    const ids = canvasOutput.locate(submission).map((location) => location.id);
    for (const id of ids) expect(rendered).toContain(`[${id}]`);
    expect(ids).toEqual([
      ...submission.graph.nodes.map((_, index) => `node.${index + 1}`),
      ...submission.graph.edges.map((_, index) => `edge.${index + 1}`),
      'entity.1',
      'entity.2',
      ...Array.from({ length: 7 }, (_, index) => `binding.${index + 1}`),
      'overview',
      'assumption.1',
      ...Array.from({ length: 4 }, (_, index) => `rationale.${index + 1}`),
      ...Array.from({ length: 3 }, (_, index) => `narration.${index + 1}`),
      'decision.1',
    ]);
    // The author's ids ride beside the positional ones wherever the brief and
    // narrative refer to them, so a reader can join the two.
    expect(rendered).toContain('[node.3] node service-1 kind=service');
    expect(rendered).toContain(
      '[entity.1] Order (order): owned by database-1 (node.11); key: order id from the source, namespaced by channel; fields: customerId, placedAt, channel (online or in-store); invariants: An order is stored once, whichever source it came from.; states: placed → fulfilled → refunded',
    );
    expect(rendered).toContain(
      '[entity.2] Line item (line-item): owned by database-1 (node.11); key: (none given); fields: sku, quantity; invariants: (none given); states: (none)',
    );
    expect(rendered).toContain('    relation: order (entity.1) -> line-item (entity.2) (contains)');
    expect(rendered).toContain('[assumption.1] A shopper reads only their own history');
    expect(rendered).toContain(
      '[binding.1] c1 ← gateway-1 (node.2), service-1 (node.3), database-1 (node.11), order (entity.1): ',
    );
    expect(rendered).toContain(
      '    path, 4 edges, client-1 (node.1) to database-1 (node.11): edge.1 (edge-1: client-1 -> dns-1, sync) → edge.14 (edge-14: dns-1 -> gateway-1, sync) → edge.2 (edge-2: gateway-1 -> service-1, sync) → edge.3 (edge-3: service-1 -> database-1, sync)',
    );
    // [EVAL-7] Under the path, the lifecycle's facts: where it enters, what serves each stage, where it rests.
    expect(rendered).toContain(
      '    way in, as a client from client-1 (node.1): name resolution — dns-1 (node.14); transport security — edge.14 (edge-14, tls); edge delivery — none (where the response is static or media); edge protection — waf-1 (node.15), beside gateway-1 (node.2); the access layer — gateway-1 (node.2); identity — edge.14 (edge-14, auth); comes to rest at database-1 (node.11)',
    );
    expect(rendered).toContain(
      '    way in: begins inside the system at batch-job-1 (node.5); no way in to show; comes to rest at database-1 (node.11)',
    );
    expect(rendered).toContain(
      '    tracing: 12 of 15 components on a traced path, 3 beside one, none untraced',
    );
    expect(rendered).toContain('[rationale.1] service-1 (node.3):');
    expect(rendered).toContain('[narration.1] c1:');
    // Trade-offs print where the claim is, and a slot left empty says so.
    expect(rendered).toContain('    why this, not another: an owned read model rather than');
    expect(rendered).toContain('    why this, not another: (none given)');
    expect(rendered).toContain('— instead of: a service of its own rather than');
    expect(rendered).toContain('— instead of: (none given)');
    expect(rendered).toContain(
      '[decision.1] chose: Own a read model fed by both sources rather than query the storefront and the POS live.; instead of: Query both sources on every request and merge.; cost: Orders can lag',
    );
    expect(rendered).toContain('concerns database-1 (node.11), queue-1 (node.');
    expect(canvasOutput.schema.safeParse(submission).success).toBe(true);
  });

  // A recorded grade (2026-10-02) said a binding's path "stops at edge.4" when
  // it ended on edge.6: the author's `e-3` sat at `edge.4`, `e-4` at `edge.5`,
  // and the path was one run of ids inside a long line. A hop now leads with
  // the id to cite and names the nodes it joins, and the line says where the
  // walk ends, so neither numbering has to be counted.
  it('[QL-21] a binding’s path is its own line: every hop by the id to cite with its endpoints, and where the walk starts and ends', () => {
    const rendered = canvasOutput.render({
      graph: {
        nodes: [
          { id: 'n-1', kind: 'client', label: 'Client' },
          { id: 'n-3', kind: 'service', label: 'Links' },
          { id: 'n-5', kind: 'cache', label: 'Cache' },
          { id: 'ai-db-replica', kind: 'replica', label: 'Replicas' },
        ],
        edges: [
          { id: 'e-1', source: 'n-1', target: 'n-3', kind: 'sync' },
          { id: 'ai-e-new', source: 'n-3', target: 'n-5', kind: 'async' },
          // The author's third and fourth edges, drawn before the coach's: their names lag their positions.
          { id: 'e-3', source: 'n-3', target: 'n-5', kind: 'sync' },
          { id: 'e-4', source: 'n-3', target: 'ai-db-replica', kind: 'sync' },
        ],
      },
      brief: {
        version: 1,
        bindings: [
          { criterionId: 'c2', nodeIds: ['n-3', 'n-5'], path: ['e-1', 'e-3'], claim: 'cache hit' },
          { criterionId: 'c5', nodeIds: ['n-3'], path: ['e-1', 'e-4'], claim: 'fallback read' },
          { criterionId: 'c7', nodeIds: ['n-5'], claim: 'sized for every link' },
          { criterionId: 'c9', nodeIds: ['n-3'], path: ['e-1', 'gone'], claim: 'a broken walk' },
        ],
      },
      narrative: null,
    });
    const lines = rendered.split('\n');
    const under = (binding: string) => lines[lines.findIndex((l) => l.startsWith(binding)) + 1];

    expect(under('[binding.1]')).toBe(
      '    path, 2 edges, n-1 (node.1) to n-5 (node.3): edge.1 (e-1: n-1 -> n-3, sync) → edge.3 (e-3: n-3 -> n-5, sync)',
    );
    expect(under('[binding.2]')).toBe(
      '    path, 2 edges, n-1 (node.1) to ai-db-replica (node.4): edge.1 (e-1: n-1 -> n-3, sync) → edge.4 (e-4: n-3 -> ai-db-replica, sync)',
    );
    // No path, no path line: the trade-off line, printed even when empty so
    // a choice nobody defended is visible, is all that stands before the
    // next binding.
    expect(under('[binding.3]')).toBe('    why this, not another: (none given)');
    expect(lines[lines.findIndex((l) => l.startsWith('[binding.3]')) + 2]).toMatch(
      /^\[binding\.4\] /,
    );
    // A hop no edge answers to is named as such, and the walk's ends are not guessed.
    expect(under('[binding.4]')).toBe(
      '    path, 2 edges: edge.1 (e-1: n-1 -> n-3, sync) → gone (no such edge)',
    );
    // The claim closes the binding's own line; the path never rides inside it.
    expect(lines.find((l) => l.startsWith('[binding.2]'))).toBe(
      '[binding.2] c5 ← n-3 (node.2): "fallback read"',
    );
  });

  it('[QL-21] [UX-31] a node prints the platform service it names after its kind and a connection its config, as the contract renders them', () => {
    const [platformId] = PLATFORM_IDS;
    const [service] = platformCatalogue(platformId).services;
    // A catalogue id is one the schema admits by construction; the guard says so to the compiler.
    if (!isPlatformServiceId(service.id)) throw new Error(`${service.id} is no service id`);
    const rendered = canvasOutput.render({
      graph: {
        nodes: [
          { id: 'n-1', kind: 'client', label: 'Client' },
          { id: 'managed', kind: service.roles[0], service: service.id, label: 'Managed' },
        ],
        edges: [
          {
            id: 'e-1',
            source: 'n-1',
            target: 'managed',
            kind: 'sync',
            config: [{ key: 'timeoutMs', value: 500 }],
          },
        ],
      },
      brief: null,
      narrative: null,
    });
    expect(rendered).toContain(
      `[node.2] node managed kind=${service.roles[0]} service=${service.id} label="Managed"`,
    );
    expect(rendered).toContain('[edge.1] edge e-1: n-1 -> managed (sync) config={"timeoutMs":500}');
  });

  it('[QL-21] a submission without a model, a brief or a narrative says so, and exposes nothing to cite there', () => {
    const bare = sampleSubmission({ brief: null, narrative: null, model: null });
    const rendered = canvasOutput.render(bare);
    expect(rendered.match(/\(none submitted\)/g)).toHaveLength(3);
    expect(rendered).toContain('## Decisions\n(none recorded)');
    const ids = canvasOutput.locate(bare).map((location) => location.id);
    expect(
      ids.some(
        (id) =>
          /^(entity|binding|assumption|rationale|narration|decision)\./.test(id) ||
          id === 'overview',
      ),
    ).toBe(false);
    // A revision stored before models existed carries none: read as none submitted.
    const { model: _absent, ...older } = sampleSubmission();
    expect(canvasOutput.render(older)).toContain('## Model\n(none submitted)');
  });
});
