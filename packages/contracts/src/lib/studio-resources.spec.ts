import { describe, expect, it } from 'vitest';

import { missingResource, STUDIO_RESOURCES } from './studio-resources';

describe('missingResource', () => {
  it('reads what a 404 body says is missing, and nothing from any other body', () => {
    for (const missing of STUDIO_RESOURCES) {
      expect(missingResource({ statusCode: 404, message: 'gone', missing })).toBe(missing);
    }
    // The framework's own 404 (no such route), an unknown kind, and a body that is no object.
    expect(missingResource({ statusCode: 404, message: 'Cannot GET /nowhere' })).toBeNull();
    expect(missingResource({ statusCode: 404, missing: 'teapot' })).toBeNull();
    expect(missingResource(undefined)).toBeNull();
    expect(missingResource('Not Found')).toBeNull();
  });
});
