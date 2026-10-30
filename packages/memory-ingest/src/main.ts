import { cli } from './cli';

/**
 * memory-ingest: `main.js ingest <path…>` chunks the user's documents and
 * hands each chunk to the configured store — the quality loop's document-memory
 * orchestrator, or a memory space on the memory host — one at a time;
 * `main.js retract <path…>` takes a document's digests back out of that
 * store; `main.js status` reads the manifest back; `recall`, `history` and
 * `forget` read and close one memory space's records for the owner. One
 * process, one command, an exit code — no server. The environment and the
 * working directory are read here, once, and handed in; `config.ts` declares
 * what is read from them. An interrupt is a process concern too: the first
 * asks the ingest to stop once it has recorded the chunk in flight, because a
 * chunk abandoned mid-digest still settles and may still store, and a run that
 * never recorded it would digest those sections again on the next attempt.
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (error) => {
    console.error(error);
    process.exit(1);
  });
  let interrupted = false;
  process.on('SIGINT', () => {
    // A second interrupt abandons the chunk in flight, at the cost of its record.
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error(
      'interrupt: stopping once the chunk in flight is recorded — interrupt again to abandon it',
    );
  });
  process.exit(await cli(process.argv.slice(2), process.env, process.cwd(), () => interrupted));
}

bootstrap();
