import {
  CANVAS_CRITERION_KINDS,
  CANVAS_MAX_CRITERIA,
  submissionLocations,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { boundsBelowMeasured, proseBounds } from '../../core/testing';
import { SYSTEM_DESIGN_CANVAS } from './definition';
import { canvasOutput } from './output';
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
  });

  it('[QL-21] [QL-32] its kinds, its cap and its numbering are the contract’s declarations, and its coach sees the criteria and any lessons its run recalled', () => {
    expect(Object.keys(SYSTEM_DESIGN_CANVAS.task.criterionKinds)).toEqual([
      ...CANVAS_CRITERION_KINDS,
    ]);
    expect(Object.keys(SYSTEM_DESIGN_CANVAS.policy.criterionKinds)).toEqual([
      ...CANVAS_CRITERION_KINDS,
    ]);
    expect(SYSTEM_DESIGN_CANVAS.task.maxCriteria).toBe(CANVAS_MAX_CRITERIA);
    for (const evaluator of SYSTEM_DESIGN_CANVAS.evaluators) {
      expect(evaluator.maxItems).toBe(CANVAS_MAX_CRITERIA);
    }
    expect(SYSTEM_DESIGN_CANVAS.goalSource).toBe('composed');
    expect(SYSTEM_DESIGN_CANVAS.producer.consumes).toEqual(['criteria', 'memories']);
    const submission = sampleSubmission();
    expect(canvasOutput.locate(submission)).toEqual(
      submissionLocations(submission).map(({ id, label }) => ({ id, label })),
    );
  });

  it('[QL-1] every declared output cap is above what its stage has measurably written', () => {
    // The most output tokens, thinking included, each stage wrote across the
    // recorded canvas runs (2026-09-30 – 2026-10-01). The coach's figure is a
    // whole turn the client had to resume past its old 16k ceiling.
    const measured: Record<string, number> = {
      producer: 21_122,
      'critic.requirements': 5_329,
      'critic.architecture': 9_849,
      'critic.scale': 6_629,
      'critic.explanation': 7_230,
      'critic.scenarios': 7_580,
      'evaluator.requirements': 4_588,
      'evaluator.quality': 6_754,
    };
    const declared: Record<string, number> = Object.fromEntries([
      ['producer', SYSTEM_DESIGN_CANVAS.producer.maxTokens],
      ...[...SYSTEM_DESIGN_CANVAS.critics, ...SYSTEM_DESIGN_CANVAS.evaluators].map(
        (lens) => [lens.id, lens.maxTokens] as const,
      ),
    ]);
    expect(Object.keys(declared).sort()).toEqual(Object.keys(measured).sort());
    for (const [stage, tokens] of Object.entries(measured)) {
      expect(declared[stage], stage).toBeGreaterThan(tokens);
    }
  });

  it('[QL-4] every string bound the coach writes into sits above the longest it has measurably written', () => {
    // The longest each path has been written by the coach across the recorded
    // canvas runs (static/runs, to 2026-10-01). A string past its bound is a
    // miss that discards the whole revision — never cut to fit — so no bound
    // may be one the coach meets. Every string the schema bounds is listed,
    // so a new field cannot join the schema unmeasured.
    const measured: Record<string, number> = {
      'graph.nodes[].id': 19,
      'graph.nodes[].label': 46,
      'graph.nodes[].config[].key': 23,
      'graph.nodes[].config[].value': 66,
      'graph.nodes[].responsibilities[]': 52,
      'graph.nodes[].operations[].name': 29,
      'graph.nodes[].operations[].notes': 142,
      'graph.edges[].id': 21,
      'graph.edges[].source': 19,
      'graph.edges[].target': 19,
      'graph.edges[].label': 55,
      'graph.edges[].carries[]': 29,
      'brief.bindings[].criterionId': 2,
      'brief.bindings[].nodeIds[]': 19,
      'brief.bindings[].path[]': 18,
      'brief.bindings[].claim': 229,
      'narrative.overview': 1098,
      'narrative.componentRationales[].nodeId': 19,
      'narrative.componentRationales[].prose': 558,
      'narrative.criterionNarrations[].criterionId': 2,
      'narrative.criterionNarrations[].prose': 526,
    };
    expect(Object.keys(proseBounds(canvasOutput.schema)).sort()).toEqual(
      Object.keys(measured).sort(),
    );
    expect(boundsBelowMeasured(canvasOutput.schema, measured)).toEqual([]);
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
      ...Array.from({ length: 6 }, (_, index) => `binding.${index + 1}`),
      'overview',
      ...Array.from({ length: 4 }, (_, index) => `rationale.${index + 1}`),
      ...Array.from({ length: 3 }, (_, index) => `narration.${index + 1}`),
    ]);
    // The author's ids ride beside the positional ones wherever the brief and
    // narrative refer to them, so a reader can join the two.
    expect(rendered).toContain('[node.3] node service-1 kind=service');
    expect(rendered).toContain(
      '[binding.1] c1 ← gateway-1 (node.2), service-1 (node.3), database-1 (node.11)',
    );
    expect(rendered).toContain('path edge-1 (edge.1) → edge-2 (edge.2) → edge-3 (edge.3)');
    expect(rendered).toContain('[rationale.1] service-1 (node.3):');
    expect(rendered).toContain('[narration.1] c1:');
    expect(canvasOutput.schema.safeParse(submission).success).toBe(true);
  });

  it('[QL-21] a submission without a brief or a narrative says so, and exposes nothing to cite there', () => {
    const bare = sampleSubmission({ brief: null, narrative: null });
    const rendered = canvasOutput.render(bare);
    expect(rendered.match(/\(none submitted\)/g)).toHaveLength(2);
    const ids = canvasOutput.locate(bare).map((location) => location.id);
    expect(ids.some((id) => /^(binding|rationale|narration)\./.test(id) || id === 'overview')).toBe(
      false,
    );
  });
});
