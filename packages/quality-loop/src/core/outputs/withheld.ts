/**
 * What a reader of a finished run withholds of the items it would draw on —
 * a digest's memories, a recall's kept chunks: each item something confirmed
 * against the iteration names, as far as what named it withholds. A confirmed
 * finding withholds what its type declares on the policy (`WITHHOLDINGS`); a
 * validator's problem what that validator declares on itself; and anything
 * undeclared withholds every item it names, the rule before any was declared.
 * Both are read off the pipeline's definition (`withholdingOf`), so a reader
 * cannot hold a second copy of either. Written once, so no two readers can
 * withhold differently, and over engine facts only — the ledger's findings,
 * its validation reports and its criteria's citations — never over what any
 * of them says in prose.
 */
import type { DecisionPolicy, EvidenceLedger, Withholding } from '@sysdesign/contracts';

import type { Validator } from '../ports';

export { WITHHOLDINGS, type Withholding } from '@sysdesign/contracts';

/** What a finding type or a validator that declares nothing withholds: every item it names. */
export const UNDECLARED_WITHHOLDING: Withholding = 'every-ref';

/**
 * What withholds what, as `withholdingOf` reads it off a definition:
 * `findingTypes` is the policy's own table, read as declared; `validators` is
 * keyed by validator id, one entry per validator that declares `withholds`.
 */
export interface WithholdingRules {
  findingTypes: Readonly<Record<string, { withholds?: Withholding }>>;
  validators: Readonly<Record<string, Withholding>>;
}

/** Nothing declared: every item anything names is withheld. */
export const WITHHOLD_EVERY_REF: WithholdingRules = { findingTypes: {}, validators: {} };

/**
 * Where a pipeline declares what withholds what: its policy, per finding
 * type, and its validators, each on itself — the part of a
 * `PipelineDefinition` of any artifact type that says so.
 */
export interface WithholdingDeclarations {
  policy: Pick<DecisionPolicy, 'findingTypes'>;
  validators: readonly Pick<Validator<unknown>, 'id' | 'withholds'>[];
}

/** The rules a pipeline's definition declares, for its finding types and its validators. */
export const withholdingOf = (definition: WithholdingDeclarations): WithholdingRules => ({
  findingTypes: definition.policy.findingTypes,
  validators: Object.fromEntries(
    definition.validators.flatMap(({ id, withholds }) =>
      withholds === undefined ? [] : [[id, withholds] as const],
    ),
  ),
});

/** What named an item: a confirmed finding, or a validator's problem. */
export const WITHHOLDING_SOURCES = ['finding', 'validator'] as const;
export type WithholdingSource = (typeof WITHHOLDING_SOURCES)[number];

/** One item withheld, and what withheld it — a reader counts these by source and by type. */
export interface WithheldItem {
  /** The item's location id, as the reader listed it. */
  ref: string;
  source: WithholdingSource;
  /** The finding's type, or the validator's id. */
  by: string;
}

/** How many passing criteria cite a location as their evidence: the support an item has. */
export const supportIn =
  (ledger: EvidenceLedger) =>
  (ref: string): number =>
    ledger.criteria.filter(
      (evidence) => evidence.result === 'pass' && evidence.locationRefs.includes(ref),
    ).length;

/** One thing that named items, with what it withholds of them. */
interface Naming {
  source: WithholdingSource;
  by: string;
  withholds: Withholding;
  /** The items it names, in the reader's order. */
  refs: string[];
}

function namingsOf(
  ledger: EvidenceLedger,
  items: readonly string[],
  rules: WithholdingRules,
): Naming[] {
  const among = (refs: readonly string[]): string[] => items.filter((item) => refs.includes(item));
  return [
    ...ledger.findings.map((finding) => ({
      source: 'finding' as const,
      by: finding.type,
      withholds: rules.findingTypes[finding.type]?.withholds ?? UNDECLARED_WITHHOLDING,
      refs: among(finding.locationRefs),
    })),
    ...ledger.validation.flatMap((report) =>
      report.problems.map((problem) => ({
        source: 'validator' as const,
        by: report.validatorId,
        withholds: rules.validators[report.validatorId] ?? UNDECLARED_WITHHOLDING,
        refs: among(problem.locationRefs),
      })),
    ),
  ].filter((naming) => naming.refs.length > 0);
}

/**
 * The items of `items` — location ids, in the artifact's order — that a
 * reader of this ledger withholds, each with what withheld it: every item a
 * naming that withholds `every-ref` names, once per naming.
 */
export function withheldItems(
  ledger: EvidenceLedger,
  items: readonly string[],
  rules: WithholdingRules = WITHHOLD_EVERY_REF,
): WithheldItem[] {
  const namings = namingsOf(ledger, items, rules);
  const withheld: WithheldItem[] = [];
  const add = (naming: Naming, refs: readonly string[]): void => {
    for (const ref of refs) {
      const seen = withheld.some(
        (item) => item.ref === ref && item.source === naming.source && item.by === naming.by,
      );
      if (!seen) withheld.push({ ref, source: naming.source, by: naming.by });
    }
  };
  for (const naming of namings.filter((each) => each.withholds === 'every-ref')) {
    add(naming, naming.refs);
  }
  return withheld;
}

/** The refs of what `withheldItems` withheld, for a reader that only filters. */
export const withheldRefs = (withheld: readonly WithheldItem[]): ReadonlySet<string> =>
  new Set(withheld.map((item) => item.ref));
