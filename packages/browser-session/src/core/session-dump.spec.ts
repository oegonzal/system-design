import { listingObservation } from '@sysdesign/contracts';

import { observationFiles, stepFile, stepJsonFile } from './session-dump';

describe('the session dump', () => {
  it('lays a step out as the observation without its snapshot, the snapshot as text and the screenshot as bytes', () => {
    const files = observationFiles(3, listingObservation(), new Uint8Array([1, 2, 3]));
    expect(files.map((file) => file.path)).toEqual([
      '01-steps/03/observation.json',
      '01-steps/03/snapshot.txt',
      '01-steps/03/screenshot.png',
    ]);
    const observation = files[0];
    expect(
      observation !== undefined && 'content' in observation && observation.content,
    ).not.toContain('ariaSnapshot');
    expect(observationFiles(1, listingObservation(), null)).toHaveLength(2);
    expect(stepJsonFile(12, 'plan', { a: 1 })).toEqual({
      path: stepFile(12, 'plan'),
      content: '{\n  "a": 1\n}\n',
    });
  });
});
