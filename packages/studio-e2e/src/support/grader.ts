import type { APIRequestContext } from '@playwright/test';
import type { PromptDto } from '@sysdesign/contracts';
import type { RunScenario } from '@sysdesign/studio-testing';

import { authorPrompt, AUTHORED_MARKDOWN, AUTHORED_TITLE } from './backend';
import { uniqueName } from './unique';

/**
 * Typed helpers over the stub grader's control routes. A run's scenario is
 * keyed by its goal — the prompt's markdown — so a test that wants its own
 * run to fail authors a prompt whose title is unique to it (`keyedPrompt`)
 * and scripts that goal; every other test's runs are untouched. The health
 * switch has no such key: it is global, and only the serial `grader-down`
 * project may flip it.
 */

export const GRADER_URL = `http://127.0.0.1:${process.env['QUALITY_LOOP_STUB_PORT'] ?? '3103'}`;

async function ok(
  response: Promise<{ ok(): boolean; status(): number; url(): string }>,
): Promise<void> {
  const answer = await response;
  if (!answer.ok()) throw new Error(`${answer.url()} → ${answer.status()}`);
}

export const scenarioFor = (
  request: APIRequestContext,
  goal: string,
  scenario: RunScenario,
): Promise<void> =>
  ok(request.post(`${GRADER_URL}/__stub/scenarios`, { data: { goal, scenario } }));

export const clearScenarios = (request: APIRequestContext): Promise<void> =>
  ok(request.delete(`${GRADER_URL}/__stub/scenarios`));

export const setGraderUnreachable = (
  request: APIRequestContext,
  unreachable: boolean,
): Promise<void> => ok(request.put(`${GRADER_URL}/__stub/health`, { data: { unreachable } }));

export interface GraderRequests {
  /** Every run started, oldest first, by the id the studio polls it under. */
  startRequests: {
    runId: string;
    pipeline: string;
    goal: string;
    adopt: { runId: string; iteration: number } | null;
  }[];
  criteriaRequests: { pipeline: string; goal: string }[];
}

export async function graderRequests(request: APIRequestContext): Promise<GraderRequests> {
  const response = await request.get(`${GRADER_URL}/__stub/requests`);
  if (!response.ok()) throw new Error(`${response.url()} → ${response.status()}`);
  return (await response.json()) as GraderRequests;
}

/**
 * The authored prompt with a title no other test produces, so its markdown —
 * every run's goal — is this test's alone while the rubric stays `c1…c5`
 * (the title line yields no criterion).
 */
export function keyedPrompt(request: APIRequestContext, label: string): Promise<PromptDto> {
  const title = uniqueName(label);
  return authorPrompt(request, {
    title,
    markdown: AUTHORED_MARKDOWN.replace(`# ${AUTHORED_TITLE}`, `# ${title}`),
  });
}
