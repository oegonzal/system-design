import { cli } from './cli';

/**
 * gmail: `main.js serve | run | authorize`. One command over the Nest
 * context, exiting by its result. The configuration is read once, in
 * `config.ts`; nothing here reads the environment.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  process.exit(await cli(process.argv.slice(2)));
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
