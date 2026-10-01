import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDocumentTitle } from './use-document-title';

describe('useDocumentTitle', () => {
  it('names the document once the title is known, and leaves it standing while it is not', () => {
    document.title = 'Prompt · App';
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: null as string | null },
    });
    expect(document.title).toBe('Prompt · App');

    rerender({ title: 'Order history · App' });
    expect(document.title).toBe('Order history · App');
  });
});
