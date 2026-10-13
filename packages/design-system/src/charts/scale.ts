/**
 * The arithmetic a chart's axis rests on, pure: a domain that always holds
 * zero, "nice" tick values that bracket it, and a linear map from value to
 * pixel. Negative values are first-class — a de-obligation is a real month.
 */
export interface Domain {
  min: number;
  max: number;
}

/** How many series a chart may show; the theme's slots are exactly this many. */
export const CHART_SERIES_LIMIT = 4;

const NICE_STEPS = [1, 2, 2.5, 5, 10] as const;

/** The smallest "nice" step (1, 2, 2.5, 5 × 10ⁿ) that covers `span` in at most `count` ticks. */
export function niceStep(span: number, count: number): number {
  if (span <= 0 || count <= 0) return 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = NICE_STEPS.find((candidate) => candidate >= normalized) ?? 10;
  return step * magnitude;
}

/** Nice tick values from at or below the domain's floor to at or above its ceiling, zero always among them. */
export function ticks(domain: Domain, count = 4): number[] {
  const min = Math.min(0, domain.min);
  const max = Math.max(0, domain.max);
  if (min === 0 && max === 0) return [0, 1];
  const step = niceStep(max - min, count);
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let value = first; value <= last + step / 2; value += step) {
    values.push(Number(value.toFixed(10)));
  }
  return values;
}

/** A linear map from a domain to a pixel range; the range may run downward (SVG's y grows down). */
export function linear(
  domain: Domain,
  range: readonly [number, number],
): (value: number) => number {
  const span = domain.max - domain.min;
  return (value) =>
    span === 0 ? range[0] : range[0] + ((value - domain.min) / span) * (range[1] - range[0]);
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** A tick's default label: `1.2M`, `850K`, `-3.4M`. */
export const compactNumber = (value: number): string => compact.format(value);
