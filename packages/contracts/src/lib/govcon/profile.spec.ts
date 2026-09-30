import { storedProfileOf } from './fixtures';
import { documentOf } from './profile';

describe('govcon profile documents', () => {
  it('projects a stored profile onto the document a save sends, without what the store added', () => {
    const stored = storedProfileOf({ id: 'enfav', isDefault: true });
    const document = documentOf(stored);
    expect(document).not.toHaveProperty('isDefault');
    expect(document).not.toHaveProperty('createdAt');
    expect(document).not.toHaveProperty('updatedAt');
    expect(document.id).toBe('enfav');
    expect(document.scoring).toEqual(stored.scoring);
  });
});
