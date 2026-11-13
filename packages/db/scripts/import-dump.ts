/**
 * Restores a `pg_dump -Fc` archive from the artifacts bucket into the
 * database the `DB_*` variables name: the migrate task's command override
 * that `aws.sh db-import` runs (docs/aws/deployment.md). The archive's key
 * under the bucket is the one argument; `ARTIFACTS_BUCKET` names the bucket.
 * The process exits with `pg_restore`'s own code.
 *
 *     ARTIFACTS_BUCKET=… node -r @swc-node/register packages/db/scripts/import-dump.ts imports/cutover.dump
 *
 * `@swc-node/register` rather than tsx, as `seed.ts`: the one TypeScript
 * loader the migrate image carries.
 */
import { createWriteStream } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { importDump, spawnRunner } from '../src/import-dump';

async function main(): Promise<void> {
  const key = process.argv[2];
  const bucket = process.env['ARTIFACTS_BUCKET'];
  if (key === undefined || key === '') {
    throw new Error('import-dump needs the key of the archive under the artifacts bucket');
  }
  if (bucket === undefined || bucket === '') {
    throw new Error('ARTIFACTS_BUCKET must name the artifacts bucket');
  }
  const s3 = new S3Client({});
  const outcome = await importDump({
    bucket,
    key,
    workDir: await mkdtemp(join(tmpdir(), 'import-dump-')),
    download: async (from, object, to) => {
      const { Body } = await s3.send(new GetObjectCommand({ Bucket: from, Key: object }));
      // In node the SDK hands the body over as a readable stream; anything else is not an object to stream.
      if (!(Body instanceof Readable))
        throw new Error(`s3://${from}/${object} has no body to read`);
      await pipeline(Body, createWriteStream(to));
    },
    run: spawnRunner,
    env: process.env,
    log: (line) => console.log(line),
  });
  process.exitCode = outcome.exitCode;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
