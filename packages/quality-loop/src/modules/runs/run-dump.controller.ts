import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { GetRunDumpFileResponse, ListRunDumpResponse } from '@sysdesign/contracts';
import { listDump, readDumpFile } from '@sysdesign/run-dump';

import { orNotFound } from '../http/or-not-found';
import { RUN_DUMP_DIR } from './tokens';

/**
 * A read-only window onto a run's dump folder.
 *
 * The loop records every prompt and reply it sent on disk, and `GET /runs/:id`
 * deliberately leaves them there — a run record is the evidence, not the
 * transcript. This route is how a reader gets at the transcript without the
 * record growing to hold it.
 *
 * Rooted at `runs/:id/dump` rather than declared inside the runs controller,
 * which sidesteps route precedence entirely: there is no ordering in which this
 * could shadow `GET /runs/:id` or be shadowed by it.
 *
 * A missing dump is a 404 that claims nothing about whether the run exists. The
 * two stores legitimately diverge — a folder is written by the loop, a row by
 * the database — so answering "no dump" is the honest answer and "no run" would
 * be a guess.
 *
 * No paging. A run's folder holds about seventy files and the worst on record
 * holds two hundred and nine, so a listing is some fifteen kilobytes — smaller
 * than payloads this API already ships, and a page boundary through an audit
 * trail is a way to miss a file.
 */
@Controller('runs/:id/dump')
export class RunDumpController {
  constructor(@Inject(RUN_DUMP_DIR) private readonly dir: string) {}

  /** Every file of the dump, sorted by path, with byte counts. */
  @Get()
  async list(@Param('id') id: string): Promise<ListRunDumpResponse> {
    return {
      data: orNotFound(await listDump(this.dir, id), `no dump recorded for run ${id}`),
    };
  }

  /**
   * One file, by the exact path a listing gave.
   *
   * A path that is not in the listing is a 404 because it is not a key — the
   * reader resolves only through the map it built by walking the folder, so
   * nothing here has to remember to reject a traversal. A file that IS a key but
   * cannot be served answers 200 with its problem named: the trail stays
   * readable even where one file of it is not.
   */
  @Get('*path')
  async file(
    @Param('id') id: string,
    @Param('path') path: string | string[],
  ): Promise<GetRunDumpFileResponse> {
    // The router hands a wildcard back as its segments; the reader's keys are
    // POSIX paths, so they are rejoined before the lookup and never resolved.
    const key = Array.isArray(path) ? path.join('/') : path;
    return {
      data: orNotFound(
        await readDumpFile(this.dir, id, key),
        `no file ${key} in the dump for run ${id}`,
      ),
    };
  }
}
