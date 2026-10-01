import { describe, expect, it } from 'vitest';

import { APP_NAME, navItemFor, NAV_ITEMS, pageMetadata, pageTitle } from './nav';

describe('the studio’s route table', () => {
  it('titles every page with the app’s name — the dashboard at / included', () => {
    expect(pageMetadata('/')).toMatchObject({ title: { absolute: `Dashboard · ${APP_NAME}` } });
    for (const item of NAV_ITEMS) {
      expect(pageMetadata(item.href)).toMatchObject({
        title: { absolute: pageTitle(item.label) },
      });
    }
    expect(pageMetadata('/prompts/[promptId]')).toMatchObject({
      title: { absolute: `Prompt · ${APP_NAME}` },
    });
  });

  it('names a route by its own row, never by the nav item above it', () => {
    expect(navItemFor('/prompts')?.label).toBe('Prompts');
    expect(navItemFor('/prompts/new')?.label).toBe('New prompt');
    expect(navItemFor('/prompts/2b3c')?.label).toBe('Prompt');
    expect(navItemFor('/stories/new')?.label).toBe('New STAR story');
    expect(navItemFor('/stories/2b3c')?.label).toBe('STAR story');
    expect(navItemFor('/practice/2b3c')?.label).toBe('Practice');
    expect(navItemFor('/')?.label).toBe('Dashboard');
  });
});
