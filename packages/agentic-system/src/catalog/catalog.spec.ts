import { OPERATION_KINDS } from '@sysdesign/contracts';

import { componentsByMemoryType, componentsInLayer, findComponent } from './index';
import { CROSS_CUTTING, MEMORY_COMPONENTS } from './components';
import type { CatalogComponent } from './catalog';
import { MEMORY_LAYERS } from './catalog';

/** The components widened to their interface, so optional fields read on the union. */
const components: readonly CatalogComponent[] = MEMORY_COMPONENTS;

describe('the agentic-memory layer catalog', () => {
  it('[AGS-1] places every component in a declared layer', () => {
    for (const component of components) {
      expect(MEMORY_LAYERS as readonly string[], component.id).toContain(component.layer);
    }
  });

  it('[AGS-1] gives every component a unique id and well-formed operations', () => {
    const ids = components.map((component) => component.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const component of components) {
      expect(component.label.length, component.id).toBeGreaterThan(0);
      expect(component.apiInterface.length, component.id).toBeGreaterThan(0);
      expect(component.contributes.length, component.id).toBeGreaterThan(0);
      expect(component.operations.length, component.id).toBeGreaterThan(0);
      const names = component.operations.map((operation) => operation.name);
      expect(new Set(names).size, component.id).toBe(names.length);
      for (const operation of component.operations) {
        expect(OPERATION_KINDS as readonly string[], `${component.id}.${operation.name}`).toContain(
          operation.kind,
        );
        expect(operation.notes.length).toBeGreaterThan(0);
      }
      for (const id of component.alternatives ?? []) expect(typeof id).toBe('string');
    }
  });

  it('[AGS-1] names the stack a memory design must be able to reach for', () => {
    // A content guard: the catalog may grow, but it may not silently drop a
    // component the brief and the lenses expect to exist.
    for (const id of [
      'postgres',
      'pgvector',
      'qdrant',
      'temporal',
      'langgraph',
      'redis-cache',
      's3',
      'mem0',
      'zep',
      'mcp',
      'custom-memory-service',
    ]) {
      expect(findComponent(id), id).not.toBeNull();
    }
    expect(CROSS_CUTTING.map((control) => control.id)).toContain('zod');
  });

  it('[AGS-1] every memory type has a store to recall from', () => {
    // Semantic recall needs a vector store; working memory a cache; episodic
    // and relational a durable store — so the catalog serves each memory type.
    expect(componentsByMemoryType('semantic').length).toBeGreaterThan(0);
    expect(componentsByMemoryType('working').length).toBeGreaterThan(0);
    expect(componentsByMemoryType('relational').length).toBeGreaterThan(0);
    expect(componentsByMemoryType('episodic').length).toBeGreaterThan(0);
    // The two vector stores both serve semantic recall.
    expect(
      componentsByMemoryType('semantic')
        .map((component) => component.id)
        .sort(),
    ).toEqual(expect.arrayContaining(['pgvector', 'qdrant']));
    // The vector-search layer groups the two stores a design chooses between.
    expect(
      componentsInLayer('vector-search')
        .map((component) => component.id)
        .sort(),
    ).toEqual(['pgvector', 'qdrant']);
  });
});
