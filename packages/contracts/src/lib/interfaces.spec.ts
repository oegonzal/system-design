import { describe, expect, it } from 'vitest';

import { NODE_KINDS } from './canvas';
import { INTERFACE_CAPABILITIES, canDeclareOperations, resolveInterfaceOwner } from './interfaces';

/**
 * Structural sanity for the capability table (`satisfies` proves coverage at
 * compile time; these pin the semantic invariant that role and operation
 * kinds agree) plus the ownership rule's decision table.
 */
describe('interface capabilities', () => {
  it('gives every api/channel kind a non-empty operation vocabulary and an editor label', () => {
    for (const kind of NODE_KINDS) {
      const capability = INTERFACE_CAPABILITIES[kind];
      if (capability.role !== 'api' && capability.role !== 'channel') continue;
      expect(
        capability.operationKinds.length,
        `${kind} declares no operation kinds`,
      ).toBeGreaterThan(0);
      expect(capability.editorLabel, `${kind} has no editor label`).toBeTruthy();
      expect(canDeclareOperations(kind)).toBe(true);
    }
  });

  it('keeps storage/edge-infra/passive kinds operation-free with no editor label', () => {
    for (const kind of NODE_KINDS) {
      const capability = INTERFACE_CAPABILITIES[kind];
      if (capability.role === 'api' || capability.role === 'channel') continue;
      expect(capability.operationKinds, `${kind} should declare nothing`).toHaveLength(0);
      expect(capability.editorLabel, `${kind} should hide the editor section`).toBeNull();
      expect(canDeclareOperations(kind)).toBe(false);
    }
  });
});

describe('resolveInterfaceOwner', () => {
  it('resolves a call edge to the callee (target)', () => {
    expect(resolveInterfaceOwner('gateway', 'service')).toBe('target');
  });

  it('resolves a produce edge into a queue to the channel (target)', () => {
    expect(resolveInterfaceOwner('service', 'queue')).toBe('target');
  });

  it('resolves a consume edge out of a queue to the channel (source)', () => {
    expect(resolveInterfaceOwner('queue', 'worker')).toBe('source');
  });

  it('yields null when neither end has an operation vocabulary', () => {
    expect(resolveInterfaceOwner('service', 'database')).toBeNull();
  });

  it('prefers the target when both ends are channels', () => {
    expect(resolveInterfaceOwner('queue', 'event-stream')).toBe('target');
  });
});
