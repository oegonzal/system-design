/**
 * `ACTIVE_PROFILE` is what the worker grades with; every evaluation records
 * the profile it ran under, so persisted history stays explicable as the
 * rubric evolves.
 */
import type { EvalProfile } from '../core/profile';
import { DEFAULT_PROFILE } from './default.profile';

export const ACTIVE_PROFILE: EvalProfile = DEFAULT_PROFILE;
