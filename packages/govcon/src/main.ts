/**
 * govcon: SAM.gov contract opportunities for one company, from the command
 * line. `main.js pull` fetches the profile's slices inside the daily budget
 * and stores them; `leads` ranks what is stored without spending a request;
 * `search` does both; `show` prints one notice with its factor trace. Every
 * command boots the same Nest context and exits by its result — there is no
 * HTTP surface.
 */
export const USAGE = `usage: govcon <command> [options]
  pull    [--profile <id>] [--days <n> | --from <YYYY-MM-DD> --to <YYYY-MM-DD>]
  leads   [--profile <id>] [--min-score <n>] [--tier high|medium|low] [--limit <n>] [--json]
  search  pull, then leads (either command's options)
  show    <noticeId> [--profile <id>] [--json]`;

async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });

  console.error(USAGE);
  process.exit(2);
}

bootstrap();
