import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  GoalBudgetExceeded,
  INTERVIEW_PIPELINE_ID,
  INTERVIEW_TURN_ITERATIONS,
  interviewTurnOutputSchema,
  interviewTurnRubric,
  modelSchema,
  parseLenient,
  practiceFormat,
  type AnswerRequest,
  type ClarifyRequest,
  type InterviewPendingDto,
  type InterviewStateDto,
  type InterviewTurnDto,
  type InterviewTurnStartedDto,
  type PhaseAdvance,
  type PracticeFormat,
  type QualityRunDto,
} from '@sysdesign/contracts';
import { DesignRevision, DesignSession, InterviewTurn, Prompt } from '@sysdesign/db';

import { notFound } from '../../common/not-found';
import { QualityLoopClient } from '../quality-loop/quality-loop.client';
import { SessionsService } from '../sessions/sessions.service';
import { deepDiveTargets } from './deep-dive-targets';
import { renderInterviewGoal, type InterviewItem } from './interview-goal';
import { toInterviewState, toInterviewTurnDto } from './interview.mapper';
import { advancePhase } from './session-phase';
import { toTranscriptTurn } from './transcript';

/** The reply's declared bounds, indexed once: what a claim measures the run's fields against. */
const REPLY_BOUNDS = modelSchema(interviewTurnOutputSchema).bounds;

/** What an interviewer turn records when its run left no reply to claim. */
const NO_REPLY = (why: string): string => `(no reply — ${why})`;

/**
 * The interviewer, as a sequence of quality-loop runs. A clarify round
 * stores the candidate's questions and one interviewer turn pointing at the
 * run that answers them; a probe stores one interviewer turn pointing at the
 * run that asks about what the design has not addressed; a read claims the
 * pending turn's reply once by its run id, as a generation claims its draft.
 * Every write goes under the session's lock and the session's own rules —
 * open, nothing else pending — and a loop that refuses leaves nothing
 * behind. The clock moves only on the events the format declares.
 */
@Injectable()
export class InterviewService {
  constructor(
    private readonly em: EntityManager,
    private readonly loop: QualityLoopClient,
    private readonly sessions: SessionsService,
  ) {}

  async state(sessionId: string): Promise<InterviewStateDto> {
    const session = await this.require(sessionId);
    const pending = await this.claimPending(session);
    return toInterviewState(session, await this.turnsOf(session.id, true), pending);
  }

  /** The candidate's questions, answered by one run: 202 with the run; the turns are stored with it. */
  clarify(sessionId: string, request: ClarifyRequest): Promise<InterviewTurnStartedDto> {
    return this.sessions.withSessionLock(sessionId, async (em, session, prompt) => {
      const format = this.interviewFormat(prompt);
      this.sessions.assertSessionOpen(session, prompt);
      const turns = await this.turnsOf(session.id, false, em);
      this.assertNothingPending(turns);
      const items: InterviewItem[] = request.questions.map((text) => ({
        kind: 'question',
        text,
      }));
      const started = await this.startTurn(prompt, turns, items);
      const phase = session.phase ?? format.phases[0]?.id ?? '';
      let ordinal = turns.at(-1)?.ordinal ?? 0;
      for (const text of request.questions) {
        em.persist(
          em.create(InterviewTurn, { session, ordinal: ++ordinal, phase, role: 'candidate', text }),
        );
      }
      em.persist(
        em.create(InterviewTurn, {
          session,
          ordinal: ++ordinal,
          phase,
          role: 'interviewer',
          runId: started.runId,
        }),
      );
      return started;
    });
  }

