import { cli } from './cli';

/**
 * memory-ingest: `main.js ingest <path…>` chunks the user's documents and
 * hands each chunk to the quality loop's document-memory orchestrator, one
 * at a time; `main.js status` reads the manifest back. One process, one
 * command, an exit code — no server. The environment and the working
 * directory are read here, once, and handed in; `config.ts` declares what is
 * read from them.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  process.exit(await cli(process.argv.slice(2), process.env, process.cwd()));
}

bootstrap();
