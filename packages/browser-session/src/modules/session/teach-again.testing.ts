import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DOCUMENT_MEMORY_ORCHESTRATOR_ID,
  type OperatorGuidanceDto,
  type OrchestrationRunDto,
  type OrchestrationStepDto,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import type { BrainPort, SessionStepRef, TeachReceipt } from '../../core/ports';
import type { TeachAgainDeps } from './teach-again';

/**
 * What the teach-again spec runs over: the deps over a fake loop and a brain
 * that queues every document on it as the loop-backed brain does — each
 * answer's receipt naming the one orchestration, each settling stored on the
 * first poll's sleep, its digest step as given — or answers the receipts
 * scripted, one per answer in turn, as a memory-backed brain would; what was
 * handed, linked and said, recorded. No vitest import.
 */

/** One teach as the fake brain took it. */
export interface Taught {
  answers: OperatorGuidanceDto[];
  session: SessionStepRef;
  subject: string;
}

export const running = (loop: FakeLoop): OrchestrationRunDto[] =>
  [...loop.orchestrations.records.values()].filter((record) => record.status === 'running');

export function harness(digest: Partial<OrchestrationStepDto> = {}, receipts: TeachReceipt[] = []) {
  const loop = new FakeLoop();
  const taught: Taught[] = [];
  const linked: { decisionIds: string[]; ref: string }[] = [];
  const logged: string[] = [];
  const scripted = [...receipts];
  let digests = 0;
  const brain: Pick<BrainPort, 'teach'> = {
    teach: async (answers, session, subject) => {
      taught.push({ answers: [...answers], session, subject });
      if (scripted.length >= answers.length)
        return answers.map(() => scripted.shift() as TeachReceipt);
      const { orchestrationRunId } = loop.orchestrations.start(DOCUMENT_MEMORY_ORCHESTRATOR_ID, {
        goal: `${answers.length} answer(s) of ${subject}`,
      });
      return answers.map(() => ({ ref: orchestrationRunId, outcome: 'queued', fault: null }));
    },
  };
  const deps: TeachAgainDeps = {
    brain,
    loop: new FakeLoopClient(loop),
    ledger: {
      recordTeaching: async (decisionIds, ref) => {
        linked.push({ decisionIds: [...decisionIds], ref });
      },
    },
    subject: 'the configured subject',
    untaught: ['terminal'],
    log: (text) => logged.push(text),
    awaiting: {
      pollEveryMs: 0,
      staleAfterMs: 60_000,
      now: () => 0,
      sleep: async () => {
        const latest = running(loop).at(-1);
        if (latest === undefined) return;
        digests += 1;
        loop.orchestrations.complete(latest.orchestrationRunId, {
          digest: { runIds: [`d-new-${digests}`], counts: { memories: 3, kept: 3 }, ...digest },
          store: { counts: { chunks: 3 } },
        });
      },
    },
  };
  return { loop, deps, taught, linked, logged };
}

/** The questions a teach was handed, in order. */
export const questions = (call: Taught | undefined): string[] =>
  call?.answers.map((answer) => answer.field.question) ?? [];

/** A tasks file with one unit of work open over the steps given. */
export const tasksFile = (dump: string, startStep: number, endStep: number | null) =>
  writeFile(
    join(dump, '02-tasks.json'),
    JSON.stringify([
      { id: 'task-acme', facets: [{ name: 'company', value: 'Acme' }], startStep, endStep },
    ]),
  );
