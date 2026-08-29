/**
 * The profile registry. `ACTIVE_PROFILE` is what the worker grades with;
 * every evaluation records the profile it ran under, so persisted history
 * stays explicable as the rubric evolves.
 */
import type { EvalProfile } from '../core/profile';
import { DEFAULT_PROFILE } from './default.profile';

export const PROFILES: readonly EvalProfile[] = [DEFAULT_PROFILE];

export const ACTIVE_PROFILE: EvalProfile = DEFAULT_PROFILE;

export function resolveProfile(id: string, version: string): EvalProfile | undefined {
  return PROFILES.find((profile) => profile.id === id && profile.version === version);
}
