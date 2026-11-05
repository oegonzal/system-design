import { platformCatalogue, type PlatformId } from './platforms';
import { withinBudget } from './quality-loop/goal-index';
import { renderPlatformSection } from './platforms/render';

/** A prompt as the canvas pipeline is asked to grade against it: its text and the platform it declares, or none. */
export interface CanvasGoalSource {
  readonly markdown: string;
  readonly platform: PlatformId | null;
}

/**
 * The goal of a canvas run: the prompt's markdown, verbatim, closed by the
 * declared platform's catalogue when the prompt declares one — the same
 * services, roles and knobs the palette offered the author, so every lens
 * judges the design against facts it can cite. A prompt with no platform
 * grades against its text alone, as every prompt did before platforms. The
 * studio composes it, since the loop reads a goal and never a prompt row;
 * past the engine's budget the composer refuses rather than let a stage read
 * a clipped goal. A neutral prompt's goal is its markdown byte for byte — a
 * run is keyed by its goal wherever one is scripted or recalled.
 */
export function renderCanvasGoal({ markdown, platform }: CanvasGoalSource): string {
  if (platform === null) return withinBudget(markdown);
  const section = renderPlatformSection(platformCatalogue(platform));
  return withinBudget(`${markdown.trimEnd()}\n\n${section}`);
}
