import { Migration } from '@mikro-orm/migrations';

/**
 * Award and spending calls once carried one code per call (`naics: "332710"`,
 * `psc: null`); they now carry every code of the fetch as arrays. The ledger
 * is history, so the rows written by the older shape are rewritten to the
 * current one — a single code becomes a one-element array, none becomes an
 * empty one — and every `query` matches the contract again.
 */
export class Migration20260929200007_govcon_source_call_codes extends Migration {
  override up(): void | Promise<void> {
    for (const field of ['naics', 'psc']) {
      this.addSql(`
        update "govcon_source_call"
        set "query" = "query" || jsonb_build_object('${field}',
          case
            when jsonb_typeof("query" -> '${field}') = 'string' then jsonb_build_array("query" -> '${field}')
            when "query" -> '${field}' is null or jsonb_typeof("query" -> '${field}') = 'null' then '[]'::jsonb
            else "query" -> '${field}'
          end)
        where "operation" in ('awards', 'spending')
          and jsonb_typeof("query" -> '${field}') is distinct from 'array';
      `);
    }
  }

  override down(): void | Promise<void> {
    // The older shape is not restored: a one-element array reads the same, and an
    // empty one means what null did.
  }
}
