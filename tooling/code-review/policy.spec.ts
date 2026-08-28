import { describe, expect, it } from 'vitest';

import { sanitise, type CriticReport, type Finding, type SanitiseContext } from './policy';

const finding = (over: Partial<Finding> = {}): Finding => ({
  severity: 'low',
  file: 'a.ts',
  category: 'duplication',
  evidence: 'e',
  problem: 'p',
  recommendation: 'r',
  ...over,
});

/**
 * `sanitise` is what stops a wandering critic reaching a developer. It is pure,
 * and a regression in it silently changes what merges, so it is tested directly
 * rather than only through a live review.
 */
describe('sanitise', () => {
  const report = (findings: Finding[], critic: CriticReport['critic'] = 'architecture') =>
    ({ critic, findings }) as CriticReport;

  const context = (over: Partial<SanitiseContext> = {}): SanitiseContext => ({
    reviewedFiles: ['a.ts'],
    changedFiles: ['a.ts'],
    prompt: 'e',
    intentAvailable: true,
    evidenceGuard: 'enforce',
    ...over,
  });

  it('keeps a finding that is in scope and uses a registered category', () => {
    const { report: clean, dropped } = sanitise(report([finding()]), context());
    expect(clean.findings).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it('drops a finding naming a file the change set does not contain', () => {
    const { report: clean, dropped } = sanitise(
      report([finding({ file: 'invented.ts' })]),
      context(),
    );
    expect(clean.findings).toHaveLength(0);
    expect(dropped[0]).toContain('outside the change set');
  });

  /**
   * A different problem from the one above, and the message has to say so: that
   * one means the critic invented a file, this one means we never showed it.
   */
  it('drops a finding about a file that was omitted from the reviewed diff', () => {
    const { report: clean, dropped } = sanitise(
      report([finding({ file: 'b.ts' })]),
      context({ changedFiles: ['a.ts', 'b.ts'], reviewedFiles: ['a.ts'] }),
    );

    expect(clean.findings).toHaveLength(0);
    expect(dropped[0]).toContain('not in the reviewed diff');
    expect(dropped[0]).not.toContain('outside the change set');
  });

  it('drops a finding whose category the critic is not registered for', () => {
    const { report: clean, dropped } = sanitise(
      report([finding({ category: 'invented-category' })]),
      context(),
    );
    expect(clean.findings).toHaveLength(0);
    expect(dropped[0]).toContain('unregistered category');
  });

  /**
   * The guard for judgements that need a baseline: a complexity verdict with no
   * stated purpose is an opinion about whether the feature should exist, which
   * is not the critic's question to answer.
   */
  describe('the scope-category guard', () => {
    const scoped = () =>
      report([finding({ category: 'disproportionate-complexity' })], 'readability');

    it('drops a scope judgement when no purpose was stated', () => {
      const { report: clean, dropped } = sanitise(scoped(), context({ intentAvailable: false }));

      expect(clean.findings).toHaveLength(0);
      expect(dropped[0]).toContain('needs a stated purpose');
    });

    it('keeps it when a purpose was stated', () => {
      expect(sanitise(scoped(), context()).report.findings).toHaveLength(1);
    });

    it('leaves categories that need no baseline alone', () => {
      const other = report([finding({ category: 'unnecessary-abstraction' })], 'readability');
      expect(sanitise(other, context({ intentAvailable: false })).report.findings).toHaveLength(1);
    });
  });

  describe('the evidence guard', () => {
    const unquoted = () => report([finding({ evidence: 'text that was never shown' })]);

    it('drops an unverifiable quote when enforcing', () => {
      const { report: clean, dropped } = sanitise(unquoted(), context());
      expect(clean.findings).toHaveLength(0);
      expect(dropped[0]).toContain('evidence not found');
    });

    /**
     * The default. Deleting a true finding is worse than keeping an unsupported
     * one — the developer never learns the pipeline had something to say — so
     * the line is recorded while the finding survives.
     */
    it('keeps it under warn, and still records the line', () => {
      const { report: clean, dropped } = sanitise(unquoted(), context({ evidenceGuard: 'warn' }));
      expect(clean.findings).toHaveLength(1);
      expect(dropped[0]).toContain('would drop');
    });

    it('can be switched off entirely', () => {
      expect(sanitise(unquoted(), context({ evidenceGuard: 'off' })).dropped).toEqual([]);
    });

    it('verifies a quote against the whole prompt, not only the diff', () => {
      // The architecture critic is told to ground itself in the repository map,
      // so a map-grounded quote has to verify.
      const mapQuote = report([finding({ evidence: 'type:ui may depend only on type:shared' })]);
      const clean = sanitise(
        mapQuote,
        context({ prompt: '# Repository map\n"type:ui may depend only on type:shared"' }),
      );
      expect(clean.report.findings).toHaveLength(1);
    });
  });
});
