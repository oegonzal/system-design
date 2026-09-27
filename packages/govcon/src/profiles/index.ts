import type { SearchProfile } from '../core/profile';
import { ENFAV } from './enfav';

/**
 * Every profile the CLI may be asked for, by id. A new company is a new file
 * and one line here; the service validates each at boot.
 */
export const PROFILES: ReadonlyMap<string, SearchProfile> = new Map([[ENFAV.id, ENFAV]]);
export const DEFAULT_PROFILE_ID = ENFAV.id;
