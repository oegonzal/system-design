import type { AppTheme } from '@sysdesign/design-system';

/**
 * React Flow's chrome, painted from the theme in either mode. These are the
 * variables its stylesheet reads, so the surface, grid, controls, minimap,
 * handles, selection box, connection line and arrowheads follow the design
 * tokens rather than its own light palette (or its dark one, which
 * `colorMode` would otherwise pick). Declared as data: the canvas frame
 * writes every entry, and a spec holds this list against the stylesheet, so
 * a surface the library paints is never left on its default.
 */
export function flowVariables(theme: AppTheme): Record<`--xy-${string}`, string> {
  const { bg, border, text } = theme.color;
  return {
    '--xy-background-color': bg.surface,
    '--xy-background-pattern-color': border.default,
    '--xy-edge-stroke': border.default,
    '--xy-edge-stroke-selected': border.focus,
    '--xy-edge-label-background-color': bg.surface,
    '--xy-edge-label-color': text.secondary,
    '--xy-connectionline-stroke': border.focus,
    '--xy-node-background-color': bg.surface,
    '--xy-node-group-background-color': bg.subtle,
    '--xy-node-color': text.primary,
    '--xy-handle-background-color': border.default,
    '--xy-handle-border-color': bg.surface,
    '--xy-resize-background-color': border.focus,
    // Translucent, so what a selection box is dragged over still shows.
    '--xy-selection-background-color': `color-mix(in srgb, ${bg.selected} 30%, transparent)`,
    '--xy-selection-border': `1px dotted ${border.focus}`,
    '--xy-controls-button-background-color': bg.surface,
    '--xy-controls-button-background-color-hover': bg.subtle,
    '--xy-controls-button-color': text.secondary,
    '--xy-controls-button-color-hover': text.primary,
    '--xy-controls-button-border-color': border.subtle,
    '--xy-controls-box-shadow': theme.shadow.sm,
    '--xy-minimap-background-color': bg.surface,
    '--xy-minimap-node-background-color': bg.subtle,
    // Translucent, so the blocks outside the visible area still show through.
    '--xy-minimap-mask-background-color': `color-mix(in srgb, ${bg.subtle} 70%, transparent)`,
    '--xy-minimap-mask-stroke-color': border.default,
    // Attribution stays (free tier); just keep it readable on our surface.
    '--xy-attribution-background-color': 'transparent',
  };
}

/** The variables as CSS declarations, for the canvas frame's stylesheet. */
export function flowVariableDeclarations(theme: AppTheme): string {
  return Object.entries(flowVariables(theme))
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');
}
