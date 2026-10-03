import { cli } from './cli';

/**
 * browser-session: `main.js run | login | sessions | show`. One command over
 * the Nest context, exiting by its result. The configuration is read once,
 * in `config.ts`; nothing here reads the environment.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  process.exit(await cli(process.argv.slice(2)));
}

bootstrap();
