import {
  FIELD_ANSWER_PIPELINE_ID,
  routeFields,
  type Admission,
  type AnsweringSettings,
  type EvidenceItem,
  type FieldAnswers,
  type FieldReadout,
  type WithheldRef,
} from '@sysdesign/contracts';
import type { LoopClient } from '@sysdesign/loop-client';

import type { LoopBrainOptions } from '../../adapters/loop-http/loop-runs';
import { judgeFields } from '../../adapters/memory-loop/judged-form';
import type { FieldsInput } from '../../core/ports';
import type { MemoryBrainSettings } from '../../settings';

/**
 * What the replay asks of one page beyond recalling for it: the page's fields
 * judged again through the shipping judge and routed by the shipped answering
 * settings — the same call a live session makes, so the replay measures what
 * ships. The run is opened by the replay under its own id, never as the
 * recorded session, so a listing of that session's runs stays the session's;
 * the label names the session the page was recorded in.
 */

/** A page judged again: the run, its readout, and each field routed as a session would route it. */
export interface JudgedPage {
  runId: string;
  admission: Admission;
  withheld: readonly WithheldRef[];
  /** One readout per field, in the page's field order. */
  readouts: readonly FieldReadout[];
}

export async function judgePage(
  loop: LoopClient,
  settings: MemoryBrainSettings,
  answering: AnsweringSettings,
  input: FieldsInput,
  evidence: readonly EvidenceItem[],
  options: LoopBrainOptions,
  /** The replay's own id, which every run it opens is opened by. */
  replayId: string,
): Promise<JudgedPage> {
  const decided = await judgeFields<FieldAnswers>(
    loop,
    FIELD_ANSWER_PIPELINE_ID,
    input,
    evidence,
    settings.legend,
    { sessionId: replayId, step: input.session.step },
    `replay of ${input.session.sessionId}`,
    options,
  );
  const { run, admission, withheld } = decided;
  return {
    runId: decided.runId,
    admission,
    withheld,
    readouts: routeFields({ run, admission, withheld }, input.fields, answering),
  };
}
