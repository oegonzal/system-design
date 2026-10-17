import {
  TOOL_MISSION_FIXTURE,
  TOOL_SESSION_TOPICS,
  type RunShape,
  type ToolCall,
  type ToolPlan,
  type ToolSessionRecord,
} from '@sysdesign/contracts';
import { LoopUnreachable } from '@sysdesign/loop-client';
import { z } from 'zod';

import { runSession } from './session-loop';
import {
  fakeDeps,
  fakeTool,
  FakeLoopClient,
  FakeOperator,
  okTool,
  sampleSettings,
} from './testing';

const call = (tool: string, args: Record<string, unknown> = {}): ToolCall => ({
  tool,
  argumentsJson: JSON.stringify(args),
  reason: `${tool} is next`,
  expect: null,
  serves: [],
});
const plan = (calls: ToolCall[], overrides: Partial<ToolPlan> = {}): ToolPlan => ({
  assessment: 'The next step.',
  calls,
  ask: null,
  finish: null,
  ...overrides,
});
const finishing = plan([], {
  finish: { cause: 'nothing-left', detail: 'every item carries a note' },
});
const refusedWhole: RunShape = {
  artifact: plan([call('list_items')]),
  finalDecision: 'escalate',
  policyAllowed: false,
  findings: [
    { type: 'missed_stop', locationRefs: ['assessment'], rationale: 'the list is empty already' },
  ],
};
const criteria = [
  { id: 'c1', kind: 'progress', statement: 'List the items first.' },
  { id: 'c2', kind: 'safety', statement: 'Never remove an unmarked item.' },
];

const tools = () => [
  okTool('list_items'),
  okTool('update_item', 'write'),
  fakeTool('remove_item', 'irreversible', true, (args) =>
    Promise.resolve({ outcome: 'ok', summary: `removed ${String(args['id'])}`, data: null }),
  ),
  fakeTool('flaky', 'read', false, () => Promise.reject(new Error('timeout')), z.object({})),
];

const record = (): ToolSessionRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  service: 'example',
  title: 'Keep the list tidy.',
  mission: TOOL_MISSION_FIXTURE,
  status: 'running',
  criteria: null,
  steps: [],
  startedAt: '2026-10-16T12:00:00.000Z',
  endedAt: null,
  ending: null,
});

const run = (
  script: ConstructorParameters<typeof FakeLoopClient>[0],
  operator = new FakeOperator(),
  rails: Partial<ReturnType<typeof sampleSettings>['rails']> = {},
  signal = new AbortController().signal,
) => {
  const loop = new FakeLoopClient(script, criteria);
  const deps = fakeDeps(loop, tools(), operator);
  const settings = sampleSettings(rails);
  return {
    loop,
    deps,
    done: runSession(deps, { record: record(), rails: settings.rails, settings, signal }),
  };
};

