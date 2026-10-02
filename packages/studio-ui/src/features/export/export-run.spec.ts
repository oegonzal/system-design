import { describe, expect, it } from 'vitest';

import { bundleName } from './export-run';

describe('bundleName', () => {
  it('[UX-10] [UX-15] names the bundle by the diagram it holds: the revision on the canvas, or the draft — never a revision it is not', () => {
    const title = 'Campaign link shortener!';
    expect(bundleName(title, { revisionNumber: 10, origin: 'user', onCanvas: true })).toBe(
      'campaign-link-shortener-rev10.zip',
    );
    // The canvas moved on to the draft: the feedback is revision #10's, the diagram is not.
    expect(bundleName(title, { revisionNumber: 10, origin: 'user', onCanvas: false })).toBe(
      'campaign-link-shortener-draft.zip',
    );
    // Never submitted: no revision #0.
    expect(bundleName(title, null)).toBe('campaign-link-shortener-draft.zip');
  });
});
