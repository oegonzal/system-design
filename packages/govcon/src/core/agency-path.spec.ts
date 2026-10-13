import { agencyOf } from '@sysdesign/contracts';

import { dottedPath, subtierOf } from './agency-path';

describe('the agency path', () => {
  it('[GOV-8] joins the parts it is given, present ones only, and drops a name’s own dots so every segment reads back whole', () => {
    expect(dottedPath(['Department of Defense', 'Department of the Navy'])).toBe(
      'Department of Defense.Department of the Navy',
    );
    expect(dottedPath(['9700', '97AS', 'SPE4A5'])).toBe('9700.97AS.SPE4A5');
    expect(dottedPath(['Department of Defense', null, 'DLA Aviation'])).toBe(
      'Department of Defense.DLA Aviation',
    );
    expect(dottedPath([null, null])).toBeNull();
    expect(dottedPath([])).toBeNull();

    const coastGuard = dottedPath(['Department of Homeland Security', 'U.S. Coast Guard']);
    expect(coastGuard).toBe('Department of Homeland Security.US Coast Guard');
    expect(agencyOf(coastGuard)).toBe('US Coast Guard');
    // A part that is only separators and space is no segment.
    expect(dottedPath(['Department of State', ' . '])).toBe('Department of State');
  });

  it('[GOV-17] reads the subtier out of a code path, or nothing when the path stops short', () => {
    expect(subtierOf('9700.97AS.SPE4A5')).toBe('97AS');
    expect(subtierOf('9700')).toBeNull();
    expect(subtierOf(null)).toBeNull();
  });
});
