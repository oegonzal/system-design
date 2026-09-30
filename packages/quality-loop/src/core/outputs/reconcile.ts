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

import type { RunOutputs } from './run-outputs';

const round = (value: number): number => Math.round(value * 10) / 10;

/** The spread of the numbers present; null when none is. `n` says how many were. */
export function spread(values: readonly (number | null | undefined)[]): SpreadDto | null {
  const present = values.filter((value): value is number => typeof value === 'number');
  if (present.length === 0) return null;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const mean = present.reduce((total, value) => total + value, 0) / present.length;
  return {
    n: present.length,
    min: round(min),
    max: round(max),
    mean: round(mean),
    range: round(max - min),
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

export function reconcile(
  outputs: readonly RunOutputs[],
  alignment: PanelAlignment,
): PanelReportDto {
  const runs = outputs.length;
  const decisions = tally(outputs.map((output) => output.trace.finalDecision));
  const stopReasons = tally(outputs.map((output) => output.trace.stopReason));

  const gates = tally(
    outputs.flatMap((output) =>
      Object.entries(output.decision?.gates ?? {})
        .filter(([, holds]) => holds)
        .map(([gate]) => gate),
    ),
  );

  const named = new Set<string>();
  for (const output of outputs) {
    for (const name of Object.keys(output.decision?.scores.dimensions ?? {})) named.add(name);
  }
  const dimensions = Object.fromEntries(
    [...named]
      .sort()
      .map((name) => [
        name,
        spread(outputs.map((output) => output.decision?.scores.dimensions[name] ?? null)),
      ]),
  );

  // A type counts once per run however many findings of it the run confirmed.
  const findingTypes = tally(
    outputs.flatMap((output) => [...new Set(output.findings.map((finding) => finding.type))]),
  );

  // Finding keys are type and locations; only a fixed artifact makes them comparable.
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
  const keyed = [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
  const contestedFindings: ContestedFindingDto[] = keyed
    .filter(([, entry]) => entry.seenBy.length < runs)
    .map(([key, entry]) => ({ key, type: entry.type, seenBy: entry.seenBy }));

  return {
    alignment,
    runs,
    decisions,
    stopReasons,
    gates,
    iterations: spread(outputs.map((output) => output.trace.iterations.length)),
    overall: spread(outputs.map((output) => output.decision?.scores.overall ?? null)),
    dimensions,
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
