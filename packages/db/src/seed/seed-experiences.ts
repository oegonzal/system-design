import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EntityManager } from '@mikro-orm/postgresql';
import type * as Contracts from '@sysdesign/contracts';

import { ExperienceProfile } from '../entities/experience-profile.entity';

/** A fixture row: an experience as the API serves it, less the moment it was seeded. */
type FixtureRow = Omit<Contracts.ExperienceProfileDto, 'createdAt'>;

/**
 * The experience fixture, read and checked: every row the seed writes, in
 * fixture order. It fails loudly rather than half-seeding: the prompt pipeline
 * writes from the prose, so a row with no highlights would surface later as a
 * thin prompt. A row that declares no origin or no practice lines, or an
 * origin the vocabulary lacks, the table refuses itself: neither column has a
 * default, and its check admits only the vocabulary's origins.
 */
export function experienceFixture(): FixtureRow[] {
  const rows = JSON.parse(
    readFileSync(join(__dirname, 'experiences.fixture.json'), 'utf8'),
  ) as FixtureRow[];
  const bad = rows.filter(
    (row) =>
      !row.id ||
      !row.slug ||
      !row.title ||
      row.techStack.length === 0 ||
      row.highlights.length === 0,
  );
  if (bad.length > 0) {
    throw new Error(`fixture has ${bad.length} invalid row(s), first slug=${bad[0]?.slug}`);
  }
  return rows;
}

/**
 * Upserts the experience fixture and answers how many rows it wrote — the one
 * seeder, for `pnpm db:seed` and for the studio's own test harness alike, so
 * a database each seeds holds the same rows.
 *
 * Idempotent: `upsertMany` keys on the primary key and the fixture pins its
 * UUIDs, so re-running updates every row in place, a database seeded by an
 * earlier fixture converging on this one; nothing is deleted. Every row goes
 * in one statement, so a row the table refuses writes none. `upsertMany`
 * takes plain data, so property initializers never run — `createdAt` is
 * supplied here, and excluded from the conflict update so re-seeding
 * refreshes content without rewriting history. A row already managed by `em`
 * is assigned rather than written, which the flush writes.
 */
export async function seedExperiences(em: EntityManager): Promise<number> {
  const rows = experienceFixture();
  await em.upsertMany(
    ExperienceProfile,
    rows.map((row) => ({ ...row, createdAt: new Date() })),
    { onConflictExcludeFields: ['createdAt'] },
  );
  await em.flush();
  return rows.length;
}
