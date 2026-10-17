import { interactionPromptSchema, type ToolSessionRecord } from '@sysdesign/contracts';

import {
  approvalPrompt,
  approved,
  questionPrompt,
  questionReplyOf,
  sessionOrigin,
  summaryPrompt,
} from './operator-prompts';

const record: ToolSessionRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  service: 'example',
  title: 'Keep the list tidy.',
  mission: '# Mission\n\nKeep the list tidy.\n',
  status: 'complete',
  criteria: null,
  steps: [
    {
      step: 1,
      loopRunId: 'r1',
      finalDecision: 'accept',
      executable: true,
      executePrefix: 2,
      calls: [
        { tool: 'list_items', argumentsJson: '{}', outcome: 'ok', summary: '', durationMs: 1 },
        { tool: 'update_item', argumentsJson: '{}', outcome: 'failed', summary: '', durationMs: 1 },
      ],
      ask: null,
      finish: null,
      objections: [],
      composition: null,
      fault: null,
    },
  ],
  startedAt: '2026-10-16T12:00:00.000Z',
  endedAt: '2026-10-16T12:05:00.000Z',
  ending: { cause: 'nothing-left', detail: 'every item carries a note', status: 'complete' },
};
const origin = sessionOrigin(record);
const expiresAt = new Date('2026-10-16T13:00:00.000Z');
const via = { channel: 'fake', ref: 'm1' };

describe('what the operator is asked', () => {
  it('[TSS-8] an approval offers yes and no and nothing else, carries the session as its origin, and reads yes from the choice alone', () => {
    const call = {
      tool: 'remove_item',
      argumentsJson: '{"id":"i1"}',
      reason: 'marked for removal',
      expect: null,
      serves: [],
    };
    const tool = {
      name: 'remove_item',
      description: 'Removes one item for good.',
      parameters: {},
      effect: 'irreversible' as const,
      approval: true,
      provider: 'example',
    };
    const prompt = approvalPrompt(call, tool, origin, expiresAt);
    expect(interactionPromptSchema.parse(prompt)).toEqual(prompt);
    expect(prompt).toMatchObject({
      origin: { kind: 'tool-session', id: record.id, label: 'Keep the list tidy.' },
      title: 'Run remove_item?',
      details: ['Removes one item for good.', 'id: "i1"', 'Why: marked for removal'],
      freeText: null,
      commands: [],
      expiresAt: '2026-10-16T13:00:00.000Z',
    });
    expect(prompt.choices.map((choice) => choice.id)).toEqual(['yes', 'no']);
    // Each argument on its own line: a long one cannot hide a short one that reaches other people.
    const invite = approvalPrompt(
      {
        ...call,
        tool: 'create_event',
        argumentsJson: JSON.stringify({
          summary: 'Sync',
          description: 'd'.repeat(1_200),
          attendees: ['ada@example.test'],
        }),
      },
      { ...tool, name: 'create_event', effect: 'write' },
      origin,
      expiresAt,
    );
    expect(interactionPromptSchema.parse(invite)).toEqual(invite);
    expect(invite.details[0]).toContain('Not every argument is shown whole');
    expect(invite.details).toContain('attendees: ["ada@example.test"]');
    expect(invite.details.some((line) => line.startsWith('description: "ddd'))).toBe(true);
    expect(approvalPrompt(call, tool, origin, expiresAt).details[0]).not.toContain('shown whole');
    expect(approved({ promptId: prompt.id, reply: { kind: 'choice', choiceId: 'yes' }, via })).toBe(
      true,
    );
    expect(approved({ promptId: prompt.id, reply: { kind: 'choice', choiceId: 'no' }, via })).toBe(
      false,
    );
    expect(approved({ promptId: prompt.id, reply: { kind: 'text', text: 'yes' }, via })).toBe(
      false,
    );
  });

  it('[TSS-8] a question offers the plan’s options and the person’s own words, and reads back the option chosen, the words typed, or the stop', () => {
    const ask = { question: 'Which item is the house account?', options: ['Alpha', 'Beta'] };
    const prompt = questionPrompt(ask, origin, expiresAt);
    expect(interactionPromptSchema.parse(prompt)).toEqual(prompt);
    expect(prompt.choices.map((choice) => [choice.id, choice.label])).toEqual([
      ['o1', 'Alpha'],
      ['o2', 'Beta'],
    ]);
    expect(prompt.freeText).toEqual({ maxLength: null });
    expect(prompt.commands).toEqual([{ id: 'stop', label: 'End the session' }]);
    expect(
      questionReplyOf(ask, { promptId: prompt.id, reply: { kind: 'choice', choiceId: 'o2' }, via }),
    ).toEqual({
      kind: 'answer',
      text: 'Beta',
    });
    expect(
      questionReplyOf(ask, { promptId: prompt.id, reply: { kind: 'text', text: 'Gamma' }, via }),
    ).toEqual({
      kind: 'answer',
      text: 'Gamma',
    });
    expect(
      questionReplyOf(ask, {
        promptId: prompt.id,
        reply: { kind: 'command', commandId: 'stop' },
        via,
      }),
    ).toEqual({
      kind: 'stop',
    });
    expect(() =>
      questionReplyOf(ask, { promptId: prompt.id, reply: { kind: 'choice', choiceId: 'o9' }, via }),
    ).toThrow('never offered');
  });

  it('[TSS-8] a session that ended is told as one notice: its status and cause, its mission, what it did', () => {
    const prompt = summaryPrompt(record, new Date('2026-10-16T12:05:00.000Z'));
    expect(interactionPromptSchema.parse(prompt)).toEqual(prompt);
    expect(prompt).toMatchObject({
      title: 'example session complete: nothing-left',
      details: [
        'Mission: Keep the list tidy.',
        '1 step, 2 calls (1 ok)',
        'every item carries a note',
      ],
      choices: [{ id: 'noted', label: 'Noted', note: null }],
      expiresAt: '2026-10-23T12:05:00.000Z',
    });
  });
});
