/**
 * What the story smoke gate decides, kept apart from how it drives a browser.
 *
 * `smoke.ts` owns the server, the browser and the navigation; everything that
 * is a judgement — which renders to attempt, what counts as a failure, how the
 * result reads — lives here, where it is testable without either.
 */

/*
 * Type-only, and deliberately so: `tsx` does not resolve the workspace path
 * aliases at runtime, but `tsc` does, so a type import costs nothing to run and
 * still ties this file to the product's own vocabulary.
 */
import type { ColorMode } from '@sysdesign/contracts';

export type RenderKind = 'story' | 'docs';

/** One entry of Storybook's `index.json`, narrowed to what the gate reads. */
export interface CatalogEntry {
  id: string;
  title: string;
  name: string;
  type?: string;
}

export interface RenderTarget {
  id: string;
  title: string;
  name: string;
  kind: RenderKind;
  mode: ColorMode;
}

export interface MountState {
  errorDisplay: boolean;
  noPreview: boolean;
  children: number;
  height: number;
  errorText: string | null;
  /**
   * `data-color-mode` on the preview's `<html>`, stamped by `ThemeRoot`. The
   * toolbar globals (`colorMode` / `accent` / `motion`) drive the same
   * appearance settings the app stores, so a story that mounted without the
   * attribute rendered outside the theme — every token read a default.
   */
  colorModeAttr: string | null;
}

export interface ConsoleMessage {
  kind: 'error' | 'warning' | 'pageerror';
  text: string;
}

export interface Violation {
  id: string;
  impact: string | null;
  help: string;
  count: number;
  target: string;
  sample: string;
}

export interface RenderResult extends RenderTarget {
  /** Set when the page never got far enough to inspect. */
  fatal?: string;
  mount?: MountState;
  noise: ConsoleMessage[];
  violations: Violation[];
}

/**
 * The colour modes the gate renders, as a `Record` rather than an array so that
 * adding a `ColorMode` to the contract fails to compile until someone decides
 * here whether it is worth the extra CI minutes. Silent coverage gaps are the
 * thing this file exists to prevent.
 */
const MODE_COVERAGE: Record<ColorMode, boolean> = { light: true, dark: true };

export const RENDER_MODES: readonly ColorMode[] = (
  Object.keys(MODE_COVERAGE) as ColorMode[]
).filter((mode) => MODE_COVERAGE[mode]);

/**
 * Console output the gate tolerates.
 *
 * Deny by default: the list names dev-server chatter that says nothing about
 * the component under test, and nothing else. Every entry is a pattern rather
 * than a flag so the allowance is as narrow as the message it excuses —
 * a warning that merely *contains* familiar words still fails.
 */
const IGNORED_NOISE: readonly RegExp[] = [
  /Download the React DevTools/,
  /\[vite\] (?:connecting|connected)/,
  /websocket connection.*(?:closed|lost)/i,
];

export const isIgnorableNoise = (message: ConsoleMessage): boolean =>
  IGNORED_NOISE.some((pattern) => pattern.test(message.text));

/** The messages that count against a render. */
export const relevantNoise = (result: RenderResult): ConsoleMessage[] =>
  result.noise.filter((message) => !isIgnorableNoise(message));

/**
 * Stories render in every covered mode; a docs page renders once.
 *
 * A docs page embeds the very stories that were already rendered on their own,
 * so a second colour pass re-tests the same components to find the same
 * contrast problems. What it uniquely proves — that the docblocks and the
 * generated props table still build — is mode-independent.
 */
export function planRenders(entries: readonly CatalogEntry[]): RenderTarget[] {
  const [primary] = RENDER_MODES;

  return entries.flatMap(({ id, title, name, type }) => {
    const kind: RenderKind = type === 'docs' ? 'docs' : 'story';
    const modes = kind === 'docs' ? [primary] : RENDER_MODES;

    return modes.map((mode) => ({ id, title, name, kind, mode }));
  });
}

export type Verdict = 'ok' | 'crashed' | 'blank' | 'unthemed' | 'noisy' | 'inaccessible';

/**
 * Ordered, first match wins, so the reported reason is the earliest thing that
 * went wrong rather than a downstream symptom: a page that never mounted will
 * also be silent and violation-free, and reporting it as "accessible" would be
 * true and useless.
 *
 * The theme check applies to stories only. A docs page is mostly Storybook's
 * own chrome, and it embeds stories that were already themed-and-checked on
 * their own renders.
 */
/**
 * Stories whose entire point is to render nothing visible. LiveRegion is an
 * aria-live announcer using the visually-hidden clip pattern — a zero-height
 * mount is its correct behaviour, not a broken one. Narrow by id prefix so a
 * genuinely broken sibling story still fails.
 */
const INTENTIONALLY_INVISIBLE: readonly RegExp[] = [/^design-system-primitives-liveregion--/];