describe('the session loop', () => {
  it('[TSS-3] derives the rubric once, runs each accepted plan whole, carries what passed as settled, and ends complete on the mission’s cause', async () => {
    const { loop, deps, done } = run([
      { artifact: plan([call('list_items')]), criteria: [{ criterionId: 'c1', result: 'pass' }] },
      { artifact: plan([call('update_item', { id: 'i1' })]) },
      { artifact: finishing },
    ]);
    const ended = await done;
    expect(ended.status).toBe('complete');
    expect(ended.ending).toEqual({
      cause: 'nothing-left',
      detail: 'every item carries a note',
      status: 'complete',
    });
    expect(ended.criteria).toEqual(criteria);
    expect(ended.steps.map((step) => [step.executable, step.calls.map((c) => c.outcome)])).toEqual([
      [true, ['ok']],
      [true, ['ok']],
      [true, []],
    ]);
    expect(ended.steps[2]?.finish?.cause).toBe('nothing-left');
    // Every run is asked with the rubric minus what was settled, one iteration after a step that ran.
    expect(loop.starts.map((start) => start.criteria?.map((c) => c.id))).toEqual([
      ['c1', 'c2'],
      ['c2'],
      ['c2'],
    ]);
    expect(loop.starts.map((start) => start.maxIterations)).toEqual([1, 1, 1]);
    // The second goal shows the first call's observation.
    expect(loop.starts[1]?.goal).toContain('### Observation 1 — list_items {} · step 1 · ok');
    expect(loop.starts[1]?.goal).toContain('list_items ran with {}');
    expect(deps.events.published.map((event) => event.topic)).toEqual([
      TOOL_SESSION_TOPICS.started,
      TOOL_SESSION_TOPICS.stepped,
      TOOL_SESSION_TOPICS.stepped,
      TOOL_SESSION_TOPICS.stepped,
      TOOL_SESSION_TOPICS.finished,
    ]);
    expect(deps.events.published.at(-1)?.payload).toMatchObject({
      status: 'complete',
      cause: 'nothing-left',
      steps: 3,
    });
    expect(deps.operator.notices).toHaveLength(1);
    expect(deps.operator.notices[0]?.title).toBe('example session complete: nothing-left');
  });

  it('[TSS-3] a refused plan runs nothing, carries its objections into the next goal, asks the loop for two iterations next, and stalls after the declared count', async () => {
    const { loop, done } = run([refusedWhole, refusedWhole, refusedWhole]);
    const ended = await done;
    expect(ended.status).toBe('stopped');
    expect(ended.ending?.cause).toBe('stalled');
    expect(ended.steps).toHaveLength(2);
    expect(ended.steps[0]).toMatchObject({ executable: false, executePrefix: 0, calls: [] });
    expect(ended.steps[0]?.objections[0]).toMatchObject({
      from: 'missed_stop',
      at: ['assessment'],
    });
    expect(loop.starts[1]?.goal).toContain('the list is empty already');
    expect(loop.starts[1]?.goal).toContain('not-executed (proposed, did not run): list_items');
    expect(loop.starts.map((start) => start.maxIterations)).toEqual([1, 2]);
  });

  it('[TSS-3] asks the operator before a call its tool declares approval for: no refuses the call, yes runs it, no answer ends the session', async () => {
    const declined = run(
      [{ artifact: plan([call('remove_item', { id: 'i1' })]) }, { artifact: finishing }],
      new FakeOperator([{ choice: 'no' }]),
    );
    const ended = await declined.done;
    expect(ended.steps[0]?.calls).toEqual([
      expect.objectContaining({
        tool: 'remove_item',
        outcome: 'refused',
        summary: 'the operator declined',
      }),
    ]);
    expect(declined.deps.operator.asked[0]?.title).toBe('Run remove_item?');
    expect(ended.status).toBe('complete');

    const approvedRun = run(
      [{ artifact: plan([call('remove_item', { id: 'i1' })]) }, { artifact: finishing }],
      new FakeOperator([{ choice: 'yes' }]),
    );
    expect((await approvedRun.done).steps[0]?.calls[0]).toMatchObject({
      outcome: 'ok',
      summary: 'removed i1',
    });

    const silent = run(
      [{ artifact: plan([call('remove_item', { id: 'i1' })]) }],
      new FakeOperator([{ expires: true }]),
    );
    const unanswered = await silent.done;
    expect(unanswered.ending).toMatchObject({ cause: 'operator-unavailable', status: 'stopped' });
  });

  it('[TSS-3] a question the plan ends on is put to the operator and the answer becomes an observation; the stop command ends the session', async () => {
    const asking = plan([], {
      ask: { question: 'Which item is the house account?', options: ['Alpha', 'Beta'] },
    });
    const answered = run(
      [{ artifact: asking, finalDecision: 'escalate' }, { artifact: finishing }],
      new FakeOperator([{ choice: 'o2' }]),
    );
    const ended = await answered.done;
    expect(ended.steps[0]?.ask).toEqual({
      question: 'Which item is the house account?',
      options: ['Alpha', 'Beta'],
      answer: 'Beta',
    });
    expect(answered.loop.starts[1]?.goal).toContain('[operator] Beta');
    expect(ended.status).toBe('complete');

    const stopped = run([{ artifact: asking }], new FakeOperator([{ command: 'stop' }]));
    expect((await stopped.done).ending).toMatchObject({
      cause: 'stop-signal',
      detail: 'the operator ended the session',
    });
  });

  it('[TSS-3] stops the prefix at the first call that failed, leaves the rest not executed, and ends as tools-failing after the declared count', async () => {
    const { loop, done } = run([
      { artifact: plan([call('flaky'), call('update_item', { id: 'i1' })]) },
      { artifact: plan([call('flaky')]) },
    ]);
    const ended = await done;
    expect(ended.steps[0]?.calls.map((c) => [c.tool, c.outcome])).toEqual([['flaky', 'failed']]);
    expect(loop.starts[1]?.goal).toContain('not-executed (proposed, did not run): update_item');
    expect(loop.starts[1]?.goal).toContain('after flaky failed at call.1');
    expect(ended.ending?.cause).toBe('tools-failing');
  });

  it('[TSS-3] a loop fault counts against its rail and the step says so; a cut plan runs up to the cut; a stop signal ends the session before the next step', async () => {
    const faulting = () => {
      throw new LoopUnreachable('down');
    };
    const faulted = run([faulting, faulting]);
    const ended = await faulted.done;
    expect(ended.steps.map((step) => step.fault)).toEqual([
      'LoopUnreachable: the quality loop is unreachable: down',
      'LoopUnreachable: the quality loop is unreachable: down',
    ]);
    expect(ended.ending?.cause).toBe('loop-faulted');

    const cut = run([
      {
        artifact: plan([call('list_items'), call('update_item', { id: 'i1' })]),
        finalDecision: 'escalate',
        validation: [
          {
            validatorId: 'limits',
            gate: 'cut',
            problems: [{ severity: 'high', message: 'no note', locationRefs: ['call.2'] }],
          },
        ],
      },
      { artifact: finishing },
    ]);
    const cutEnded = await cut.done;
    expect(cutEnded.steps[0]).toMatchObject({ executable: true, executePrefix: 1 });
    expect(cutEnded.steps[0]?.calls.map((c) => c.tool)).toEqual(['list_items']);
    expect(cut.loop.starts[1]?.goal).toContain('- call.2 — no note');

    const controller = new AbortController();
    const stopping = run(
      [{ artifact: plan([call('list_items')]) }, { artifact: finishing }],
      new FakeOperator(),
      {},
      controller.signal,
    );
    controller.abort();
    const stoppedEnded = await stopping.done;
    expect(stoppedEnded.ending?.cause).toBe('stop-signal');
    expect(stoppedEnded.status).toBe('stopped');
  });

  it('[TSS-3] a rubric the loop cannot derive ends the session failed before any step, and the step limit ends one that never finishes', async () => {
    const loop = new FakeLoopClient([], criteria, new Error('no model'));
    const deps = fakeDeps(loop, tools());
    const settings = sampleSettings();
    const failed = await runSession(deps, {
      record: record(),
      rails: settings.rails,
      settings,
      signal: new AbortController().signal,
    });
    expect(failed.status).toBe('failed');
    expect(failed.ending).toMatchObject({ cause: 'error', detail: 'Error: no model' });
    expect(failed.steps).toEqual([]);

    const endless = run(
      Array.from({ length: 10 }, () => ({ artifact: plan([call('list_items')]) })),
      new FakeOperator(),
      { maxSteps: 3 },
    );
    const limited = await endless.done;
    expect(limited.steps).toHaveLength(3);
    expect(limited.ending).toMatchObject({ cause: 'step-limit', detail: '3 steps taken' });
  });
});
