import { cli } from './cli';

/**
 * govcon: SAM.gov contract opportunities for one company, from the command
 * line. `main.js pull` fetches the profile's slices inside the daily budget
 * and stores them; `leads` ranks what is stored without spending a request;
 * `search` does both; `show` prints one notice with its factor trace. Every
 * command boots the same Nest context and exits by its result — there is no
 * HTTP surface.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  process.exit(await cli(process.argv.slice(2)));
}

bootstrap();
