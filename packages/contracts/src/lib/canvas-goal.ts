import { renderLifecycleSection } from './lifecycle';
import { platformCatalogue, type PlatformId } from './platforms';
import { renderPlatformSection } from './platforms/render';
import { withinBudget } from './quality-loop/goal-index';

/** A prompt as the canvas pipeline is asked to grade against it: its text and the platform it declares, or none. */
export interface CanvasGoalSource {
  readonly markdown: string;
  readonly platform: PlatformId | null;
}

/**
 * The goal of a canvas run: the prompt's markdown, verbatim, closed by the
 * declared platform's catalogue when the prompt declares one and, on every
 * prompt, by the request lifecycle — where a request enters, the stages its
 * way in shows and what serves each, and where it comes to rest — so every
 * lens reads the same declared facts the canvas showed the author. Past the
 * engine's budget the composer refuses rather than let a stage read a
 * clipped goal. A run is keyed by its goal wherever one is scripted, and the
 * studio's e2e scripts a run by this same composition.
 */
export function renderCanvasGoal({ markdown, platform }: CanvasGoalSource): string {
  const catalogue = platform === null ? null : platformCatalogue(platform);
  const sections = [
    markdown.trimEnd(),
    catalogue === null ? null : renderPlatformSection(catalogue),
    renderLifecycleSection(catalogue),
  ];
  return withinBudget(
    sections.filter((section): section is string => section !== null).join('\n\n'),
  );
}
