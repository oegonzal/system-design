import { CRITERION_STATEMENT_MAX_LENGTH } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { capsBelowMeasured, declaredCaps, jsonSchemaTypes } from '../../core/testing';
import { DOCUMENT_DIGEST } from './definition';
import { documentDigestOutput } from './output';
import { sampleDocumentDigest } from './testing';

describe('the document-digest pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(DOCUMENT_DIGEST as never)).not.toThrow();
    const summary = describePipeline(DOCUMENT_DIGEST as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...DOCUMENT_DIGEST.critics, ...DOCUMENT_DIGEST.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(DOCUMENT_DIGEST.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(DOCUMENT_DIGEST.id).toBe('document-digest');
    expect(DOCUMENT_DIGEST.goalSource).toBe('composed');
    expect(DOCUMENT_DIGEST.producer.persona).toContain('document-digest');
    expect(summary.validators.map((validator) => validator.id)).toEqual(['references', 'limits']);
    expect(summary.controller.id).toBe('standard');
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(DOCUMENT_DIGEST.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(DOCUMENT_DIGEST.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-40] facts and rules, two samples agreeing before a falsehood is withheld, and every persona names the pipeline and the places it cites', () => {
    expect(Object.keys(DOCUMENT_DIGEST.task.criterionKinds)).toEqual(['fact', 'rule']);
    expect(DOCUMENT_DIGEST.policy.criterionKinds['rule'].gate).toBe(true);
    const gated = Object.entries(DOCUMENT_DIGEST.policy.findingTypes)
      .filter(([, mapped]) => mapped.gate)
      .map(([type]) => type);
    expect(gated).toEqual(['invented_fact', 'misread_section']);
    expect(DOCUMENT_DIGEST.policy.evidence.minHits).toBe(2);
    for (const lens of [...DOCUMENT_DIGEST.critics, ...DOCUMENT_DIGEST.evaluators]) {
      expect(lens.samples).toBe(2);
      expect(lens.persona).toContain('document-digest');
      expect(lens.persona).toMatch(/memory\.1/);
    }
    expect(DOCUMENT_DIGEST.critics.map((lens) => lens.id)).toEqual([
      'critic.grounding',
      'critic.coverage',
      'critic.usability',
    ]);
    expect(DOCUMENT_DIGEST.evaluators.map((lens) => lens.criterionKinds)).toEqual([
      ['fact'],
      ['rule'],
    ]);
    expect(DOCUMENT_DIGEST.deriveCriteria.persona).toContain('document-digest');
    // The operator's answer is the fact where a guidance document says otherwise.
    for (const persona of [
      DOCUMENT_DIGEST.producer.persona,
      DOCUMENT_DIGEST.critics[0].persona,
      DOCUMENT_DIGEST.evaluators[1].persona,
    ]) {
      expect(persona).toContain('guidance');
    }
    // A fact criterion quotes the section's own figures, so the bound sits above the contract's default.
    expect(describePipeline(DOCUMENT_DIGEST as never).task.maxStatementLength).toBeGreaterThan(
      CRITERION_STATEMENT_MAX_LENGTH,
    );
    expect(DOCUMENT_DIGEST.deriveCriteria.persona).toMatch(/longer than the schema allows/);
  });

  it('[QL-33] every declared output cap is above what its stage has measurably written', () => {
    // SEEDED from the experience digest's measured table (static/runs,
    // 2026-09-20 – 2026-10-02): the pipeline with the same lens shape and
    // item shape over goals of the same size. No live document run has been
    // recorded yet; the first ones (05-llm output tokens) replace this
    // table. A cap is also the call's time limit, so one a stage outwrites
    // is a call cut short.
    const measured: Record<string, number> = {
      criteria: 7_684,
      producer: 31_719,
      'critic.grounding': 26_918,
      'critic.coverage': 27_805,
      'critic.usability': 19_963,
      'evaluator.capture': 13_321,
      'evaluator.rules': 13_321,
    };
    expect(capsBelowMeasured(DOCUMENT_DIGEST, measured)).toEqual([]);
    expect(Object.keys(declaredCaps(DOCUMENT_DIGEST)).sort()).toEqual(Object.keys(measured).sort());
  });

  it('[QL-4] every location the digest exposes is printed verbatim where a judge reads it, and a citation is never a location', () => {
    const digest = sampleDocumentDigest();
    const rendered = documentDigestOutput.render(digest);
    for (const location of documentDigestOutput.locate(digest)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    const ids = documentDigestOutput.locate(digest).map((location) => location.id);
    expect(ids).toEqual(['summary', 'memory.1', 'memory.2', 'section.3']);
    for (const memory of digest.memories) {
      for (const alias of memory.evidence) expect(ids).not.toContain(alias);
    }
    expect(rendered).toContain('[memory.2] on [section.1]: Alex Example lives in Lisbon');
    expect(documentDigestOutput.schema.safeParse(digest).success).toBe(true);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(documentDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
