/**
 * A tool session on the wire: how a mission names one. The record a session
 * leaves and what starts one arrive with the program that keeps them.
 */
import { excerpt } from '../text';

/** How much of a mission names a session: its first line of prose, excerpted. */
export const SESSION_TITLE_MAX_LENGTH = 200;

/** The session's title: the mission's first line of prose, excerpted — its headings say nothing a reader does not know. */
export function sessionTitleOf(mission: string): string {
  const line = mission
    .split('\n')
    .map((each) => each.trim())
    .find((each) => each !== '' && !each.startsWith('#'));
  return excerpt(line ?? mission.trim(), SESSION_TITLE_MAX_LENGTH);
}
