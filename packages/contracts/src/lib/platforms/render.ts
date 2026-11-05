import { DEFAULT_NODE_LABELS } from '../canvas';
import { servicesInCategory } from './catalogue';
import type { PlatformCatalogue } from './service';

export const PLATFORM_SECTION_HEADING = '## Platform';

/**
 * The catalogue as a section of a grading goal, so every lens reads the same
 * declared facts the canvas offered the author: which services exist, which
 * roles each plays, what it is for and which knobs matter. The framing names
 * the two facts a design is held to — a component names the service it is,
 * a hop is an integration the platform offers — and leaves the judgement to
 * the lenses, who know the platform; `whenToUse` and `aliases` are the
 * palette's and stay out of the budget.
 */
export function renderPlatformSection(catalogue: PlatformCatalogue): string {
  const lines = [
    PLATFORM_SECTION_HEADING,
    '',
    `The design is drawn on ${catalogue.label}. A component that is one of the services below names it in \`service\` by the id listed and keeps one of the roles listed for it as its \`kind\`; its knobs are the config keys an interviewer asks about. A hop between two of these services is an integration ${catalogue.label} offers between them; a component the catalogue offers no service for stays a plain role.`,
  ];
  for (const category of catalogue.categories) {
    const services = servicesInCategory(catalogue, category.id);
    if (services.length === 0) continue;
    lines.push('', `### ${category.label}`, '');
    for (const service of services) {
      const roles = service.roles.map((role) => DEFAULT_NODE_LABELS[role].toLowerCase()).join(', ');
      lines.push(
        `- \`${service.id}\` — ${service.label} (${roles}): ${service.what} Knobs: ${service.knobs.join(', ')}.`,
      );
    }
  }
  return lines.join('\n');
}
