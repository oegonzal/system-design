import {
  boundsAgainstMeasured,
  DESIGN_PROMPT_HEADINGS,
  renderDesignPromptMarkdown,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { capsAgainstMeasured, deriverSchema } from '../../core/testing';
import { DESIGN_PROMPT } from './definition';
import measured from './measured.json';
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

  it('[QL-56] its writer sees the checklist, and no setbacks its two-iteration loop could never hand it', () => {
    expect(DESIGN_PROMPT.producer.consumes).toEqual(['criteria']);
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(DESIGN_PROMPT.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(DESIGN_PROMPT.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written, and its deriver’s statement bound above what it wrote', () => {
    // `measured.json`, refreshed by `pnpm measure:bounds`. A cap is also the
    // call's time limit, so one a stage outwrites is a call cut short. The
    // draft's own fields are measured beside its schema, in contracts.
    expect(measured.runs).toBeGreaterThan(0);
    expect(capsAgainstMeasured(DESIGN_PROMPT, measured.caps)).toEqual([]);
    expect(boundsAgainstMeasured(deriverSchema(DESIGN_PROMPT.task), measured.fields)).toEqual([]);
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
