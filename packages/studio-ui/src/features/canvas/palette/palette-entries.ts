import {
  DEFAULT_NODE_LABELS,
  isPlatformServiceId,
  kindsInCategory,
  NODE_KIND_CATEGORIES,
  NODE_KIND_GUIDE,
  servicesInCategory,
  type NodeKind,
  type NodeKindCategoryId,
  type PlatformCatalogue,
  type PlatformService,
} from '@sysdesign/contracts';

import type { PaletteBlock } from '../platform-services';

/** One entry of the palette: what it adds, the role whose glyph and colour it wears, and the words a filter finds it by. */
export interface PaletteEntry {
  block: PaletteBlock;
  kind: NodeKind;
  label: string;
  /** The hover text: what the block is. */
  hint: string;
  testId: string;
  searchWords: readonly string[];
}

/** One shelf: a platform's category (no swatch — the entries wear their roles' colours) or a role category. */
export interface PaletteSection {
  id: string;
  label: string;
  swatch: NodeKindCategoryId | null;
  entries: PaletteEntry[];
}

const roleEntry = (kind: NodeKind): PaletteEntry => ({
  block: kind,
  kind,
  label: DEFAULT_NODE_LABELS[kind],
  hint: NODE_KIND_GUIDE[kind].what,
  testId: `palette-${kind}`,
  searchWords: [DEFAULT_NODE_LABELS[kind], kind],
});

const serviceEntry = (service: PlatformService): PaletteEntry => {
  // A catalogue's ids are the schema's by construction; the guard says so to the compiler.
  if (!isPlatformServiceId(service.id))
    throw new Error(`${service.id} is no service the schema admits`);
  const [role] = service.roles;
  return {
    block: service.id,
    kind: role,
    label: service.label,
    hint: service.what,
    testId: `palette-service-${service.id}`,
    searchWords: [service.label, service.id, ...service.aliases, DEFAULT_NODE_LABELS[role], role],
  };
};

/** Case-insensitive substring match on the entry's own words or its shelf's label; an empty query matches all. */
export function matchesEntry(entry: PaletteEntry, sectionLabel: string, query: string): boolean {
  if (query === '') return true;
  return [...entry.searchWords, sectionLabel].some((word) => word.toLowerCase().includes(query));
}

/**
 * The palette's shelves, filtered: the declared platform's categories first,
 * each headed by the platform so a shelf name shared with a role category
 * reads as its own, then the contract's role categories as always. A shelf
 * nothing matches is left out rather than shown empty.
 */
export function paletteSections(
  catalogue: PlatformCatalogue | null,
  query: string,
): PaletteSection[] {
  const platform: PaletteSection[] =
    catalogue === null
      ? []
      : catalogue.categories.map((category) => ({
          id: `blocks-platform-${catalogue.id}-${category.id}`,
          label: `${catalogue.label} · ${category.label}`,
          swatch: null,
          entries: servicesInCategory(catalogue, category.id).map(serviceEntry),
        }));
  const roles: PaletteSection[] = NODE_KIND_CATEGORIES.map((category) => ({
    id: `blocks-category-${category.id}`,
    label: category.label,
    swatch: category.id,
    entries: kindsInCategory(category.id).map(roleEntry),
  }));
  return [...platform, ...roles]
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => matchesEntry(entry, section.label, query)),
    }))
    .filter((section) => section.entries.length > 0);
}
