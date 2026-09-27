/**
 * `main.js pull [--profile <id>] [--days <n> | --from <YYYY-MM-DD> --to <YYYY-MM-DD>]`
 * `main.js leads [--profile <id>] [--min-score <n>] [--tier high|medium|low] [--limit <n>] [--json]`
 * `main.js search …` — pull, then leads, either command's options
 * `main.js show <noticeId> [--profile <id>] [--json]`
 *
 * Boots the Nest context the module wires, runs, prints and exits by the
 * result: 2 for a usage problem or an unknown profile, 1 when a pull stored
 * nothing and no slice succeeded, 0 otherwise.
 */
import { parseArgs } from 'node:util';

import { NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  DEFAULT_LEAD_LIMIT,
  DEFAULT_PULL_DAYS,
  LEAD_TIERS,
  type LeadTier,
  type PullWindow,
} from '@sysdesign/contracts';

import { validateWindow, windowEndingAt } from './core/plan';
import { AppModule } from './modules/app/app.module';
import { OpportunitiesService } from './modules/opportunities/opportunities.service';
import { DEFAULT_PROFILE_ID } from './profiles';
import { renderLead, renderLeads, renderPull } from './render';

export const USAGE = `usage: govcon <command> [options]
  pull    [--profile <id>] [--days <n> | --from <YYYY-MM-DD> --to <YYYY-MM-DD>]
  leads   [--profile <id>] [--min-score <n>] [--tier high|medium|low] [--limit <n>] [--json]
  search  pull, then leads (either command's options)
  show    <noticeId> [--profile <id>] [--json]`;

const COMMANDS = ['pull', 'leads', 'search', 'show'] as const;
type Command = (typeof COMMANDS)[number];

interface Options {
  command: Command;
  positional: string[];
  profile: string;
  window: PullWindow;
  minScore: number;
  tier: LeadTier | null;
  limit: number;
  json: boolean;
}

const isCommand = (value: string | undefined): value is Command =>
  COMMANDS.includes(value as Command);

const integer = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`--${name} must be a non-negative integer`);
  return parsed;
};

/** argv → options, or an Error whose message is the usage problem. */
export function parseOptions(argv: readonly string[], now: Date): Options | Error {
  const [command, ...rest] = argv;
  if (!isCommand(command)) return new Error(USAGE);
  try {
    const { values, positionals } = parseArgs({
      args: [...rest],
      allowPositionals: true,
      options: {
        profile: { type: 'string' },
        days: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        'min-score': { type: 'string' },
        tier: { type: 'string' },
        limit: { type: 'string' },
        json: { type: 'boolean' },
      },
    });
    if ((values.from === undefined) !== (values.to === undefined)) {
      return new Error('--from and --to go together');
    }
    if (values.from !== undefined && values.days !== undefined) {
      return new Error('--days and --from/--to are alternatives');
    }
    const window =
      values.from !== undefined && values.to !== undefined
        ? validateWindow({ from: values.from, to: values.to })
        : windowEndingAt(now, integer(values.days, DEFAULT_PULL_DAYS, 'days'));
    if (values.tier !== undefined && !LEAD_TIERS.includes(values.tier as LeadTier)) {
      return new Error(`--tier must be one of ${LEAD_TIERS.join(', ')}`);
    }
    if (command === 'show' && positionals.length !== 1)
      return new Error('show takes one notice id');
    return {
      command,
      positional: positionals,
      profile: values.profile ?? DEFAULT_PROFILE_ID,
      window,
      minScore: integer(values['min-score'], 0, 'min-score'),
      tier: (values.tier as LeadTier | undefined) ?? null,
      limit: Math.max(1, integer(values.limit, DEFAULT_LEAD_LIMIT, 'limit')),
      json: values.json ?? false,
    };
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export async function cli(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv, new Date());
  if (options instanceof Error) {
    console.error(options.message);
    return 2;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const service = app.get(OpportunitiesService);
    const out: unknown[] = [];
    let code = 0;

    if (options.command === 'pull' || options.command === 'search') {
      const report = await service.pull(options.profile, options.window);
      out.push(options.json ? report : renderPull(report));
      const anyStored = report.slices.some(
        (slice) => slice.outcome === 'ok' || slice.outcome === 'cached',
      );
      if (!anyStored) code = 1;
    }
    if (options.command === 'leads' || options.command === 'search') {
      const report = await service.leads(options.profile, {
        minScore: options.minScore,
        tier: options.tier,
        limit: options.limit,
      });
      out.push(options.json ? report : renderLeads(report));
    }
    if (options.command === 'show') {
      const noticeId = options.positional[0] ?? '';
      const lead = await service.show(noticeId, options.profile);
      if (lead === null) {
        console.error(`no stored notice ${noticeId} — pull first`);
        return 1;
      }
      out.push(options.json ? lead : renderLead(lead));
    }

    console.log(
      options.json ? JSON.stringify(out.length === 1 ? out[0] : out, null, 2) : out.join('\n\n'),
    );
    return code;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return error instanceof NotFoundException ? 2 : 1;
  } finally {
    await app.close();
  }
}
