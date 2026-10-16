import type { Criterion } from './criterion';

/**
 * The tool session (packages/tool-session): a mission run as tool calls the
 * loop decides, over whatever tools a program declares.
 */
export const TOOL_SESSION_CRITERIA: readonly Criterion[] = [
  {
    id: 'TSS-1',
    statement:
      'A tool session says what happened on the bus under the source of the program that ran it — that it started, what each step did, how it ended — through three topics declared once in the contracts with strict payloads, so whichever program ran the session a subscriber reads one shape.',
  },
];
