/**
 * The profile registry. `ACTIVE_PROFILE` is what the worker grades with;
 * older profiles stay resolvable so persisted evaluations remain explicable.
 */
import type { EvalProfile } from '../core/profile';
import { LEGACY_PROFILE } from './legacy.profile';

export const PROFILES: readonly EvalProfile[] = [LEGACY_PROFILE];

export const ACTIVE_PROFILE: EvalProfile = LEGACY_PROFILE;

export function resolveProfile(id: string, version: string): EvalProfile | undefined {
  return PROFILES.find((profile) => profile.id === id && profile.version === version);
}
