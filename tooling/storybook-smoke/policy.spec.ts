import { describe, expect, it } from 'vitest';

import {
  RENDER_MODES,
  classify,
  isFailure,
  isIgnorableNoise,
  planRenders,
  summarise,
  type CatalogEntry,
  type MountState,
  type RenderResult,
} from './policy';

const story = (id: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id,
  title: 'Design System/Primitives/Button',
  name: 'Primary',
  type: 'story',
  ...extra,
});

const mountedIn = (mode: string): MountState => ({
  errorDisplay: false,
  noPreview: false,
  children: 1,
  height: 40,
  errorText: null,
  colorModeAttr: mode,
});

const result = (over: Partial<RenderResult> = {}): RenderResult => ({
  id: 'design-system-primitives-button--primary',
  title: 'Design System/Primitives/Button',
  name: 'Primary',
  kind: 'story',
  mode: over.mode ?? 'light',
  mount: mountedIn(over.mode ?? 'light'),
  noise: [],
  violations: [],
  ...over,
});

const violation = (id: string) => ({
  id,
  impact: 'serious',
  help: 'Elements must meet minimum color contrast ratio thresholds',
  count: 1,
  target: 'button[type="button"]',
  sample: 'insufficient color contrast of 4.45',
});

describe('planRenders', () => {
  it('renders a story once per covered colour mode', () => {
    expect(planRenders([story('a')])).toEqual(
      RENDER_MODES.map((mode) => ({
        id: 'a',
        title: 'Design System/Primitives/Button',
        name: 'Primary',
        kind: 'story',
        mode,
      })),
    );
  });

  it('renders a docs page once, in the primary mode only', () => {
    const planned = planRenders([story('a--docs', { type: 'docs' })]);

    expect(planned).toHaveLength(1);
    expect(planned[0]!.kind).toBe('docs');
    expect(planned[0]!.mode).toBe(RENDER_MODES[0]);
  });

  it('treats an entry with no type as a story rather than skipping it', () => {
    const planned = planRenders([story('a', { type: undefined })]);

    expect(planned).toHaveLength(RENDER_MODES.length);
    expect(planned.every((target) => target.kind === 'story')).toBe(true);
  });

  it('covers both colour modes, because a contrast defect can live in only one', () => {
    expect([...RENDER_MODES].sort()).toEqual(['dark', 'light']);
  });
});

describe('classify', () => {
  it('passes a render that mounted themed, said nothing and tripped nothing', () => {
    expect(classify(result())).toBe('ok');
  });

  it.each([
    ['a page that never loaded', { fatal: 'Timeout 30000ms exceeded', mount: undefined }],
    ['the Storybook error overlay', { mount: { ...mountedIn('light'), errorDisplay: true } }],
    ['the no-preview state', { mount: { ...mountedIn('light'), noPreview: true } }],
  ])('reports %s as crashed', (_label, over) => {
    expect(classify(result(over as Partial<RenderResult>))).toBe('crashed');
  });

  it('reports an empty root as blank', () => {
    expect(classify(result({ mount: { ...mountedIn('light'), children: 0 } }))).toBe('blank');
  });

  it('reports a mounted-but-zero-height root as blank', () => {
    expect(classify(result({ mount: { ...mountedIn('light'), height: 0 } }))).toBe('blank');
  });

  it('exempts intentionally invisible stories (aria-live announcers) from the blank verdict', () => {
    const invisible = result({
      id: 'design-system-primitives-liveregion--polite',
      mount: { ...mountedIn('light'), height: 0, children: 0 },
    });
    expect(classify(invisible)).toBe('ok');
  });

  /**
   * `data-color-mode` on the preview's <html> is ThemeRoot's receipt that the
   * requested mode actually applied. A dark render still stamped light tested
   * the wrong palette twice and the dark one never.
   */
  it('reports a story whose html was not stamped with the requested mode as unthemed', () => {
    const stale = result({ mode: 'dark', mount: mountedIn('light') });
    expect(classify(stale)).toBe('unthemed');
    expect(isFailure('unthemed')).toBe(true);
  });

  it('reports a story with no stamp at all as unthemed — it mounted outside ThemeRoot', () => {
    expect(classify(result({ mount: { ...mountedIn('light'), colorModeAttr: null } }))).toBe(
      'unthemed',
    );
  });

  it('does not apply the theme check to docs pages, which are Storybook chrome', () => {
    const docs = result({
      kind: 'docs',
      mount: { ...mountedIn('light'), colorModeAttr: null },
    });
    expect(classify(docs)).toBe('ok');
  });

  it('reports a console warning as noisy — a leaked style prop only warns', () => {
    const warned = result({
      noise: [
        { kind: 'warning', text: 'React does not recognize the `$index` prop on a DOM element.' },
      ],
    });

    expect(classify(warned)).toBe('noisy');
    expect(isFailure(classify(warned))).toBe(true);
  });

  /** Deny by default; the allowlist names dev-server chatter and nothing else. */
  it('ignores dev-server chatter the allowlist names', () => {
    const chatty = result({
      noise: [
        { kind: 'warning', text: 'Download the React DevTools for a better experience' },
        { kind: 'warning', text: '[vite] connected.' },
      ],
    });
    expect(classify(chatty)).toBe('ok');
  });

  it('does not excuse a message that merely contains familiar words', () => {
    expect(
      isIgnorableNoise({ kind: 'warning', text: 'failed to load React DevTools panel data' }),
    ).toBe(false);
  });

  it('reports an axe violation as inaccessible', () => {
    expect(classify(result({ violations: [violation('color-contrast')] }))).toBe('inaccessible');
  });

  it('names the earliest cause, not a downstream symptom', () => {
    /* A page that never mounted is also silent and violation-free. */
    const crashed = result({ fatal: 'boom', mount: undefined, noise: [], violations: [] });

    expect(classify(crashed)).toBe('crashed');
  });
});

