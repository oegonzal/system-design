import type {
  ApiErrorResponse,
  AnswerInterviewResponse,
  GetInterviewResponse,
  GetRevisionResponse,
  GetSessionResponse,
  StartInterviewTurnResponse,
  StartQualityRunRequest,
} from '@sysdesign/contracts';
import {
  firstSection,
  interviewTurnRubric,
  INTERVIEW_PIPELINE_ID,
  PRACTICE_FORMATS,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { deepDiveTargets } from './deep-dive-targets';
import { call, useHarness } from '../../test/harness';
import { authoredPrompt, promptsApi } from '../../test/prompts';
import { sessionsApi, submission, validBrief } from '../../test/sessions';

describe('interview mode', () => {
  const h = useHarness();

  const interviewSession = async () => {
    const { author } = promptsApi(h);
    const { body } = await author({ ...authoredPrompt(), format: 'interview' });
    const prompt = body.data;
    const { body: created } = await sessionsApi(h).createSession(prompt.id);
    return { prompt, sessionId: created.data.id };
  };
  const read = (sessionId: string) =>
    call<GetInterviewResponse>(`${h.url}/sessions/${sessionId}/interview`);
  const post = <T>(sessionId: string, path: string, body?: unknown) =>
    call<T>(`${h.url}/sessions/${sessionId}/interview/${path}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const outputOf = (request: StartQualityRunRequest | undefined) =>
    (
      request as
        | { output?: { transcript?: { turns: unknown[]; phases: { endedAt: string | null }[] } } }
        | undefined
    )?.output;

  it('[UX-27] [DEL-10] the candidate sees the first section and no criterion until the interviewer’s claimed reply discloses one; the reply is claimed once', async () => {
    const { prompt, sessionId } = await interviewSession();
    expect(prompt.criteria.length).toBeGreaterThan(2);

    const { body: session } = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
    expect(session.data.view).toEqual({
      markdown: firstSection(prompt.markdown),
      criteria: [],
      withheld: prompt.criteria.length,
    });
    expect((await read(sessionId)).body.data).toMatchObject({
      phase: 'clarify',
      turns: [],
      pending: null,
    });

    const started = await post<StartInterviewTurnResponse>(sessionId, 'clarify', {
      questions: ['How fast must reads be?', 'Do we need returns?'],
    });
    expect(started.status).toBe(202);
    expect(started.body.data).toEqual({ runId: 'fake-run-1', status: 'running' });
    const request = h.loop.startRequests[0];
    expect(request).toMatchObject({
      pipeline: INTERVIEW_PIPELINE_ID,
      maxIterations: 1,
      criteria: interviewTurnRubric(),
    });
    expect(request?.goal).toContain('## Interviewer notes');
    expect(request?.goal).toContain(prompt.markdown.trim());
    expect(request?.goal).toContain(`- ${prompt.criteria[0]?.id} (${prompt.criteria[0]?.kind}):`);
    expect(request?.goal).toContain('[question.1] How fast must reads be?');
    expect(request?.goal).toContain('[question.2] Do we need returns?');
    expect(request?.goal).toContain('## Index');

    const pending = (await read(sessionId)).body.data;
    expect(pending.pending).toEqual({ runId: 'fake-run-1', status: 'running', error: null });
    expect(pending.turns.map((turn) => [turn.role, turn.text])).toEqual([
      ['candidate', 'How fast must reads be?'],
      ['candidate', 'Do we need returns?'],
      ['interviewer', ''],
    ]);
    // One interviewer at a time.
    const again = await post<ApiErrorResponse>(sessionId, 'clarify', { questions: ['And?'] });
    expect(again.status).toBe(409);

    const disclosed = prompt.criteria[0]?.id ?? '';
    h.loop.complete('fake-run-1', [
      {
        overall: 82,
        decision: 'accept',
        artifact: {
          replies: [
            { to: 'question.1', text: 'Within 300 ms at p99.', disclosesCriterionIds: [disclosed] },
            {
              to: 'question.2',
              text: 'The problem does not specify returns.',
              disclosesCriterionIds: [],
            },
          ],
        },
      },
    ]);
    const claimed = (await read(sessionId)).body.data;
    expect(claimed.pending).toBeNull();
    expect(claimed.turns[2]).toMatchObject({
      role: 'interviewer',
      text: '1. Within 300 ms at p99.\n2. The problem does not specify returns.',
      disclosesCriterionIds: [disclosed],
      runId: 'fake-run-1',
      decision: 'accept',
      overall: 82,
    });
    expect((await read(sessionId)).body.data.turns).toEqual(claimed.turns);

    const { body: after } = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
    expect(after.data.view.criteria.map((criterion) => criterion.id)).toEqual([disclosed]);
    expect(after.data.view.withheld).toBe(prompt.criteria.length - 1);
  });

  it('[UX-27] [DEL-9] [DEL-10] the clock moves on declared events, the deep dive probes the unbound criteria in declared order, and the submit carries the transcript', async () => {
    const { prompt, sessionId } = await interviewSession();
    const advanced = await post<GetInterviewResponse>(sessionId, 'advance');
    expect(advanced.status).toBe(200);
    expect(advanced.body.data.phase).toBe('design');
    expect(advanced.body.data.phases.map((phase) => [phase.id, phase.endedAt !== null])).toEqual([
      ['clarify', true],
      ['design', false],
    ]);

    // The draft binds c2 and c3; the probes go to what it has not bound first.
    const bound = ['c2', 'c3'];
    const draft = {
      graph: submission().graph,
      brief: {
        ...validBrief(),
        bindings: bound.map((criterionId) => ({ criterionId, nodeIds: [], claim: '' })),
      },
      narrative: null,
    };
    await call(`${h.url}/sessions/${sessionId}/draft`, {
      method: 'PUT',
      body: JSON.stringify(draft),
    });
    const probe = await post<StartInterviewTurnResponse>(sessionId, 'probe');
    expect(probe.status).toBe(202);
    const expected = deepDiveTargets(prompt.criteria, bound, PRACTICE_FORMATS.interview);
    expect(expected).toHaveLength(PRACTICE_FORMATS.interview.probes);
    expected.forEach((criterion, index) => {
      expect(h.loop.startRequests[0]?.goal).toContain(`[target.${index + 1}] ${criterion.id} (`);
    });
    expect((await read(sessionId)).body.data.phase).toBe('deep-dive');

    const answered = await post<AnswerInterviewResponse>(sessionId, 'answer', {
      text: 'The outbox table makes the webhook idempotent.',
    });
    expect(answered.status).toBe(201);
    expect(answered.body.data).toMatchObject({ role: 'candidate', phase: 'deep-dive' });

    h.loop.complete('fake-run-1', [
      {
        overall: 70,
        decision: 'revise',
        artifact: {
          replies: [
            {
              to: 'target.1',
              text: 'What happens when the same order arrives twice?',
              disclosesCriterionIds: [expected[0]?.id ?? ''],
            },
          ],
        },
      },
    ]);
    const state = (await read(sessionId)).body.data;
    expect(state.turns.map((turn) => turn.role)).toEqual(['interviewer', 'candidate']);
    expect(state.turns[0]?.text).toBe('What happens when the same order arrives twice?');

    const graded = await sessionsApi(h).submit(sessionId, submission());
    expect(graded.status).toBe(201);
    const transcript = outputOf(h.loop.startRequests[1])?.transcript;
    expect(transcript?.turns).toHaveLength(2);
    expect(transcript?.phases.map((phase) => phase.endedAt !== null)).toEqual([true, true, true]);
    const { body: revision } = await call<GetRevisionResponse>(
      `${h.url}/revisions/${graded.body.data.id}`,
    );
    expect(revision.data.transcript?.turns).toHaveLength(2);
    // Submitted: the whole prompt is the candidate's to read beside the grade.
    const { body: session } = await call<GetSessionResponse>(`${h.url}/sessions/${sessionId}`);
    expect(session.data.view).toEqual({
      markdown: prompt.markdown,
      criteria: prompt.criteria,
      withheld: 0,
    });
    expect((await read(sessionId)).body.data.phase).toBe('deep-dive');
  });

  it('[UX-27] a run that left no reply is claimed as such; a session practised without an interviewer takes no turn; a body is validated', async () => {
    const { sessionId } = await interviewSession();
    await post(sessionId, 'clarify', { questions: ['Anything?'] });
    h.loop.fail('fake-run-1', 'the model went away');
    const state = (await read(sessionId)).body.data;
    expect(state.pending).toBeNull();
    expect(state.turns[1]).toMatchObject({
      role: 'interviewer',
      text: '(no reply — the model went away)',
      decision: null,
    });
    expect((await post<ApiErrorResponse>(sessionId, 'clarify', { questions: [] })).status).toBe(
      400,
    );

    const plain = await sessionsApi(h).startSession();
    expect(
      (await post<ApiErrorResponse>(plain.sessionId, 'clarify', { questions: ['?'] })).status,
    ).toBe(409);
    expect((await post<ApiErrorResponse>(plain.sessionId, 'probe')).status).toBe(409);
    const { body } = await call<GetSessionResponse>(`${h.url}/sessions/${plain.sessionId}`);
    expect(body.data.view.withheld).toBe(0);
    expect((await read(plain.sessionId)).body.data).toMatchObject({ phase: null, phases: [] });
  });

  it('[UX-27] a prompt for a section-revealing format needs two sections to be written, imported or rewritten into', async () => {
    const { author } = promptsApi(h);
    const refused = await author({
      ...authoredPrompt(),
      format: 'interview',
      markdown: '# Only a title\n\nNo sections at all.',
    });
    expect(refused.status).toBe(422);
    const { body } = await author({ ...authoredPrompt(), format: 'interview' });
    const rewrite = await call<ApiErrorResponse>(`${h.url}/prompts/${body.data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ markdown: '# One\n\n## Section\n\nonly' }),
    });
    expect(rewrite.status).toBe(422);
  });
});