  /**
   * The deep dive: the interviewer probes the criteria the design has not
   * bound, chosen without a model; the clock advances on it where the format
   * says so. Refused when the rubric has nothing left to probe.
   */
  probe(sessionId: string): Promise<InterviewTurnStartedDto> {
    return this.sessions.withSessionLock(sessionId, async (em, session, prompt) => {
      const format = this.interviewFormat(prompt);
      this.sessions.assertSessionOpen(session, prompt);
      const turns = await this.turnsOf(session.id, false, em);
      this.assertNothingPending(turns);
      const bound = await this.boundCriterionIds(em, session);
      const targets = deepDiveTargets(prompt.criteria, bound, format);
      if (targets.length === 0) {
        throw new ConflictException('the rubric has nothing left for the interviewer to probe');
      }
      const items: InterviewItem[] = targets.map((criterion) => ({
        kind: 'target',
        text: `${criterion.id} (${criterion.kind}): ${criterion.statement} — ${bound.has(criterion.id) ? 'the design binds it; probe how well' : 'the design has not addressed it'}`,
      }));
      const started = await this.startTurn(prompt, turns, items);
      this.move(session, format, 'probe');
      em.persist(
        em.create(InterviewTurn, {
          session,
          ordinal: (turns.at(-1)?.ordinal ?? 0) + 1,
          phase: session.phase ?? '',
          role: 'interviewer',
          runId: started.runId,
        }),
      );
      return started;
    });
  }

  /** The candidate's answer, in the current phase; 201 with the turn. */
  answer(sessionId: string, request: AnswerRequest): Promise<InterviewTurnDto> {
    return this.sessions.withSessionLock(sessionId, async (em, session, prompt) => {
      this.interviewFormat(prompt);
      this.sessions.assertSessionOpen(session, prompt);
      const turns = await this.turnsOf(session.id, false, em);
      const turn = em.create(InterviewTurn, {
        session,
        ordinal: (turns.at(-1)?.ordinal ?? 0) + 1,
        phase: session.phase ?? '',
        role: 'candidate',
        text: request.text,
      });
      em.persist(turn);
      return toInterviewTurnDto(turn);
    });
  }

  /** The author moves on; the clock advances where the current phase declares it. */
  async advance(sessionId: string): Promise<InterviewStateDto> {
    await this.sessions.withSessionLock(sessionId, async (_em, session, prompt) => {
      const format = this.interviewFormat(prompt);
      this.sessions.assertSessionOpen(session, prompt);
      this.move(session, format, 'advance');
    });
    return this.state(sessionId);
  }

  private move(session: DesignSession, format: PracticeFormat, event: PhaseAdvance): void {
    Object.assign(session, advancePhase(session, format, event, new Date()));
  }

  /** The format, when it has an interviewer; 409 for a session practised without one. */
  private interviewFormat(prompt: Prompt): PracticeFormat {
    const format = practiceFormat(prompt.format);
    if (format.phases.length === 0) {
      throw new ConflictException(
        `this session is practised as ${format.label.toLowerCase()}, which has no interviewer`,
      );
    }
    return format;
  }

  private assertNothingPending(turns: readonly InterviewTurn[]): void {
    if (turns.some((turn) => turn.runId !== null && turn.claimedAt === null)) {
      throw new ConflictException('the interviewer is still answering — read the interview first');
    }
  }

  private async startTurn(
    prompt: Prompt,
    turns: readonly InterviewTurn[],
    items: readonly InterviewItem[],
  ): Promise<InterviewTurnStartedDto> {
    let goal: string;
    try {
      goal = renderInterviewGoal({
        title: prompt.title,
        markdown: prompt.markdown,
        criteria: prompt.criteria,
        turns: turns.flatMap((turn) => {
          const mapped = toTranscriptTurn(turn);
          return mapped === null ? [] : [mapped];
        }),
        items,
      });
    } catch (error) {
      if (error instanceof GoalBudgetExceeded) {
        throw new UnprocessableEntityException(
          `the interview has grown past what the interviewer can read: ${error.message}`,
        );
      }
      throw error;
    }
    const started = await this.loop.startRun({
      pipeline: INTERVIEW_PIPELINE_ID,
      goal,
      criteria: interviewTurnRubric(),
      maxIterations: INTERVIEW_TURN_ITERATIONS,
    });
    return { runId: started.runId, status: started.status };
  }

