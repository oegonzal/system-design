import { describe, expect, it } from 'vitest';

import config from '../../astro.config';

describe('the site', () => {
  it('[SITE-1] is statically generated: no adapter, nothing rendered on demand', () => {
    // Without an adapter Astro can only prerender, and a route that asks to
    // render on demand fails the build — so this is the whole guarantee.
    expect(config.adapter).toBeUndefined();
    expect(config.output ?? 'static').toBe('static');
  });
});
