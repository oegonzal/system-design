import { Migration } from '@mikro-orm/migrations';

/** Every origin, in the order the vocabulary declares them — the check is compared as text. */
const ORIGINS = ['own', 'practice'];
/** What a row reads as until the seed declares its origin: nothing undeclared is stated as the subject's. */
const UNDECLARED = 'practice';
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * An experience declares whose it is, and an own one keeps apart the lines it
 * carries only for practice. `origin` is `own` for the subject's own record
 * and `practice` for an example written to practise on; `practice_highlights`
 * holds the lines a prompt drawn from an own experience needs and the subject
 * never attested. The defaults stand only while the columns are added, so the
 * rows already there read as practice with no practice lines until the seed
 * declares them — a database migrated but not seeded states nothing as the
 * subject's — and the seed must name both for every row it writes.
 */
export class Migration20261014200002_experience_practice extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "experience_profile"
        add column "origin"              text   not null default '${UNDECLARED}',
        add column "practice_highlights" text[] not null default '{}';
    `);
    this.addSql(`
      alter table "experience_profile"
        alter column "origin"              drop default,
        alter column "practice_highlights" drop default;
    `);
    this.addSql(
      `alter table "experience_profile" add constraint "experience_profile_origin_check" check (origin in (${quoted(ORIGINS)}));`,
    );
  }

  override down(): void | Promise<void> {
    // The earlier table keeps every line among the highlights, the practice ones last, as its seed wrote them.
    this.addSql(
      `update "experience_profile" set "highlights" = "highlights" || "practice_highlights" where cardinality("practice_highlights") > 0;`,
    );
    this.addSql(
      `alter table "experience_profile" drop constraint if exists "experience_profile_origin_check";`,
    );
    this.addSql(
      `alter table "experience_profile" drop column "practice_highlights", drop column "origin";`,
    );
  }
}
