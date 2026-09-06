import { describe, expect, it } from 'vitest';

import { installDomShims } from './dom-shims';

describe('installDomShims', () => {
  it('gives jsdom the layout and media APIs the components and React Flow reach for', () => {
    installDomShims();

    expect(() => new ResizeObserver(() => undefined).observe(document.body)).not.toThrow();
    expect(window.matchMedia('(min-width: 1px)').matches).toBe(false);
    expect(new DOMMatrixReadOnly('translate(1px) scale(2)').m22).toBe(2);
    expect(document.createElement('div').offsetWidth).toBe(800);
    expect(() => document.createElement('div').scrollIntoView()).not.toThrow();
  });
});
