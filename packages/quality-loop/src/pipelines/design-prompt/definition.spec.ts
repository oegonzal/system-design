import { DESIGN_PROMPT_HEADINGS, renderDesignPromptMarkdown } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { capsBelowMeasured, declaredCaps } from '../../core/testing';
import { DESIGN_PROMPT } from './definition';
import { designPromptOutput } from './output';
import { sampleDraft } from './testing';

describe('the design-prompt pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(DESIGN_PROMPT as never)).not.toThrow();
    const summary = describePipeline(DESIGN_PROMPT as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...DESIGN_PROMPT.critics, ...DESIGN_PROMPT.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(DESIGN_PROMPT.id).toBe('design-prompt');
    expect(DESIGN_PROMPT.producer.persona).toContain('design-prompt');
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(DESIGN_PROMPT.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(DESIGN_PROMPT.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-33] every declared output cap is above what its stage has measurably written', () => {
    // The most output tokens, thinking included, each stage wrote across the
    // recorded design-prompt runs (static/runs, 2026-09-30 – 2026-10-01). A
    // cap is also the call's time limit, so one a stage outwrites is a call
    // cut short.
    const measured: Record<string, number> = {
      criteria: 637,
      producer: 6_693,
      'critic.fidelity': 7_592,
      'critic.gradeability': 4_482,
      'evaluator.prompt': 5_700,
    };
    expect(capsBelowMeasured(DESIGN_PROMPT, measured)).toEqual([]);
    // With a fifth of headroom over each, so the next longer answer is not the one cut.
    const withHeadroom = Object.fromEntries(
      Object.entries(measured).map(([stage, most]) => [stage, Math.ceil(most * 1.2)]),
    );
    expect(capsBelowMeasured(DESIGN_PROMPT, withHeadroom)).toEqual([]);
    expect(Object.keys(declaredCaps(DESIGN_PROMPT)).sort()).toEqual(Object.keys(measured).sort());
  });

  it('[QL-4] every location the draft exposes is printed verbatim where a judge reads it', () => {
    const draft = sampleDraft();
    const rendered = designPromptOutput.render(draft);
    for (const location of designPromptOutput.locate(draft)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(designPromptOutput.locate(draft).map((location) => location.id)).toEqual([
      'title',
      'scenario',
      'functional.1',
      'functional.2',
      'functional.3',
      'nfr.1',
      'nfr.2',
      'scale.1',
      'scale.2',
      'constraint.1',
    ]);
    expect(designPromptOutput.schema.safeParse(draft).success).toBe(true);
  });

  it('[QL-21] the accepted draft renders through the one markdown convention the studio stores', () => {
    const draft = sampleDraft();
    const markdown = renderDesignPromptMarkdown(draft);
    expect(markdown.startsWith(`# ${draft.title}\n`)).toBe(true);
    for (const heading of Object.values(DESIGN_PROMPT_HEADINGS))
      expect(markdown).toContain(heading);
    draft.functionalRequirements.forEach((requirement, index) => {
      expect(markdown).toContain(`${index + 1}. ${requirement}`);
    });
    for (const row of draft.nonFunctionalRequirements) {
      expect(markdown).toContain(`| ${row.kind} | ${row.requirement} | ${row.target} |`);
    }
    for (const row of draft.scale) expect(markdown).toContain(`| ${row.metric} | ${row.target} |`);
    for (const constraint of draft.constraints) expect(markdown).toContain(`- ${constraint}`);
  });
});
