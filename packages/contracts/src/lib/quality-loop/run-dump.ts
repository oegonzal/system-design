import type { ApiResponse } from '../envelope';

/**
 * A run's dump as the service will serve it: a flat list of files and one file
 * at a time.
 *
 * The paths go out opaque and sorted, with no grammar attached. Measured on
 * disk, the position prefix a dump file carries says nothing about what the file
 * is — `05-llm/01.` is the producer in five of three hundred and thirty-seven
 * recorded runs and something else in the rest — so any label derived from it
 * would be wrong most of the time. A client joins a file to what it knows
 * through the fields the record carries: a call's scope and its ordinal.
 */

export interface RunDumpEntryDto {
  /** Relative to the run's folder, POSIX-spelled. The only name a reader may ask for. */
  path: string;
  bytes: number;
}

export interface RunDumpFileDto extends RunDumpEntryDto {
  /**
   * The file as text. A JSON file is NOT parsed: parsing is the step that turns
   * bytes into the loop's own types, and an audit trail has to be readable even
   * when one of its files is malformed.
   */
  text: string | null;
  /** Why there is no text — a file too large, or bytes that would not read. Never a stack. */
  problem: string | null;
}

export type ListRunDumpResponse = ApiResponse<RunDumpEntryDto[]>;
export type GetRunDumpFileResponse = ApiResponse<RunDumpFileDto>;
