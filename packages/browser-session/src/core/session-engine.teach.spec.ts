import { decidedAnswers, decidedPlan, ScriptedOperator, type InMemoryDumpStore } from './testing';
import { JOURNEY_ANSWERS as ANSWERS, JOURNEY_PLANS as PLANS } from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * Which operator answers are taught: the operator settings name the channels,
 * by the id each answer carries, whose answers are kept for the session alone
 * — the session's own terminal, by the shipped file — and every other
 * channel's answers are taught. Measured 2026-10-19: answers typed at the
 * terminal by an automated process on the owner's behalf were stored as the
 * owner's own facts, outranked his standing answers, and a wrong value went
 * out on a submitted application.
 */
const TAUGHT = 'chat.owner';
const UNTAUGHT = ['terminal'];

const script = () => ({
  plans: [PLANS.search, PLANS.results, PLANS.formOnly, PLANS.formAgain, PLANS.done, PLANS.end].map(
    (p) => decidedPlan(p),
  ),
  answers: [decidedAnswers(ANSWERS), decidedAnswers(ANSWERS)],
});

interface FieldsFile {
  fields: { result: { via: string | null; guidance: { via: string } | null } }[];
}

const fieldsFile = (dumps: InMemoryDumpStore, step: string): FieldsFile =>
  JSON.parse(dumps.text(`01-steps/${step}/fields.json`)) as FieldsFile;

describe('which operator answers are taught', () => {
  it('[BRW-20] keeps an answer on a channel the settings name untaught for the session alone: filled, cached, taught to nobody, and said so', async () => {
    const operator = new ScriptedOperator(['Yes'], 'terminal');
    const { detail, brain, dumps, ledger, logs } = await run({
      script: script(),
      operator,
      untaught: UNTAUGHT,
    });
    const fields = detail.decisions.filter((d) => d.kind === 'field-answer' && d.step === 3);
    expect(fields[1]).toMatchObject({ source: 'operator', answer: 'Yes' });
    expect(fields[1]?.payload).toMatchObject({ via: 'terminal' });
    // Nothing taught: no orchestration on the row, no document, no teach file, no item in the dump.
    expect(fields[1]?.teachOrchestrationId).toBeNull();
    expect(brain.taught).toEqual([]);
    expect(ledger.teachings).toEqual([]);
    expect(dumps.files.has('01-steps/03/teach.json')).toBe(false);
    expect(fieldsFile(dumps, '03').fields[1]?.result).toMatchObject({
      via: 'terminal',
      guidance: null,
    });
    expect(logs).toContainEqual(
      expect.stringContaining('answered via terminal, which the operator settings do not teach'),
    );
    // The next form of the unit still takes the answer from the session's cache.
    const again = detail.decisions.find((d) => d.kind === 'field-answer' && d.step === 4);
    expect(again?.payload['cached']).toBe(true);
    expect(again?.answer).toBe('Yes');
  });

  it('[BRW-20] [BRW-17] teaches an answer on any other channel, the section naming the channel and the options it was chosen among', async () => {
    const operator = new ScriptedOperator(['Yes'], TAUGHT);
    const { detail, brain, dumps, ledger } = await run({
      script: script(),
      operator,
      untaught: UNTAUGHT,
    });
    const fields = detail.decisions.filter((d) => d.kind === 'field-answer' && d.step === 3);
    expect(fields[1]?.payload).toMatchObject({ via: TAUGHT });
    expect(fields[1]?.teachOrchestrationId).toBe('fake-teach-1');
    expect(ledger.teachings).toEqual([
      { decisionIds: [fields[1]?.id], orchestrationRunId: 'fake-teach-1' },
    ]);
    expect(brain.taught).toHaveLength(1);
    expect(brain.taught[0]?.parts[0]).toContain('offering Yes | No');
    expect(brain.taught[0]?.parts[0]).toContain(`answered via ${TAUGHT}.`);
    expect(dumps.text('01-steps/03/teach.json')).toContain('fake-teach-1');
    expect(fieldsFile(dumps, '03').fields[1]?.result.guidance?.via).toBe(TAUGHT);
  });
});
