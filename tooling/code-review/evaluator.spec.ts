import { describe, expect, it } from 'vitest';

import {
  decide,
  defaultSummary,
  mergeFindings,
  ruleSource,
  worseOf,
  type SourcedFinding,
} from './evaluator';
import type { Finding } from './policy';

const finding = (over: Partial<Finding> = {}): Finding => ({
  severity: 'low',
  file: 'a.ts',
  category: 'duplication',
  evidence: 'e',
  problem: 'p',
  recommendation: 'r',
  ...over,
});

const sourced = (source: string, over: Partial<Finding> = {}): SourcedFinding => ({
  ...finding(over),
  source,
});

/**
 * `decide` is the merge policy — it converts findings into the exit code that
 * gates CI. It is pure, and a regression here silently changes what merges, so
 * it is tested directly rather than only through a live review.
 */
describe('decide', () => {
  it('passes when there is nothing to report', () => {
    expect(decide([])).toBe('pass');
  });

  it('treats low severity as informational, not a warning', () => {
    expect(decide([finding({ severity: 'low' })])).toBe('pass');
  });

  it('warns on medium', () => {
    expect(decide([finding({ severity: 'medium' })])).toBe('warn');
  });

  it('fails on high, whatever else is present', () => {
    expect(decide([finding({ severity: 'low' }), finding({ severity: 'high' })])).toBe('fail');
  });

  it('lets the worst severity win rather than the last one seen', () => {
    expect(decide([finding({ severity: 'high' }), finding({ severity: 'medium' })])).toBe('fail');
  });

  /** The rules-only mode: no critics, and the exit still reflects the rules. */
  it('decides identically over rule findings alone', () => {
    expect(decide([sourced(ruleSource('theme-guard'), { severity: 'high' })])).toBe('fail');
    expect(decide([sourced(ruleSource('file-size'), { severity: 'medium' })])).toBe('warn');
  });
});

describe('worseOf', () => {
  it('never downgrades', () => {
    expect(worseOf('fail', 'warn')).toBe('fail');
    expect(worseOf('warn', 'fail')).toBe('fail');
    expect(worseOf('pass', 'warn')).toBe('warn');
    expect(worseOf('pass', 'pass')).toBe('pass');
  });
});

describe('mergeFindings', () => {
  it('puts rule findings ahead of critic findings, whatever their severities', () => {
    const merged = mergeFindings(
      [sourced(ruleSource('file-size'), { severity: 'low' })],
      [sourced('architecture', { severity: 'high' })],
    );

    expect(merged.map((f) => f.source)).toEqual(['rules/file-size', 'architecture']);
  });

  it('orders by severity within each stream', () => {
    const merged = mergeFindings(
      [
        sourced(ruleSource('file-size'), { severity: 'low' }),
        sourced(ruleSource('boundaries'), { severity: 'high' }),
      ],
      [sourced('readability', { severity: 'low' }), sourced('testability', { severity: 'medium' })],
    );

    expect(merged.map((f) => f.source)).toEqual([
      'rules/boundaries',
      'rules/file-size',
      'testability',
      'readability',
    ]);
  });

  it('handles either stream being empty — the rules-only and clean-rules cases', () => {
    const rule = sourced(ruleSource('boundaries'), { severity: 'high' });
    const critic = sourced('architecture');

    expect(mergeFindings([rule], [])).toEqual([rule]);
    expect(mergeFindings([], [critic])).toEqual([critic]);
    expect(mergeFindings([], [])).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const rules = [
      sourced(ruleSource('file-size'), { severity: 'low' }),
      sourced(ruleSource('boundaries'), { severity: 'high' }),
    ];
    const order = rules.map((f) => f.source);
    mergeFindings(rules, []);
    expect(rules.map((f) => f.source)).toEqual(order);
  });
});

describe('ruleSource', () => {
  it('prefixes so a record reader can split rules from critics', () => {
    expect(ruleSource('theme-guard')).toBe('rules/theme-guard');
  });
});

describe('defaultSummary', () => {
  it('says so plainly when there is nothing', () => {
    expect(defaultSummary([])).toBe('No findings.');
  });

  it('counts by consequence, not by category', () => {
    expect(
      defaultSummary([
        finding({ severity: 'high' }),
        finding({ severity: 'medium' }),
        finding({ severity: 'medium' }),
        finding({ severity: 'low' }),
      ]),
    ).toBe('1 blocking, 2 warning, 1 informational');
  });
});
