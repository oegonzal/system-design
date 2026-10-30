import { BrainFaulted, type TeachReceipt } from './ports';
import {
  decidedAnswers,
  decidedPlan,
  ScriptedOperator,
  type BrainScript,
  type InMemoryDumpStore,
} from './testing';
import { JOURNEY_ANSWERS as ANSWERS, JOURNEY_PLANS as PLANS } from './testing-journey';
import { runScripted as run, SPEC_SUBJECT } from './testing-session';

/**
 * Which operator answers are taught, and what the record keeps of each
 * teaching. The operator settings name the channels, by the id each answer
 * carries, whose answers are kept for the session alone — the session's own
 * terminal, by the shipped file — and every other channel's answers are
 * taught; the receipt the memory answers lands on the row the answer made and
 * in the step's teach file. Measured 2026-10-19: answers typed at the terminal
 * by an automated process on the owner's behalf were stored as the owner's own
 * facts, outranked his standing answers, and a wrong value went out on a
 * submitted application.
 */
const TAUGHT = 'chat.owner';
const UNTAUGHT = ['terminal'];

const script = (teaching: Pick<BrainScript, 'teachReceipts' | 'teachFault'> = {}): BrainScript => ({
  plans: [PLANS.search, PLANS.results, PLANS.formOnly, PLANS.formAgain, PLANS.done, PLANS.end].map(
    (p) => decidedPlan(p),
  ),
  answers: [decidedAnswers(ANSWERS), decidedAnswers(ANSWERS)],
  ...teaching,
});

interface FieldsFile {
  recall: unknown;
  fields: {
    result: { via: string | null; guidance: { via: string; about: string | null } | null };
  }[];
}

/** A teaching as the step's teach file records it. */
interface TeachFile {
  decisionId: string;
  subject: string;
  ref: string | null;
  outcome: string | null;
  fault: string | null;
  answer: { answer: string };
}

const fieldsFile = (dumps: InMemoryDumpStore, step: string): FieldsFile =>
  JSON.parse(dumps.text(`01-steps/${step}/fields.json`)) as FieldsFile;

const teachFile = (dumps: InMemoryDumpStore, step: string): TeachFile[] =>
  JSON.parse(dumps.text(`01-steps/${step}/teach.json`)) as TeachFile[];

/** The session over the journey with the operator answering once on the channel named. */
const answering = (
  channel: string,
  teaching: Pick<BrainScript, 'teachReceipts' | 'teachFault'> = {},
) =>
  run({
    script: script(teaching),
    operator: new ScriptedOperator(['Yes'], channel),
    untaught: UNTAUGHT,
  });

describe('which operator answers are taught', () => {
  it('[BRW-20] keeps an answer on a channel the settings name untaught for the session alone: filled, cached, taught to nobody, and said so', async () => {
    const { detail, brain, dumps, ledger, logs } = await answering('terminal');
    const fields = detail.decisions.filter((d) => d.kind === 'field-answer' && d.step === 3);
    expect(fields[1]).toMatchObject({ source: 'operator', answer: 'Yes' });
    expect(fields[1]?.payload).toMatchObject({ via: 'terminal', teaching: null });
    // Nothing taught: no teaching reference on the row, no teach call, no teach file, no item in the dump.
    expect(fields[1]?.teachingRef).toBeNull();
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

  it('[BRW-20] [BRW-17] teaches an answer on any other channel as the subject’s — the item naming the channel, the options it was chosen among and the scope the answerer declared — and keeps the receipt on the row and in the step’s teach file', async () => {
    const { outcome, detail, brain, dumps, ledger } = await answering(TAUGHT);
    const fields = detail.decisions.filter((d) => d.kind === 'field-answer' && d.step === 3);
    expect(fields[1]?.payload).toMatchObject({ via: TAUGHT });
    // One teaching, from the form's step, as the subject's own.
    expect(brain.taught).toEqual([
      {
        subject: SPEC_SUBJECT,
        session: { sessionId: outcome.sessionId, step: 3 },
        answers: [
          expect.objectContaining({
            field: expect.objectContaining({ options: ['Yes', 'No'] }),
            answer: 'Yes',
            about: 'subject',
            via: TAUGHT,
          }),
        ],
      },
    ]);
    // The receipt lands on the row the answer came from, as its reference and in its payload.
    expect(fields[1]?.teachingRef).toBe('fake-teach-1');
    expect(fields[1]?.payload['teaching']).toEqual({ ref: 'fake-teach-1', outcome: 'queued' });
    expect(ledger.teachings).toEqual([{ decisionIds: [fields[1]?.id], ref: 'fake-teach-1' }]);
    // The teach file keeps the subject at the top, so teach-again reads whom the answer is about from any dump.
    expect(teachFile(dumps, '03')).toEqual([
      {
        decisionId: fields[1]?.id,
        subject: SPEC_SUBJECT,
        ref: 'fake-teach-1',
        outcome: 'queued',
        fault: null,
        answer: expect.objectContaining({ answer: 'Yes', via: TAUGHT }),
      },
    ]);
    const file = fieldsFile(dumps, '03');
    expect(file.fields[1]?.result.guidance).toMatchObject({ via: TAUGHT, about: 'subject' });
    // What the brain's recall did rides on the fields file; a brain whose recall is the loop's own reports none.
    expect(file.recall).toBeNull();
  });

  it('[BRW-17] records a teaching the memory refused on the row and in the teach file with its fault, links no reference, and warns', async () => {
    const refused: TeachReceipt = {
      ref: null,
      outcome: 'refused',
      fault: 'the value is past the ceiling',
    };
    const { detail, dumps, ledger, warnings } = await answering(TAUGHT, {
      teachReceipts: [refused],
    });
    const row = detail.decisions.find(
      (d) => d.kind === 'field-answer' && d.step === 3 && d.source === 'operator',
    );
    expect(row?.payload['teaching']).toEqual({ ref: null, outcome: 'refused' });
    expect(row?.teachingRef).toBeNull();
    expect(ledger.teachings).toEqual([]);
    expect(teachFile(dumps, '03')).toMatchObject([
      { decisionId: row?.id, ref: null, outcome: 'refused', fault: refused.fault },
    ]);
    expect(warnings).toContainEqual(
      expect.stringContaining(`refused by the memory — ${refused.fault}`),
    );
  });

  it('[BRW-17] a brain that answers nothing leaves the fault as the one record of the attempt: no outcome, no reference, the row and the file saying so', async () => {
    const { detail, dumps, ledger, warnings } = await answering(TAUGHT, {
      teachFault: new BrainFaulted('unreachable', 'nobody answered'),
    });
    const row = detail.decisions.find(
      (d) => d.kind === 'field-answer' && d.step === 3 && d.source === 'operator',
    );
    expect(row?.payload['teaching']).toEqual({ ref: null, outcome: null });
    expect(row?.teachingRef).toBeNull();
    expect(ledger.teachings).toEqual([]);
    expect(teachFile(dumps, '03')).toMatchObject([
      {
        decisionId: row?.id,
        ref: null,
        outcome: null,
        fault: 'brain unreachable: nobody answered',
      },
    ]);
    expect(warnings).toContainEqual(
      expect.stringContaining('not taught — brain unreachable: nobody answered'),
    );
  });
});
