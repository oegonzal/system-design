import {
  ALL_PLATFORM_SERVICE_IDS,
  NODE_KIND_CATEGORIES,
  NODE_KINDS,
  PLATFORM_IDS,
  platformCatalogue,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { isPaletteBlock } from '../platform-services';
import { matchesEntry, paletteSections } from './palette-entries';

const aws = platformCatalogue(PLATFORM_IDS[0]);

describe('paletteSections', () => {
  it('[UX-1] [UX-4] with no platform, shelves exactly the contract’s role categories, in order, one entry per kind', () => {
    const sections = paletteSections(null, '');
    expect(sections.map((section) => section.id)).toEqual(
      NODE_KIND_CATEGORIES.map((category) => `blocks-category-${category.id}`),
    );
    expect(sections.flatMap((section) => section.entries.map((entry) => entry.block))).toEqual([
      ...NODE_KINDS,
    ]);
    for (const section of sections) expect(section.swatch).not.toBeNull();
  });

  it('[UX-31] shelves the declared platform’s categories first, headed by the platform, one entry per service wearing its first role, then the roles as always', () => {
    const sections = paletteSections(aws, '');
    const platform = sections.slice(0, aws.categories.length);
    expect(platform.map((section) => section.label)).toEqual(
      aws.categories.map((category) => `${aws.label} · ${category.label}`),
    );
    for (const section of platform) expect(section.swatch).toBeNull();
    const services = platform.flatMap((section) => section.entries);
    expect(services.map((entry) => entry.block)).toEqual([...ALL_PLATFORM_SERVICE_IDS]);
    for (const entry of services) {
      const service = aws.services.find((candidate) => candidate.id === entry.block);
      expect(entry.kind).toBe(service?.roles[0]);
      expect(entry.label).toBe(service?.label);
      expect(entry.hint).toBe(service?.what);
      expect(entry.testId).toBe(`palette-service-${entry.block}`);
    }
    expect(sections.slice(aws.categories.length).map((section) => section.id)).toEqual(
      NODE_KIND_CATEGORIES.map((category) => `blocks-category-${category.id}`),
    );
  });

  it('[UX-4] a filter finds a service by any of its declared aliases and drops the shelves it empties', () => {
    // Data-driven: the first service with an alias its label does not spell.
    const aliased = aws.services.find((service) =>
      service.aliases.some((alias) => !service.label.toLowerCase().includes(alias.toLowerCase())),
    );
    if (aliased === undefined) throw new Error('no service has an alias beyond its label');
    const alias = aliased.aliases.find(
      (candidate) => !aliased.label.toLowerCase().includes(candidate.toLowerCase()),
    );
    if (alias === undefined) throw new Error('unreachable');
    const sections = paletteSections(aws, alias.toLowerCase());
    const blocks = sections.flatMap((section) => section.entries.map((entry) => entry.block));
    expect(blocks).toContain(aliased.id);
    for (const section of sections) expect(section.entries.length).toBeGreaterThan(0);
  });

  it('[UX-4] matches an entry by its words or its shelf, never by nothing', () => {
    const [section] = paletteSections(null, '');
    const [entry] = section.entries;
    expect(matchesEntry(entry, section.label, '')).toBe(true);
    expect(matchesEntry(entry, section.label, entry.label.toLowerCase())).toBe(true);
    expect(matchesEntry(entry, section.label, section.label.toLowerCase())).toBe(true);
    expect(matchesEntry(entry, section.label, 'zzz-not-a-block')).toBe(false);
  });
});

describe('isPaletteBlock', () => {
  it('[UX-31] reads a role and a service id as blocks, and nothing else — the two vocabularies never share an id', () => {
    for (const kind of NODE_KINDS) expect(isPaletteBlock(kind)).toBe(true);
    for (const id of ALL_PLATFORM_SERVICE_IDS) {
      expect(isPaletteBlock(id)).toBe(true);
      expect((NODE_KINDS as readonly string[]).includes(id)).toBe(false);
    }
    expect(isPaletteBlock('mainframe')).toBe(false);
  });
});
