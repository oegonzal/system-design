import type { SearchProfile } from '@sysdesign/contracts';

/** A profile as the store holds it: the validated document and what the store knows about it. */
export interface ProfileRecord {
  profile: SearchProfile;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Profiles by slug. Writes take a document the service has already
 * validated; the store never sees an unvalidated one. Exactly one row is the
 * default while any exists; `setDefault` moves it in one transaction.
 */
export interface ProfileRepository {
  list(): Promise<ProfileRecord[]>;
  find(id: string): Promise<ProfileRecord | null>;
  findDefault(): Promise<ProfileRecord | null>;
  count(): Promise<number>;
  /** `null` when the id is taken. */
  insert(profile: SearchProfile, isDefault: boolean, at: Date): Promise<ProfileRecord | null>;
  /** `null` when there is no such profile. */
  update(profile: SearchProfile, at: Date): Promise<ProfileRecord | null>;
  /** False when there was nothing to remove. */
  remove(id: string): Promise<boolean>;
  setDefault(id: string): Promise<boolean>;
}
