import { ApiError } from '@sysdesign/web-kit';
import { describe, expect, it } from 'vitest';

import { goneRead, isMissing, readOrMissing, subjectGone } from './missing-read';

const notFound = (missing?: string) =>
  new ApiError(404, { statusCode: 404, message: 'not found', ...(missing ? { missing } : {}) });

describe('readOrMissing', () => {
  it('[UX-12] answers a 404 as what is missing rather than throwing, and still throws everything else', async () => {
    expect(await readOrMissing(Promise.resolve(7))).toEqual({ found: 7 });

    const error = notFound('evaluation');
    const outcome = await readOrMissing(Promise.reject(error));
    expect(isMissing(outcome)).toBe(true);
    expect(outcome).toEqual({ missing: 'evaluation', error });

    // A 404 whose body names nothing the studio knows is still missing — of nothing in particular.
    expect(await readOrMissing(Promise.reject(notFound()))).toMatchObject({ missing: null });

    const outage = new ApiError(503, { message: 'restarting' });
    await expect(readOrMissing(Promise.reject(outage))).rejects.toBe(outage);
    const dropped = new TypeError('Failed to fetch');
    await expect(readOrMissing(Promise.reject(dropped))).rejects.toBe(dropped);
  });
});

describe('subjectGone', () => {
  it('[UX-12] reads a missing session or revision as the page’s subject being gone, and nothing else', async () => {
    const session = notFound('session');
    expect(subjectGone(session)).toBe(session);
    expect(subjectGone(notFound('revision'))).not.toBeNull();

    // The revision is there; only its grade, or a coaching run, is not.
    expect(subjectGone(notFound('evaluation'))).toBeNull();
    expect(subjectGone(notFound('coaching-run'))).toBeNull();
    expect(subjectGone(notFound())).toBeNull();
    expect(subjectGone(new ApiError(409, { missing: 'session' }))).toBeNull();
    expect(subjectGone(new Error('boom'))).toBeNull();

    expect(goneRead(await readOrMissing(Promise.reject(session)))).toBe(session);
    expect(goneRead(await readOrMissing(Promise.reject(notFound('evaluation'))))).toBeNull();
    expect(goneRead({ found: 1 })).toBeNull();
    expect(goneRead(null)).toBeNull();
  });
});