describe('summarise', () => {
  it('passes a clean run and reports no failures', () => {
    const { lines, failures } = summarise([result(), result({ mode: 'dark' })]);

    expect(failures).toBe(0);
    expect(lines.at(-1)).toBe('PASS');
  });

  it('states the coverage it actually ran, so a docs gap is not read as full cover', () => {
    const { lines } = summarise([result(), result({ kind: 'docs', id: 'x--docs' })]);

    expect(lines[0]).toContain('1 story');
    expect(lines[0]).toContain('1 docs');
    expect(lines[0]).toContain(`${RENDER_MODES[0]} only`);
  });

  it('fails the run when a single render in a single mode is inaccessible', () => {
    /*
     * The scenario the two-mode pass exists for: a component that clears
     * contrast in light mode and misses it in dark. A light-only gate would
     * pass it.
     */
    const { lines, failures } = summarise([
      result(),
      result({ mode: 'dark', violations: [violation('color-contrast')] }),
    ]);

    expect(failures).toBe(1);
    expect(lines.at(-1)).toBe('FAIL — 1 of 2 renders');
    expect(lines.join('\n')).toContain('color-contrast');
  });

  it('names the unthemed render and both modes involved', () => {
    const { lines, failures } = summarise([result({ mode: 'dark', mount: mountedIn('light') })]);
    const text = lines.join('\n');

    expect(failures).toBe(1);
    expect(text).toContain('UNTHEMED');
    expect(text).toContain('expected "dark"');
  });

  it('groups one repeated console message instead of printing it per render', () => {
    const noise = [
      { kind: 'warning' as const, text: 'Each child in a list should have a unique "key" prop.' },
    ];
    const { lines } = summarise([
      result({ id: 'a', noise }),
      result({ id: 'b', noise }),
      result({ id: 'c', noise }),
    ]);

    expect(lines.join('\n')).toContain('--- console (1 distinct) ---');
    expect(lines.join('\n')).toContain('[3] warning: Each child in a list');
  });

  it('groups axe findings by rule and keeps a worked example', () => {
    const { lines } = summarise([
      result({ id: 'a', violations: [violation('color-contrast')] }),
      result({
        id: 'b',
        violations: [violation('color-contrast'), violation('aria-required-children')],
      }),
    ]);
    const text = lines.join('\n');

    expect(text).toContain('--- axe (2 distinct rules, stories only) ---');
    expect(text).toContain('[2] color-contrast');
    expect(text).toContain('button[type="button"]');
  });

  it('surfaces the crash message for a render that never loaded', () => {
    const { lines } = summarise([result({ fatal: 'Timeout 45000ms exceeded', mount: undefined })]);

    expect(lines.join('\n')).toContain('Timeout 45000ms exceeded');
  });
});
