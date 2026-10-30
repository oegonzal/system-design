import type { BrainPort } from '../../core/ports';

/**
 * Injection tokens for the engine's ports (interfaces vanish at runtime, so
 * Nest needs a value to key each provider on) and for the configuration the
 * module was composed with. The loop client is keyed by its own abstract
 * class, `LoopClient`, so the scripted run overrides it by that name.
 */
export const SESSION_CONFIG = Symbol('SESSION_CONFIG');
export const BROWSER = Symbol('BROWSER');
/** The brain for the tenant the environment names. */
export const BRAIN = Symbol('BRAIN');
/**
 * A brain for a tenant a command names instead — a verification tenant, say
 * — composed as the environment's is and bound by the command that asked;
 * under a brain that keeps its memories in no space, refused by name.
 */
export const BRAIN_FOR_TENANT = Symbol('BRAIN_FOR_TENANT');
export type BrainForTenant = (tenant: string) => BrainPort;
export const LEDGER = Symbol('LEDGER');
export const OPERATOR = Symbol('OPERATOR');
export const TERMINAL = Symbol('TERMINAL');
export const GOAL_SOURCE = Symbol('GOAL_SOURCE');
export const CLOCK = Symbol('CLOCK');
export const DUMP_STORE = Symbol('DUMP_STORE');
export const UNIT_ADVISORS = Symbol('UNIT_ADVISORS');
export const SESSION_EVENTS = Symbol('SESSION_EVENTS');
export const STOP_SIGNAL = Symbol('STOP_SIGNAL');
