import { describe, expect, it } from 'vitest';

import {
  EMPTY_TARGET,
  hasTarget,
  INSPECT_ROUTE,
  inspectHref,
  inspectSearch,
  parseInspectTarget,
  sameTarget,
  type InspectTarget,
} from './inspect-link';

const parseHref = (href: string): InspectTarget =>
  parseInspectTarget(new URLSearchParams(href.slice(href.indexOf('?') + 1)));

describe('the inspect route’s query vocabulary', () => {
  it('[QLU-5] a target round-trips through its own link', () => {
    const targets: InspectTarget[] = [
      EMPTY_TARGET,
      { run: 'run-1', orchestration: null, action: null },
      { run: null, orchestration: 'orch-1', action: null },
      { run: 'run-1', orchestration: 'orch-1', action: 'iteration/began#2' },
    ];
    for (const target of targets) {
      expect(parseHref(inspectHref(target))).toEqual(target);
    }
    expect(inspectHref(EMPTY_TARGET)).toBe(INSPECT_ROUTE);
    expect(inspectSearch({ run: 'run-1' })).toBe('?run=run-1');
  });

  it('[QLU-5] every spelling of "nothing selected" produces the same link', () => {
    // Absent, empty and blank are one state, so a stale blank parameter cannot
    // make the same selection render as a different URL.
    expect(inspectHref({})).toBe(INSPECT_ROUTE);
    expect(inspectHref({ run: '', orchestration: '   ', action: undefined })).toBe(INSPECT_ROUTE);
    expect(parseInspectTarget(new URLSearchParams('run=&orchestration=%20'))).toEqual(EMPTY_TARGET);
    expect(parseInspectTarget(null)).toEqual(EMPTY_TARGET);
    expect(hasTarget(EMPTY_TARGET)).toBe(false);
    expect(hasTarget({ run: null, orchestration: 'o', action: null })).toBe(true);
    // An action alone points at nothing: it only means something under a run.
    expect(hasTarget({ run: null, orchestration: null, action: 'a' })).toBe(false);
  });

  it('[QLU-5] a value is carried verbatim, however it is spelled', () => {
    const action = 'critic/reported#critic.grounding#s2';
    const href = inspectHref({ run: 'a b/c', action });
    expect(parseHref(href)).toEqual({ run: 'a b/c', orchestration: null, action });
    // Trimmed on the way in, so a copied link with a trailing space is the same link.
    expect(parseInspectTarget(new URLSearchParams('run=%20run-1%20')).run).toBe('run-1');
  });

  it('[QLU-5] two targets naming the same thing compare equal', () => {
    expect(sameTarget(parseHref(inspectHref({ run: 'r' })), { ...EMPTY_TARGET, run: 'r' })).toBe(
      true,
    );
    expect(sameTarget({ ...EMPTY_TARGET, run: 'r' }, { ...EMPTY_TARGET, run: 's' })).toBe(false);
  });
});
