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
    // MEASURED on the first two live document runs (static/runs
    // 2026-10-03T02-01-50-804-cccff4 and 2026-10-03T02-23-44-080-9c93d1,
    // 05-llm/*.meta.json output tokens, 46 calls over an 18-part and a
    // 10-part résumé chunk): the largest any stage wrote. A cap is also the
    // call's time limit, so one a stage outwrites is a call cut short; the
    // caps hold 1.2× these. Re-measure when a chunk shape changes.
    const measured: Record<string, number> = {
      criteria: 3_901,
      producer: 21_858,
      'critic.grounding': 17_454,
      'critic.coverage': 5_917,
      'critic.usability': 15_454,
      'evaluator.capture': 12_382,
      'evaluator.rules': 9_940,
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
    expect(ids).toEqual(['summary', 'memory.1', 'memory.2']);
    // Neither a cited section nor an unused one is a place: a judge cites a memory or the summary.
    for (const memory of digest.memories) {
      for (const alias of memory.evidence) expect(ids).not.toContain(alias);
    }
    for (const alias of digest.unused) expect(ids).not.toContain(alias);
    expect(rendered).toContain('[memory.2] on [section.1]: Alex Example lives in Lisbon');
    expect(documentDigestOutput.schema.safeParse(digest).success).toBe(true);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(documentDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
