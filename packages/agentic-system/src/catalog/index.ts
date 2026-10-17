/**
 * The catalog layer's door: the component data, its types, and the pure
 * lookups a brief composer or a node annotator reads it through. No other
 * layer reaches the component list except here.
 */
import type { RegisterKind } from '@sysdesign/contracts';

import type { CatalogComponent, MemoryLayer } from './catalog';
import { MEMORY_COMPONENTS } from './components';

export type {
  CatalogComponent,
  CatalogOperation,
  CrossCuttingControl,
  MemoryLayer,
} from './catalog';
export { MEMORY_LAYERS } from './catalog';
export { MEMORY_COMPONENTS, CROSS_CUTTING } from './components';

/** The components widened to their interface, so the optional fields read on the union. */
const components: readonly CatalogComponent[] = MEMORY_COMPONENTS;

/** The component with this id, or null — ids are the stable key a brief references. */
export const findComponent = (id: string): CatalogComponent | null =>
  components.find((component) => component.id === id) ?? null;

/** Every component in one layer of the architecture, in declared order. */
export const componentsInLayer = (layer: MemoryLayer): CatalogComponent[] =>
  components.filter((component) => component.layer === layer);

/** Every store that serves a given memory type — which component a design recalls that type from. */
export const componentsByMemoryType = (type: RegisterKind): CatalogComponent[] =>
  components.filter((component) => component.memoryTypes?.includes(type) ?? false);
