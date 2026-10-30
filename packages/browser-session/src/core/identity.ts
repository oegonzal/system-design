import type { RunOpenerKind } from '@sysdesign/contracts';

/**
 * How a session names itself to every party it asks or tells: the loop it
 * opens runs on, the operator's channels, the advisors and the bus. One name,
 * so whoever filters by it finds all of a session's traffic.
 */
export const SESSION_KIND = 'browser-session' satisfies RunOpenerKind;
