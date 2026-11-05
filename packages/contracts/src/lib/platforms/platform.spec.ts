import { describe, expect, it } from 'vitest';

import { DEFAULT_NODE_LABELS, NODE_KINDS } from '../canvas';
import {
  ALL_PLATFORM_SERVICE_IDS,
  isPlatformServiceId,
  PLATFORM_CATALOGUES,
  platformCatalogue,
  platformServiceById,
  servicesInCategory,
} from './catalogue';
import { PLATFORM_SECTION_HEADING, renderPlatformSection } from './render';
import { isPlatformId, PLATFORM_IDS } from './service';

/** The guide-line bound a node kind's prose is held to; a service teaches at the same length. */
const MAX_LINE = 160;

const every = PLATFORM_IDS.map((id) => platformCatalogue(id));

describe('the platform catalogues', () => {
  it('[UX-31] declare every platform once, each service under a declared category, no category empty', () => {
    expect(Object.keys(PLATFORM_CATALOGUES)).toEqual([...PLATFORM_IDS]);
    for (const catalogue of every) {
      expect(isPlatformId(catalogue.id)).toBe(true);
      const categories = new Set<string>(catalogue.categories.map((category) => category.id));
      expect(categories.size).toBe(catalogue.categories.length);
      for (const service of catalogue.services) {
        expect(categories.has(service.category), `${service.id} sits on no declared shelf`).toBe(
          true,
        );
      }
      for (const category of catalogue.categories) {
        expect(
          servicesInCategory(catalogue, category.id).length,
          `${category.id} holds no service`,
        ).toBeGreaterThan(0);
      }
    }
    expect(isPlatformId('gcp')).toBe(false);
  });

  it('[UX-31] [UX-7] teach every service: roles that are kinds, bounded prose, the knobs an interviewer asks about, words a search finds it by', () => {
    for (const service of every.flatMap((catalogue) => catalogue.services)) {
      for (const role of service.roles) expect(NODE_KINDS).toContain(role);
      expect(new Set(service.roles).size).toBe(service.roles.length);
      expect(service.what.trim().length).toBeGreaterThan(0);
      expect(service.what.length).toBeLessThanOrEqual(MAX_LINE);
      expect(service.whenToUse.trim().length).toBeGreaterThan(0);
      expect(service.whenToUse.length).toBeLessThanOrEqual(MAX_LINE);
      expect(service.knobs.length).toBeGreaterThanOrEqual(5);
      expect(service.knobs.length).toBeLessThanOrEqual(9);
      expect(new Set(service.knobs).size).toBe(service.knobs.length);
      expect(service.aliases.length).toBeGreaterThan(0);
      expect(service.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('[UX-31] keep service ids unique across platforms and apart from the kinds, so a palette block is one or the other', () => {
    const ids = every.flatMap((catalogue) => catalogue.services.map((service) => service.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ALL_PLATFORM_SERVICE_IDS]).toEqual(ids);
    for (const id of ids) expect((NODE_KINDS as readonly string[]).includes(id)).toBe(false);
    expect(isPlatformServiceId(ids[0])).toBe(true);
    expect(isPlatformServiceId('queue')).toBe(false);
  });

  it('finds a service and its platform by id through the catalogues, never by the spelling of the id', () => {
    const [first] = platformCatalogue(PLATFORM_IDS[0]).services;
    expect(platformServiceById(first.id)).toEqual({ platformId: PLATFORM_IDS[0], service: first });
    expect(platformServiceById(`${PLATFORM_IDS[0]}.nothing-of-the-kind`)).toBeNull();
    expect(platformServiceById('queue')).toBeNull();
  });
});

describe('renderPlatformSection', () => {
  it('[GEN-7] writes the heading, the framing, one shelf per category and one line per service with its id, roles as names, what it is and its knobs', () => {
    const catalogue = platformCatalogue(PLATFORM_IDS[0]);
    const section = renderPlatformSection(catalogue);
    expect(section.startsWith(`${PLATFORM_SECTION_HEADING}\n\n`)).toBe(true);
    expect(section).toContain(`The design is drawn on ${catalogue.label}.`);
    for (const category of catalogue.categories) {
      expect(section).toContain(`\n### ${category.label}\n`);
    }
    for (const service of catalogue.services) {
      const lines = section.split('\n').filter((line) => line.includes(`\`${service.id}\``));
      expect(lines, `${service.id} is listed once`).toHaveLength(1);
      const [line] = lines;
      expect(line.startsWith(`- \`${service.id}\` — ${service.label} (`)).toBe(true);
      for (const role of service.roles) {
        expect(line).toContain(DEFAULT_NODE_LABELS[role].toLowerCase());
      }
      expect(line).toContain(service.what);
      expect(line).toContain(`Knobs: ${service.knobs.join(', ')}.`);
      expect(line).not.toContain(service.whenToUse);
    }
  });
});