export const isIntentionallyInvisible = (id: string): boolean =>
  INTENTIONALLY_INVISIBLE.some((pattern) => pattern.test(id));

export function classify(result: RenderResult): Verdict {
  if (result.fatal !== undefined || result.mount === undefined) return 'crashed';
  if (result.mount.errorDisplay || result.mount.noPreview) return 'crashed';
  if (
    (result.mount.children === 0 || result.mount.height === 0) &&
    !isIntentionallyInvisible(result.id)
  ) {
    return 'blank';
  }
  if (result.kind === 'story' && result.mount.colorModeAttr !== result.mode) return 'unthemed';
  if (relevantNoise(result).length > 0) return 'noisy';
  if (result.violations.length > 0) return 'inaccessible';
  return 'ok';
}

const FAILING: readonly Verdict[] = ['crashed', 'blank', 'unthemed', 'noisy', 'inaccessible'];

export const isFailure = (verdict: Verdict): boolean => FAILING.includes(verdict);

const label = (target: RenderTarget) => `${target.id} [${target.mode}]`;

/** Items by key; every group holds at least the item that opened it. */
function group<T>(items: readonly T[], key: (item: T) => string): Map<string, [T, ...T[]]> {
  const out = new Map<string, [T, ...T[]]>();
  for (const item of items) {
    const existing = out.get(key(item));
    if (existing) existing.push(item);
    else out.set(key(item), [item]);
  }
  return out;
}

export interface Summary {
  lines: string[];
  failures: number;
}

/**
 * Groups by cause rather than listing per render: one leaked prop shows up on
 * every story of a component, and forty repetitions of the same warning buries
 * the one that is different.
 */
export function summarise(results: readonly RenderResult[]): Summary {
  const verdicts = results.map((result) => ({ result, verdict: classify(result) }));
  const of = (verdict: Verdict) => verdicts.filter((entry) => entry.verdict === verdict);
  const failures = verdicts.filter((entry) => isFailure(entry.verdict)).length;

  const stories = results.filter((result) => result.kind === 'story').length;
  const docs = results.filter((result) => result.kind === 'docs').length;

  const lines = [
    `${results.length} renders — ${stories} story (${RENDER_MODES.join(' + ')}), ${docs} docs (${RENDER_MODES[0]} only)`,
    '',
    `  crashed       ${of('crashed').length}`,
    `  blank         ${of('blank').length}`,
    `  unthemed      ${of('unthemed').length}`,
    `  noisy         ${of('noisy').length}`,
    `  inaccessible  ${of('inaccessible').length}`,
    `  ok            ${of('ok').length}`,
  ];

  for (const { result, verdict } of [...of('crashed'), ...of('blank')]) {
    lines.push('', `${verdict.toUpperCase()} ${label(result)}`);
    if (result.fatal !== undefined) lines.push(`  ${result.fatal}`);
    if (result.mount?.errorText) lines.push(`  ${result.mount.errorText}`);
  }

  for (const { result } of of('unthemed')) {
    lines.push(
      '',
      `UNTHEMED ${label(result)}`,
      `  data-color-mode="${result.mount?.colorModeAttr ?? ''}" on <html>, expected "${result.mode}" — the story rendered outside ThemeRoot`,
    );
  }

  const noise = of('noisy').flatMap(({ result }) =>
    relevantNoise(result).map((message) => ({ message, result })),
  );
  const byMessage = group(noise, (entry) => `${entry.message.kind}: ${entry.message.text}`);
  if (byMessage.size > 0) {
    lines.push('', `--- console (${byMessage.size} distinct) ---`);
    for (const [message, hits] of byMessage) {
      lines.push('', `[${hits.length}] ${message}`);
      lines.push(
        `      ${hits
          .slice(0, 4)
          .map((hit) => label(hit.result))
          .join(', ')}`,
      );
    }
  }

  const violations = of('inaccessible').flatMap(({ result }) =>
    result.violations.map((violation) => ({ violation, result })),
  );
  const byRule = group(violations, (entry) => entry.violation.id);
  if (byRule.size > 0) {
    lines.push('', `--- axe (${byRule.size} distinct rules, stories only) ---`);
    for (const [rule, hits] of byRule) {
      const first = hits[0].violation;
      lines.push('', `[${hits.length}] ${rule} (${first.impact ?? 'unknown'}) — ${first.help}`);
      lines.push(`      target: ${first.target}`);
      lines.push(`      ${first.sample}`);
      lines.push(
        `      ${hits
          .slice(0, 4)
          .map((hit) => label(hit.result))
          .join(', ')}`,
      );
    }
  }

  lines.push('', failures === 0 ? 'PASS' : `FAIL — ${failures} of ${results.length} renders`);
  return { lines, failures };
}
