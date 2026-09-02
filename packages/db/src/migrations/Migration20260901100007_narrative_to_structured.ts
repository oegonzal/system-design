import { Migration } from '@mikro-orm/migrations';

/**
 * The narrative stops being one free-text box and becomes a structured
 * walkthrough — an overview plus reference-anchored slots (component rationales
 * keyed to node ids, flow narrations keyed to functional-requirement ordinals).
 * The column moves `text` → `jsonb` to hold that shape, matching `graph` and
 * `brief`.
 *
 * No backfill: the old prose has no reliable mapping into slots keyed to node
 * ids, and it was advisory (never scored) on the revisions that carry it. Those
 * rows read as a null structured narrative — the same as any pre-brief
 * revision. `using null` discards the old text rather than attempting a cast
 * `text`→`jsonb` that would fail on any non-JSON prose.
 */
export class Migration20260901100007_narrative_to_structured extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "design_revision"
        alter column "narrative" type jsonb using null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "design_revision"
        alter column "narrative" type text using "narrative"::text;
    `);
  }
}
