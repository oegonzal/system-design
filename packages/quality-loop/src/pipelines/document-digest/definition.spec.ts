import {
  boundsAgainstMeasured,
  CRITERION_STATEMENT_BOUND,
  DOCUMENT_RULES,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { capsAgainstMeasured, deriverSchema, jsonSchemaTypes } from '../../core/testing';
import { DOCUMENT_DIGEST } from './definition';
import measured from './measured.json';
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

  it('[QL-40] the qualifier a section puts on a claim is graded, not merely stated: the rule, the kind it is graded under, the deriver that writes its criterion and the lenses that judge it all name it', () => {
    // A rule the deriver does not recognise yields no criterion, and a rule with
    // no criterion is decoration — nothing grades it, and a learning project
    // reaches the store as completed professional work. These five move together.
    const qualifier = /qualifier/i;
    expect(DOCUMENT_RULES.some((rule) => qualifier.test(rule))).toBe(true);
    expect(DOCUMENT_DIGEST.task.criterionKinds['rule']).toMatch(qualifier);
    expect(DOCUMENT_DIGEST.deriveCriteria.persona).toMatch(qualifier);
    // The producer writes it, the grounding critic faults a dropped one, the rules evaluator scores it.
    expect(DOCUMENT_DIGEST.producer.persona).toMatch(/qualifi|marks it as planned/i);
    expect(DOCUMENT_DIGEST.critics[0].persona).toMatch(qualifier);
    expect(DOCUMENT_DIGEST.evaluators[1].persona).toMatch(qualifier);
    // It is the insight that a form pastes, so that is where the qualifier has to land.
    const rule = DOCUMENT_RULES.find((entry) => qualifier.test(entry)) ?? '';
    expect(rule).toContain('insight');
    // And a document whose sections qualify nothing — a résumé — must not be faulted for it.
    expect(DOCUMENT_DIGEST.evaluators[1].persona).toContain('not_applicable');
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
      CRITERION_STATEMENT_BOUND.ceiling,
    );
    expect(DOCUMENT_DIGEST.deriveCriteria.persona).toMatch(/within the length the schema asks for/);
  });

  it('[QL-33] [QL-49] every declared output cap is a fifth above what its stage has measurably written', () => {
    // `measured.json`, refreshed by `pnpm measure:bounds` — the recorded
    // document runs, which replaced the table seeded from the experience
    // digest. A cap is also the call's time limit, so one a stage outwrites
    // is a call cut short.
    expect(measured.runs).toBeGreaterThan(0);
    expect(capsAgainstMeasured(DOCUMENT_DIGEST, measured.caps)).toEqual([]);
  });

  it('[QL-4] [QL-49] every bound its producer and deriver are shown sits above what they have measurably written', () => {
    expect(
      boundsAgainstMeasured(
        [documentDigestOutput.schema, deriverSchema(DOCUMENT_DIGEST.task)],
        measured.fields,
      ),
    ).toEqual([]);
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
    expect(rendered).toContain(
      '[memory.2] profile_fact on [section.1]: Alex Example lives in Lisbon',
    );
    expect(documentDigestOutput.schema.safeParse(digest).success).toBe(true);
  });

  it('[QL-6] the digest a model answers with contains no number', () => {
    const types = jsonSchemaTypes(documentDigestOutput.schema);
    expect(types).not.toContain('number');
    expect(types).not.toContain('integer');
  });
});
