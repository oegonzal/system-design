import { readFileSync } from 'node:fs';

import type { StartToolSessionRequest, StepRecord, ToolSessionRecord } from '@sysdesign/contracts';

import type { SessionRegistry } from '../session';

/** What the command line boots to run a mission: the registry, and how the program closes behind it. */
export interface CliBoot {
  registry: SessionRegistry;
  close(): Promise<void>;
}

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  /** How the file named by `--goal` is read. */
  read?: (path: string) => string;
  sleep?: (ms: number) => Promise<void>;
}

/** The exit codes: a session that completed, one stopped or failed, a usage the command could not read. */
export const EXIT = { complete: 0, notComplete: 1, usage: 2 } as const;

const usage = (name: string): string =>
  `usage: ${name} run --goal <mission.md> [--max-steps <n>] [--max-minutes <n>]`;

/** The flags as given, or null for a line the grammar does not read. */
function readFlags(argv: readonly string[]): Record<string, string> | null {
  const flags: Record<string, string> = {};
  for (let at = 0; at < argv.length; at += 2) {
    const flag = argv[at];
    const value = argv[at + 1];
    if (flag === undefined || !flag.startsWith('--') || value === undefined) return null;
    flags[flag.slice(2)] = value;
  }
  return flags;
}

const whole = (text: string | undefined): number | undefined | null => {
  if (text === undefined) return undefined;
  return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : null;
};

/** One step as the terminal shows it. */
const stepLine = (step: StepRecord): string => {
  if (step.fault !== null) return `step ${step.step}: no plan — ${step.fault}`;
  const calls = step.calls.map((call) => `${call.tool} ${call.outcome}`).join(', ');
  const parts = [
    step.executable ? `ran ${step.executePrefix}` : 'refused',
    ...(calls === '' ? [] : [calls]),
    ...(step.ask === null ? [] : [`asked: ${step.ask.question}`]),
    ...(step.finish === null ? [] : [`finish ${step.finish.cause}`]),
  ];
  return `step ${step.step}: ${parts.join(' — ')}`;
};

const endingLine = (record: ToolSessionRecord): string =>
  `${record.status}${record.ending === null ? '' : `: ${record.ending.cause} — ${record.ending.detail}`}`;

/**
 * `run --goal <file>`: one mission from a file to its end, each step printed
 * as it lands, the ending last; the exit code says how it ended. Flags are
 * read before anything boots, so a usage fault costs nothing.
 */
export async function sessionCli(
  argv: readonly string[],
  name: string,
  boot: () => Promise<CliBoot>,
  io: CliIo,
): Promise<number> {
  const [command, ...rest] = argv;
  const flags = command === 'run' ? readFlags(rest) : null;
  const maxSteps = whole(flags?.['max-steps']);
  const maxMinutes = whole(flags?.['max-minutes']);
  if (flags === null || flags['goal'] === undefined || maxSteps === null || maxMinutes === null) {
    io.err(usage(name));
    return EXIT.usage;
  }
  const read = io.read ?? ((path) => readFileSync(path, 'utf8'));
  let mission: string;
  try {
    mission = read(flags['goal']);
  } catch (error) {
    io.err(`cannot read ${flags['goal']}: ${(error as Error).message}`);
    return EXIT.usage;
  }
  const request: StartToolSessionRequest = {
    mission,
    ...(maxSteps === undefined ? {} : { maxSteps }),
    ...(maxMinutes === undefined ? {} : { maxMinutes }),
  };
  const booted = await boot();
  try {
    const started = await booted.registry.start(request);
    io.out(`session ${started.id}: ${started.title}`);
    const record = await follow(booted.registry, started.id, io);
    io.out(endingLine(record));
    return record.status === 'complete' ? EXIT.complete : EXIT.notComplete;
  } finally {
    await booted.close();
  }
}

/** The record as it ends, each new step printed on the way. */
async function follow(
  registry: SessionRegistry,
  id: string,
  io: CliIo,
): Promise<ToolSessionRecord> {
  const sleep = io.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const done = registry.finished(id);
  if (done === null) throw new Error(`the registry lost session ${id}`);
  let printed = 0;
  let settled = false;
  void done.finally(() => {
    settled = true;
  });
  // A step's record is written as the step runs, so the one in flight is printed once the next begins or the session ends.
  const print = (ended: boolean): void => {
    const steps = registry.get(id)?.steps ?? [];
    const complete = ended ? steps.length : Math.max(printed, steps.length - 1);
    for (const step of steps.slice(printed, complete)) io.out(stepLine(step));
    printed = complete;
  };
  while (!settled) {
    print(false);
    await sleep(1_000);
  }
  const record = await done;
  print(true);
  return record;
}
