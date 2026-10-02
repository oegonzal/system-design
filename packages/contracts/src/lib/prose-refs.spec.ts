import { describe, expect, it } from 'vitest';

import {
  locationRefPattern,
  nameClaims,
  refIdsIn,
  refMentions,
  substituteRefs,
  substituteTokens,
  proseSays,
  tokenWords,
} from './prose-refs';

const ids = [
  ...Array.from({ length: 13 }, (_, index) => `edge.${index + 1}`),
  'node.1',
  'node.12',
  'binding.3',
  'binding.7',
  'rationale.3',
  'overview',
];

describe('refMentions', () => {
  it('matches whole ids only — `node.1` never inside `node.12` or `xnode.1`', () => {
    expect(refIdsIn('node.12 then node.1, never xnode.1 or node.1a', ids)).toEqual([
      'node.12',
      'node.1',
    ]);
    expect(refMentions('anything', [])).toEqual([]);
    expect(locationRefPattern([])).toBeNull();
  });

  it('[EVAL-2] reads an id in either case and answers it as listed', () => {
    expect(refMentions('Rationale.3 asserts it. Overview agrees.', ids)).toEqual([
      { index: 0, text: 'Rationale.3', ids: ['rationale.3'], form: 'one' },
      { index: 24, text: 'Overview', ids: ['overview'], form: 'one' },
    ]);
  });

  // The shapes lenses were recorded writing: `edge.1-2`, `edge.8-11`, `binding.3/7`, `edge.12/13`.
  it('[EVAL-2] reads a run as every member and a list as each one named', () => {
    expect(refMentions('see edge.8-11 and binding.3/7, or edge.12/13', ids)).toEqual([
      { index: 4, text: 'edge.8-11', ids: ['edge.8', 'edge.9', 'edge.10', 'edge.11'], form: 'run' },
      { index: 18, text: 'binding.3/7', ids: ['binding.3', 'binding.7'], form: 'list' },
      { index: 34, text: 'edge.12/13', ids: ['edge.12', 'edge.13'], form: 'list' },
    ]);
  });

  it('leaves a run or a list as written when any member is not listed, and never walks past the first gap', () => {
    expect(refMentions('edge.12-14, binding.3/4, edge.3-2 and node.1-99999999', ids)).toEqual([]);
    // A continuation that is not one — more word follows — leaves the id itself standing.
    expect(refIdsIn('edge.1-2x and overview-3', ids)).toEqual(['edge.1']);
  });
});

describe('substituteRefs', () => {
  it('[EVAL-2] rewrites any id the glossary holds as a whole token, and never re-reads a label it put in place', () => {
    const glossary = new Map([
      ['contradiction|binding.2,edge.5', 'Contradiction (c4 binding)'],
      ['c4', '“Orders survive a restart”'],
      ['c5', 'c4 again'],
    ]);
    expect(
      substituteRefs('blockers to fix: contradiction|binding.2,edge.5, c4, c41, C5', glossary),
    ).toBe(
      'blockers to fix: Contradiction (c4 binding), “Orders survive a restart”, c41, c4 again',
    );
    expect(substituteRefs('no ids here', new Map())).toBe('no ids here');
  });

  it('[EVAL-2] joins a run by its ends and a list by each', () => {
    const glossary = new Map(ids.map((id) => [id, `<${id}>`]));
    expect(substituteRefs('edge.1-3, binding.3/7', glossary)).toBe(
      '<edge.1> to <edge.3>, <binding.3> / <binding.7>',
    );
  });
});

describe('substituteTokens', () => {
  const types = ['data_integrity', 'missing_requirement', 'topology_defect', 'contradiction'];

  it('[EVAL-2] words the tokens of a vocabulary it is handed, whole tokens only', () => {
    expect(
      substituteTokens(
        'per the missing_requirement defect and confirmed topology_defect/data_integrity findings; a contradiction; not data_integrity_x',
        types,
      ),
    ).toBe(
      'per the missing requirement defect and confirmed topology defect/data integrity findings; a contradiction; not data_integrity_x',
    );
    expect(substituteTokens('data_integrity', [])).toBe('data_integrity');
    expect(substituteTokens('data_integrity', types, (token) => `[${token}]`)).toBe(
      '[data_integrity]',
    );
  });

  it('a token reads as the words it is made of', () => {
    expect(tokenWords('max-iterations')).toBe('max iterations');
    expect(tokenWords('critic.scale')).toBe('critic scale');
    expect(tokenWords('')).toBe('');
  });
});

describe('proseSays', () => {
  it('finds a name anywhere in the prose, as whole words in either case, through any punctuation', () => {
    expect(proseSays('the Orders DB at node.5', 'Orders DB')).toBe(true);
    expect(proseSays('node.5 (the orders db)', 'Orders DB')).toBe(true);
    expect(proseSays('The Orders DB primary (node.5)', 'Orders DB')).toBe(true);
    expect(proseSays('the Orders-DB, sharded', 'Orders DB')).toBe(true);
    // Part of a word is not the word; the words out of order are not the name.
    expect(proseSays('the Reorders DB', 'Orders DB')).toBe(false);
    expect(proseSays('the DB of orders', 'Orders DB')).toBe(false);
    expect(proseSays('node.1 — the Client', 'Orders DB')).toBe(false);
    expect(proseSays('anything', '  ')).toBe(false);
  });
});

describe('nameClaims', () => {
  /** Each name claimed in turn, as a reader asks for each part it meets. */
  const claimed = (prose: string, names: readonly string[], asked: readonly string[]) => {
    const claim = nameClaims(prose, names);
    return asked.map((name) => claim(name));
  };

  // "Orders DB (node.5) writes to node.7 and node.8" named the Orders DB, and
  // read as though it had named parts called "DB" and "Orders" too.
  it('[EVAL-2] gives a name inside a longer one to the longer one: its words are said once, for one name', () => {
    const names = ['Orders DB', 'DB', 'Orders'];
    expect(claimed('The Orders DB writes to node.7 and node.8.', names, names)).toEqual([
      true,
      false,
      false,
    ]);
    // Said on their own as well, the shorter names are said.
    expect(claimed('Orders reads the DB beside the Orders DB', names, names)).toEqual([
      true,
      true,
      true,
    ]);
    // The longest saying first, the leftmost of equals: "DB Primary" lost its "DB".
    expect(
      claimed('the Orders DB Primary', ['Orders DB', 'DB Primary'], ['DB Primary', 'Orders DB']),
    ).toEqual([false, true]);
  });

  it('[EVAL-2] spends one saying per claim, so two parts that share a name share its sayings', () => {
    expect(claimed('the DB replicates to node.9', ['DB'], ['DB', 'db'])).toEqual([true, false]);
    expect(claimed('the db replicates to the DB', ['DB'], ['DB', 'db', 'DB'])).toEqual([
      true,
      true,
      false,
    ]);
    // A name the reader did not hand in is never said, and neither is one of no words.
    expect(claimed('the Client polls', ['DB'], ['Client'])).toEqual([false]);
    expect(claimed('anything', ['  '], ['  '])).toEqual([false]);
  });
});