  /** The criteria the author's current brief binds: the draft's, or the latest revision's when nothing is drafted. */
  private async boundCriterionIds(em: EntityManager, session: DesignSession): Promise<Set<string>> {
    const drafted = session.draft?.brief?.bindings;
    if (drafted !== undefined) {
      return new Set(drafted.map((binding) => binding.criterionId).filter((id) => id.length > 0));
    }
    const latest = await em.findOne(
      DesignRevision,
      { session: session.id, origin: 'user' },
      { orderBy: { revisionNumber: 'desc' } },
    );
    return new Set((latest?.brief?.bindings ?? []).map((binding) => binding.criterionId));
  }

  /**
   * The pending interviewer turn, claimed once its run has finished: the
   * run's best reply is read leniently and written under a conditional
   * update, so two concurrent reads store it once. A run the loop lost, or
   * that left no reply, is claimed with a note saying so — the turn stands
   * in the transcript as what happened. While the run is running, what the
   * loop reports.
   */
  private async claimPending(session: DesignSession): Promise<InterviewPendingDto | null> {
    const turn = await this.em.findOne(InterviewTurn, {
      session: session.id,
      role: 'interviewer',
      claimedAt: null,
      runId: { $ne: null },
    });
    if (turn === null || turn.runId === null) return null;
    const run = await this.loop.getRun(turn.runId);
    if (run === null) {
      await this.claim(turn, NO_REPLY('the grader has no record of this turn'), [], null, null);
      return null;
    }
    if (run.status === 'running') return { runId: turn.runId, status: 'running', error: null };
    if (run.status === 'failed' || run.trace === null) {
      await this.claim(turn, NO_REPLY(run.error?.message ?? 'the run failed'), [], null, null);
      return null;
    }
    const best = bestIteration(run);
    const parsed = parseLenient(interviewTurnOutputSchema, best.artifact, REPLY_BOUNDS);
    if (!parsed.ok) {
      await this.claim(turn, NO_REPLY('the interviewer wrote nothing usable'), [], null, null);
      return null;
    }
    const replies = parsed.value.replies;
    const text =
      replies.length === 1
        ? replies[0].text
        : replies.map((reply, index) => `${index + 1}. ${reply.text}`).join('\n');
    const disclosed = [...new Set(replies.flatMap((reply) => reply.disclosesCriterionIds))];
    await this.claim(
      turn,
      text,
      disclosed,
      best.decision.finalDecision,
      best.decision.scores.overall,
    );
    return null;
  }

  private async claim(
    turn: InterviewTurn,
    text: string,
    disclosedCriterionIds: string[],
    decision: InterviewTurnDto['decision'],
    overall: number | null,
  ): Promise<void> {
    // 0 rows: a concurrent read claimed first; what it stored stands.
    await this.em.nativeUpdate(
      InterviewTurn,
      { id: turn.id, claimedAt: null },
      { text, disclosedCriterionIds, decision, overall, claimedAt: new Date() },
    );
  }

  private async turnsOf(
    sessionId: string,
    refresh: boolean,
    em: EntityManager = this.em,
  ): Promise<InterviewTurn[]> {
    return em.find(InterviewTurn, { session: sessionId }, { orderBy: { ordinal: 'asc' }, refresh });
  }

  private async require(sessionId: string): Promise<DesignSession> {
    const session = await this.em.findOne(DesignSession, sessionId, { populate: ['prompt'] });
    if (!session) throw notFound('session', `Session ${sessionId} not found`);
    return session;
  }
}

/** The iteration the loop crowned. */
const bestIteration = (run: QualityRunDto) => {
  const trace = run.trace;
  if (!trace) throw new Error(`run ${run.runId} has no trace`);
  return trace.iterations[trace.bestIteration - 1] ?? trace.iterations[trace.iterations.length - 1];
};
