/**
 * Agreement across several finished runs, read through the one view. A
 * reconcile reports where runs agreed and where they did not — decisions,
 * gates, spreads, finding types, and under `provided` alignment the finding
 * keys themselves — and never judges: a threshold on any of these would be
 * policy, and policy lives on a pipeline. Pure of everything but ids, enums
 * and numbers, like the normaliser and the controllers.
 */
import type {
  ContestedFindingDto,
  PanelAlignment,
  PanelReportDto,
  SpreadDto,
} from '@sysdesign/contracts';

import { round1, sum } from '../arithmetic';
import type { RunOutputs } from './run-outputs';

/** The spread of the numbers present; null when none is. `n` says how many were. */
export function spread(values: readonly (number | null | undefined)[]): SpreadDto | null {
  const present = values.filter((value): value is number => typeof value === 'number');
  if (present.length === 0) return null;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const mean = sum(present) / present.length;
  return {
    n: present.length,
    min: round1(min),
    max: round1(max),
    mean: round1(mean),
    range: round1(max - min),
  };
}

/** Key → how many times it occurred, keys sorted so two reports of the same runs read the same. */
const tally = (keys: readonly string[]): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

const held = (counts: Record<string, number>, runs: number): string[] =>
  Object.entries(counts)
    .filter(([, count]) => count === runs)
    .map(([key]) => key);

const split = (counts: Record<string, number>, runs: number): string[] =>
  Object.entries(counts)
    .filter(([, count]) => count > 0 && count < runs)
    .map(([key]) => key);

/** Each gate → in how many runs it held. */
const heldGates = (outputs: readonly RunOutputs[]): Record<string, number> =>
  tally(
    outputs.flatMap((output) =>
      Object.entries(output.decision?.gates ?? {})
        .filter(([, holds]) => holds)
        .map(([gate]) => gate),
    ),
  );

/** Each dimension any run scored → the spread of its scores across the runs. */
function dimensionSpreads(outputs: readonly RunOutputs[]): Record<string, SpreadDto | null> {
  const named = new Set<string>();
  for (const output of outputs) {
    for (const name of Object.keys(output.decision?.scores.dimensions ?? {})) named.add(name);
  }
  return Object.fromEntries(
    [...named]
      .sort()
      .map((name) => [
        name,
        spread(outputs.map((output) => output.decision?.scores.dimensions[name] ?? null)),
      ]),
  );
}

/** Each finding type → in how many runs it was confirmed; once per run however many findings of it. */
const findingTypeTally = (outputs: readonly RunOutputs[]): Record<string, number> =>
  tally(outputs.flatMap((output) => [...new Set(output.findings.map((finding) => finding.type))]));

/**
 * Each finding key → which runs confirmed it, keys sorted. Finding keys are
 * type and locations; only a fixed artifact makes them comparable, so under
 * `produced` alignment nothing is listed.
 */
function findingsSeenBy(
  outputs: readonly RunOutputs[],
  alignment: PanelAlignment,
): [string, { type: string; seenBy: number[] }][] {
  const seen = new Map<string, { type: string; seenBy: number[] }>();
  if (alignment === 'provided') {
    outputs.forEach((output, index) => {
      for (const finding of output.findings) {
        const entry = seen.get(finding.key) ?? { type: finding.type, seenBy: [] };
        if (!entry.seenBy.includes(index)) entry.seenBy.push(index);
        seen.set(finding.key, entry);
      }
    });
  }
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function reconcile(
  outputs: readonly RunOutputs[],
  alignment: PanelAlignment,
): PanelReportDto {
  const runs = outputs.length;
  const decisions = tally(outputs.map((output) => output.trace.finalDecision));
  const findingTypes = findingTypeTally(outputs);
  const keyed = findingsSeenBy(outputs, alignment);
  const contestedFindings: ContestedFindingDto[] = keyed
    .filter(([, entry]) => entry.seenBy.length < runs)
    .map(([key, entry]) => ({ key, type: entry.type, seenBy: entry.seenBy }));

  return {
    alignment,
    runs,
    decisions,
    // A run still going has no stop reason to count; it is counted once it settles.
    stopReasons: tally(
      outputs.flatMap(({ trace }) => (trace.stopReason === null ? [] : [trace.stopReason])),
    ),
    gates: heldGates(outputs),
    iterations: spread(outputs.map((output) => output.trace.iterations.length)),
    overall: spread(outputs.map((output) => output.decision?.scores.overall ?? null)),
    dimensions: dimensionSpreads(outputs),
    findingTypes,
    unanimous: {
      findingTypes: held(findingTypes, runs),
      findings: keyed.filter(([, entry]) => entry.seenBy.length === runs).map(([key]) => key),
    },
    contested: {
      decision: Object.keys(decisions).length > 1,
      findingTypes: split(findingTypes, runs),
      findings: contestedFindings,
    },
  };
}
