import { Migration } from '@mikro-orm/migrations';

const OLD = `'flash-sale-ticketing', 'media-streaming-pipeline', 'workflow-automation', 'realtime-analytics', 'dag-orchestration'`;

/**
 * The sixth archetype. The check constraint is derived from the entity's
 * local tuple, so seeding the new experience row fails against the old
 * constraint until this widens it.
 */
export class Migration20260901100006_add_order_history_archetype extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "experience_profile" drop constraint "experience_profile_archetype_check";
    `);
    this.addSql(`
      alter table "experience_profile"
        add constraint "experience_profile_archetype_check"
        check ("archetype" in (${OLD}, 'order-history-integration'));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`delete from "prompt" where "archetype" = 'order-history-integration';`);
    this.addSql(`delete from "experience_profile" where "archetype" = 'order-history-integration';`);
    this.addSql(`
      alter table "experience_profile" drop constraint "experience_profile_archetype_check";
    `);
    this.addSql(`
      alter table "experience_profile"
        add constraint "experience_profile_archetype_check"
        check ("archetype" in (${OLD}));
    `);
  }
}
