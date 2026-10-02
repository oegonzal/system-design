import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { COLOR_MODES, DEFAULT_APPEARANCE_SETTINGS } from '@sysdesign/contracts';
import { createTheme } from '@sysdesign/design-system';
import { describe, expect, it } from 'vitest';

import { flowVariableDeclarations, flowVariables } from './flow-theme';

/** React Flow's own stylesheet: where it declares which variables it reads, and what it falls back to. */
const stylesheet = readFileSync(
  createRequire(import.meta.url).resolve('@xyflow/react/dist/style.css'),
  'utf8',
);

/** Every surface the stylesheet paints from a variable: `--xy-…-background-color-default`, without the suffix. */
const paintedSurfaces = [
  ...new Set(
    [...stylesheet.matchAll(/(--xy-[a-z-]*background-color)-default\b/g)].map((match) => match[1]),
  ),
];

describe('flowVariables', () => {
  it('finds the surfaces React Flow paints — the canvas itself among them', () => {
    // A stylesheet that renamed its variables would otherwise pass vacuously.
    expect(paintedSurfaces).toContain('--xy-background-color');
    expect(paintedSurfaces.length).toBeGreaterThan(5);
  });

  it.each(COLOR_MODES)(
    'gives every surface React Flow paints a theme token in %s mode — none is left on the library’s own colour',
    (colorMode) => {
      const variables = flowVariables(createTheme({ ...DEFAULT_APPEARANCE_SETTINGS, colorMode }));

      expect(paintedSurfaces.filter((name) => !(name in variables))).toEqual([]);
    },
  );

  it.each(COLOR_MODES)(
    'paints the canvas the same surface as its frame in %s mode',
    (colorMode) => {
      const theme = createTheme({ ...DEFAULT_APPEARANCE_SETTINGS, colorMode });

      expect(flowVariables(theme)['--xy-background-color']).toBe(theme.color.bg.surface);
      expect(flowVariables(theme)['--xy-minimap-background-color']).toBe(theme.color.bg.surface);
    },
  );

  it('writes one declaration per variable', () => {
    const theme = createTheme(DEFAULT_APPEARANCE_SETTINGS);
    const declarations = flowVariableDeclarations(theme).split('\n');

    expect(declarations).toHaveLength(Object.keys(flowVariables(theme)).length);
    expect(declarations).toContain(`--xy-background-color: ${theme.color.bg.surface};`);
  });
});
