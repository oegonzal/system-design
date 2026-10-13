export interface SavedViewInput {
  name: string;
  /** A path with its query, beginning with one `/`. */
  href: string;
}

export interface SavedViewRecord extends SavedViewInput {
  id: string;
  profileId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Saved views by profile; a name is kept once within a profile. */
export interface SavedViewRepository {
  /** Ordered by name. */
  listByProfile(profileId: string): Promise<SavedViewRecord[]>;
  /** Saved under its name: a name already kept takes the new address and keeps its id and its first day. */
  save(profileId: string, input: SavedViewInput, at: Date): Promise<SavedViewRecord>;
  remove(id: string): Promise<boolean>;
}
