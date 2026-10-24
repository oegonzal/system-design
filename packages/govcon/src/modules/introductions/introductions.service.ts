import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  bestIterationOf,
  INTRODUCTION_NOTE_ITERATIONS,
  INTRODUCTION_NOTE_PIPELINE_ID,
  introductionNoteOutputSchema,
  introductionNoteRubric,
  renderIntroduction,
  type IntroductionDto,
  type IntroductionStartedDto,
  type Target,
} from '@sysdesign/contracts';
import { bestArtifact, LoopClient } from '@sysdesign/loop-client';

import { composeIntroductionGoal, introductionReaderOf } from '../../core/introductions/compose';
import type { TargetKey } from '../../core/ports';
import { ProfilesService } from '../profiles/profiles.service';
import { CLOCK } from '../sources/tokens';
import { SpendingService } from '../spending/spending.service';
import { TargetsService } from '../targets/targets.service';
import type { StartIntroductionBody } from './introduction-requests';
import { answer } from './loop-exceptions';

const pending = (runId: string): IntroductionDto => ({
  runId,
  status: 'pending',
  note: null,
  decision: null,
  overall: null,
  reason: null,
});

const failed = (runId: string, reason: string): IntroductionDto => ({
  runId,
  status: 'failed',
  note: null,
  decision: null,
  overall: null,
  reason,
});

/**
 * An introduction drafted by the quality loop for a tracked firm or award
 * about one program: the goal composed from the target, the award's record
 * and the profile's own words, the run started under the four fixed rules,
 * and the note read back by the run's id — logged on the target once, the
 * first time it is read ready, so the person sends it and logs the sending
 * themselves. Nothing here reads a source: the award is the snapshot the
 * spending lens keeps.
 */
@Injectable()
export class IntroductionsService {
  constructor(
    private readonly targets: TargetsService,
    private readonly spending: SpendingService,
    private readonly profiles: ProfilesService,
    private readonly loop: LoopClient,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async start(request: StartIntroductionBody): Promise<IntroductionStartedDto> {
    const key = { kind: request.kind, subject: request.subject };
    const target = await this.tracked(key);
    const award = await this.spending.award(request.awardExternalId);
    const profile = await this.profiles.resolve(request.profile);
    const goal = composeIntroductionGoal({
      company: profile.company,
      introduction: profile.introduction,
      target,
      award,
    });
    const started = await answer(() =>
      this.loop.startRun({
        pipeline: INTRODUCTION_NOTE_PIPELINE_ID,
        goal,
        criteria: introductionNoteRubric(),
        maxIterations: INTRODUCTION_NOTE_ITERATIONS,
      }),
    );
    return { runId: started.runId };
  }

  /** The run as it stands: pending while it runs, the note once it is ready, why not when it failed. */
  async read(runId: string, key: TargetKey): Promise<IntroductionDto> {
    const target = await this.tracked(key);
    const run = await answer(() => this.loop.getRun(runId));
    if (run === null) throw new NotFoundException(`no introduction run ${runId}`);
    if (run.status === 'running') return pending(runId);
    if (run.status === 'failed') return failed(runId, run.error?.message ?? 'the run failed');
    const note = bestArtifact(run, introductionNoteOutputSchema);
    if (note === null) return failed(runId, 'the run produced no readable note');
    const award = await this.spending.award(key.kind === 'award' ? key.subject : target.subject);
    const best = bestIterationOf(run);
    await this.logged(key, target, runId, note.subject);
    return {
      runId,
      status: 'ready',
      note: renderIntroduction(note, introductionReaderOf(target, award)),
      decision: best?.decision.finalDecision ?? null,
      overall: best?.decision.scores.overall ?? null,
      reason: null,
    };
  }

  private async tracked(key: TargetKey): Promise<Target> {
    const target = await this.targets.get(key);
    if (target === null) throw new NotFoundException(`no ${key.kind} target ${key.subject}`);
    return target;
  }

  /** The draft on the target's log, once per run: a later read of the same run adds nothing. */
  private async logged(
    key: TargetKey,
    target: Target,
    runId: string,
    subject: string,
  ): Promise<void> {
    if (target.activity.some((entry) => entry.kind === 'drafted' && entry.ref === runId)) return;
    await this.targets.save(key, {
      label: target.label,
      stage: target.stage,
      activity: [
        ...target.activity,
        { at: this.now().toISOString(), kind: 'drafted', summary: subject, ref: runId },
      ],
    });
  }
}
