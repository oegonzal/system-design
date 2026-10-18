import type { ValidationProblem } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { readArtifact } from '../../core/contracts';
import { contractOf, fill } from '../../core/testing';
import { REGISTER_DIGEST } from './definition';
import type { DigestMemory, RegisterDigest } from './output';
import { memoryOf, registerDigestGoal, sampleRegisterDigest, sampleTextInput } from './testing';

const goal = registerDigestGoal();

/** Every validator's problems on a digest, by validator id. */
const problemsOf = (digest: RegisterDigest, goalIn = goal): Record<string, ValidationProblem[]> => {
  const contract = contractOf(REGISTER_DIGEST.task, goalIn);
  return Object.fromEntries(
    REGISTER_DIGEST.validators.map((validator) => [
      validator.id,
      validator.validate(digest, contract).problems,
    ]),
  );
};

/** Only the validators that found something, so a case shows what it faults and nothing else. */
const faultsOf = (digest: RegisterDigest, goalIn = goal): Record<string, ValidationProblem[]> =>
  Object.fromEntries(
    Object.entries(problemsOf(digest, goalIn)).filter(([, problems]) => problems.length > 0),
  );

/** The sample digest with the memory at `position` replaced. */
const replacing = (position: number, memory: DigestMemory): RegisterDigest => {
  const { memories } = sampleRegisterDigest();
  return { memories: memories.map((each, at) => (at === position ? memory : each)) };
};

const [preference, exportRun] = sampleRegisterDigest().memories;

const at = (location: string, message: string): ValidationProblem => ({
  severity: 'high',
  locationRefs: [location],
  message,
});

describe('the register-digest validators', () => {
  it('[QL-77] [QL-53] a digest whose every memory rests on listed sections and fills its register’s one slot passes all four, each a warning that withholds the memory it names', () => {
    expect(problemsOf(sampleRegisterDigest())).toEqual({
      references: [],
      register: [],
      candidate: [],
      reserved: [],
    });
    // A fault never refuses the digest: each validator warns, and its problem withholds one memory.
    expect(
      REGISTER_DIGEST.validators.map(({ id, gate, withholds }) => [id, gate, withholds]),
    ).toEqual([
      ['references', 'warn', 'every-ref'],
      ['register', 'warn', 'every-ref'],
      ['candidate', 'warn', 'every-ref'],
      ['reserved', 'warn', 'every-ref'],
    ]);
  });

  it('[QL-77] a memory resting on a section the goal does not list is faulted where it sits, and no other', () => {
    const digest = replacing(1, { ...exportRun, evidence: ['section.1', 'section.9'] });
    expect(faultsOf(digest)).toEqual({
      references: [at('memory.2', 'memory.2 rests on section.9, which is not a listed section')],
    });
  });

  it('[QL-77] a memory under a register the goal does not list, in another kind’s slot, or in two slots or none, is faulted where it sits', () => {
    const playbook = memoryOf('procedural_playbook', 'procedural', {
      name: 'nightly export',
      description: null,
      rules: [{ key: 'run time', text: 'Run the nightly export at 02:00 UTC.' }],
    });
    expect(faultsOf(replacing(0, playbook))).toEqual({
      register: [
        at(
          'memory.1',
          'memory.1 is filed under "procedural_playbook", which is not a listed register',
        ),
      ],
    });
    const wrongKind = memoryOf('semantic_fact', 'working', {
      key: 'export time',
      value: '02:00 UTC',
    });
    expect(faultsOf(replacing(0, wrongKind))).toEqual({
      register: [
        at(
          'memory.1',
          'memory.1 fills the working slot, and "semantic_fact" keeps semantic memories',
        ),
      ],
    });
    const twoSlots = { ...preference, working: { key: 'export time', value: '02:00 UTC' } };
    expect(faultsOf(replacing(0, twoSlots))).toEqual({
      register: [
        at(
          'memory.1',
          'memory.1 fills 2 kind slots (working, semantic); a memory fills exactly one',
        ),
      ],
    });
    const noSlot = { ...preference, semantic: null };
    expect(faultsOf(replacing(0, noSlot))).toEqual({
      register: [at('memory.1', 'memory.1 fills no kind slot; a memory fills exactly one')],
    });
    // The index is the list: a goal narrowed to fewer registers lists only those.
    const { registers } = sampleTextInput();
    const narrowed = registerDigestGoal(
      sampleTextInput({ registers: registers.filter((listed) => listed.name !== 'semantic_fact') }),
    );
    expect(faultsOf(sampleRegisterDigest(), narrowed)).toEqual({
      register: [
        at('memory.1', 'memory.1 is filed under "semantic_fact", which is not a listed register'),
      ],
    });
  });

  it('[QL-77] a candidate the runtime’s strict schema refuses is faulted where it sits, while the digest itself stays well-formed: text past the runtime’s ceiling, a malformed time, an undated episode', () => {
    const candidate = (memory: DigestMemory, position: number) => {
      const digest = replacing(position, memory);
      // The lenient read keeps what the runtime will refuse: the digest is judged whole.
      expect(readArtifact(REGISTER_DIGEST.task.output.schema, digest).ok).toBe(true);
      const faults = faultsOf(digest);
      expect(Object.keys(faults)).toEqual(['candidate']);
      expect(faults['candidate'].map((problem) => problem.locationRefs)).toEqual([
        [`memory.${position + 1}`],
      ]);
      return faults['candidate'][0].message;
    };
    const overlong = { ...preference.semantic, value: fill(1200, 'v') };
    expect(candidate({ ...preference, semantic: overlong }, 0)).toMatch(
      /^memory\.1 writes a candidate the runtime's semantic schema refuses — value: /,
    );
    const malformed = { ...preference.semantic, validFrom: 'last Tuesday' };
    expect(candidate({ ...preference, semantic: malformed }, 0)).toMatch(/— validFrom: /);
    const undated = { ...exportRun.episodic, occurredAt: null };
    expect(candidate({ ...exportRun, episodic: undated }, 1)).toMatch(
      /^memory\.2 writes a candidate the runtime's episodic schema refuses — occurredAt: /,
    );
  });

  it('[QL-77] a memory taking an identity its register keeps reserved is faulted where it sits', () => {
    const lesson = { ...preference, semantic: { ...preference.semantic, predicate: 'lesson' } };
    expect(faultsOf(replacing(0, lesson))).toEqual({
      reserved: [
        at(
          'memory.1',
          'memory.1 takes predicate = "lesson", which "semantic_fact" keeps for what consolidation writes',
        ),
      ],
    });
  });

  it('[QL-77] a goal without an index warns once and names no memory; an ill-formed artifact is left to the schema validator', () => {
    expect(problemsOf(sampleRegisterDigest(), 'Just a text.')).toEqual({
      references: [
        {
          severity: 'critical',
          locationRefs: [],
          message: 'the goal carries no register-digest index',
        },
      ],
      register: [],
      candidate: [],
      reserved: [],
    });
    const broken = { memories: 'none' } as unknown as RegisterDigest;
    expect(faultsOf(broken)).toEqual({});
  });
});
