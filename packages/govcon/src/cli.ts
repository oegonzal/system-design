/**
 * `main.js pull [--profile <id>] [--days <n> | --from <YYYY-MM-DD> --to <YYYY-MM-DD>]`
 * `main.js leads [--profile <id>] [--min-score <n>] [--tier high|medium|low] [--limit <n>] [--json]`
 * `main.js search …` — pull, then leads, either command's options
 * `main.js show <noticeId> [--profile <id>] [--description] [--json]`
 * `main.js awards fetch --naics <a,b> [--psc <c,d>] --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--sources sam.gov,usaspending] [--json]`
 * `main.js entities lookup <uei…> [--json]`
 * `main.js profiles list [--json]`
 *
 * `parseOptions` reads argv; `execute` runs the options over the service and
 * writes through `io`; `cli` boots the Nest context around them and exits by
 * the result: 2 for a usage problem, an unknown profile or a window the plan
 * cannot run, 1 when a pull stored nothing and no slice succeeded or a
 * notice is not stored, 0 otherwise.
 */
import { parseArgs } from 'node:util';

import { HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  AWARD_SOURCES,
  DEFAULT_LEAD_LIMIT,
  LEAD_TIERS,
  type AwardSource,
  type LeadTier,
  type StartPullRequest,
} from '@sysdesign/contracts';

import { messageOf } from './core/text';
import { AppModule } from './modules/app/app.module';
import { AwardsService } from './modules/awards/awards.service';
import { EntitiesService } from './modules/entities/entities.service';
import { OpportunitiesService } from './modules/opportunities/opportunities.service';
import { ProfilesService } from './modules/profiles/profiles.service';
import { PullService } from './modules/pulls/pull.service';
import {
  renderAwardsFetch,
  renderEntities,
  renderLead,
  renderLeads,
  renderProfiles,
  renderPull,
} from './render';

export const USAGE = `usage: govcon <command> [options]
  pull    [--profile <id>] [--days <n> | --from <YYYY-MM-DD> --to <YYYY-MM-DD>]
  leads   [--profile <id>] [--min-score <n>] [--tier high|medium|low] [--limit <n>] [--json]
  search  pull, then leads (either command's options)
  show    <noticeId> [--profile <id>] [--description] [--json]
          --description fetches the notice text once (one request); later shows are free
  awards fetch --naics <a,b> [--psc <c,d>] --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--sources sam.gov,usaspending] [--json]
          one request per page and code on sam.gov; USAspending is free
  entities lookup <uei…> [--json]
          one request per hundred UEIs
  profiles list [--json]
  serve   the same service over HTTP (GOVCON_PORT, default 3004) for the web client`;

/** Commands, and the subcommand each two-word command takes — as data. */
const COMMANDS = {
  pull: null,
  leads: null,
  search: null,
  show: null,
  awards: 'fetch',
  entities: 'lookup',
  profiles: 'list',
} as const;
type Command = keyof typeof COMMANDS;

export interface Options {
  command: Command;
  noticeId: string | null;
  /** `entities lookup`: the UEIs asked. */
  ueis: string[];
  /** `awards fetch`. */
  awards: {
    naics: string[];
    psc: string[];
    from: string;
    to: string;
    sources: AwardSource[];
  } | null;
  /** Unset means the default profile. */
  profile: string | undefined;
  /** The window as asked; the service resolves and validates it. */
  window: Pick<StartPullRequest, 'days' | 'from' | 'to'>;
  minScore: number;
  tier: LeadTier | null;
  limit: number;
  json: boolean;
  description: boolean;
}

/** What `execute` writes to and how it is answered. */
export interface Io {
  out(text: string): void;
  error(text: string): void;
}

/** The slice of the services the CLI drives — the fake in the spec implements exactly this. */
export type CliService = Pick<PullService, 'pull'> &
  Pick<OpportunitiesService, 'leads' | 'notice' | 'fetchDescription'> & {
    fetchAwards: AwardsService['fetch'];
    lookupEntities: EntitiesService['lookup'];
    listProfiles: ProfilesService['list'];
  };

const isCommand = (value: string | undefined): value is Command =>
  value !== undefined && value in COMMANDS;

const list = (value: string | undefined): string[] =>
  value === undefined
    ? []
    : value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

const integer = (value: string | undefined, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
};

/** argv → options, or an Error whose message is the usage problem. */
export function parseOptions(argv: readonly string[]): Options | Error {
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
        description: { type: 'boolean' },
        naics: { type: 'string' },
        psc: { type: 'string' },
        sources: { type: 'string' },
      },
    });
    if (values.tier !== undefined && !LEAD_TIERS.includes(values.tier as LeadTier)) {
      return new Error(`--tier must be one of ${LEAD_TIERS.join(', ')}`);
    }
    if (command === 'show' && positionals.length !== 1) {
      return new Error('show takes one notice id');
    }
    const subcommand = COMMANDS[command];
    if (subcommand !== null && positionals[0] !== subcommand) {
      return new Error(`${command} takes the subcommand ${subcommand}`);
    }
    const words = subcommand === null ? positionals : positionals.slice(1);
    if (command === 'entities' && words.length === 0) {
      return new Error('entities lookup takes UEIs');
    }
    let awards: Options['awards'] = null;
    if (command === 'awards') {
      const sources = list(values.sources ?? AWARD_SOURCES.join(','));
      const unknown = sources.find((source) => !AWARD_SOURCES.includes(source as AwardSource));
      if (unknown !== undefined)
        return new Error(`--sources must be among ${AWARD_SOURCES.join(', ')}`);
      if (values.from === undefined || values.to === undefined)
        return new Error('awards fetch takes --from and --to');
      awards = {
        naics: list(values.naics),
        psc: list(values.psc),
        from: values.from,
        to: values.to,
        sources: sources as AwardSource[],
      };
      if (awards.naics.length + awards.psc.length === 0)
        return new Error('awards fetch takes --naics or --psc');
    }
    return {
      command,
      noticeId: command === 'show' ? (words[0] ?? null) : null,
      ueis: command === 'entities' ? words : [],
      awards,
      profile: values.profile,
      window: { days: integer(values.days, 'days'), from: values.from, to: values.to },
      minScore: integer(values['min-score'], 'min-score') ?? 0,
      tier: (values.tier as LeadTier | undefined) ?? null,
      limit: Math.max(1, integer(values.limit, 'limit') ?? DEFAULT_LEAD_LIMIT),
      json: values.json ?? false,
      description: values.description ?? false,
    };
  } catch (error) {
    return error instanceof Error ? error : new Error(messageOf(error));
  }
}

/** The options over the service; the exit code. */
export async function execute(options: Options, service: CliService, io: Io): Promise<number> {
  const out: unknown[] = [];
  let code = 0;
  try {
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
        offset: 0,
      });
      out.push(options.json ? report : renderLeads(report));
    }
    if (options.command === 'show') {
      const noticeId = options.noticeId ?? '';
      if (options.description) {
        const fetched = await service.fetchDescription(noticeId);
        if (fetched.status !== 'ok') {
          io.error(
            fetched.status === 'budget-exhausted'
              ? `description not fetched — budget ${fetched.spent}/${fetched.budget} spent`
              : `description not fetched — ${fetched.message}`,
          );
        }
      }
      const notice = await service.notice(noticeId, options.profile);
      if (notice === null) {
        io.error(`no stored notice ${noticeId} — pull first`);
        return 1;
      }
      out.push(options.json ? notice : renderLead(notice));
    }
    if (options.command === 'awards' && options.awards !== null) {
      const report = await service.fetchAwards(options.awards);
      out.push(options.json ? report : renderAwardsFetch(report));
      if (!report.slices.some((slice) => slice.outcome === 'ok')) code = 1;
    }
    if (options.command === 'entities') {
      const lookup = await service.lookupEntities(options.ueis);
      out.push(options.json ? lookup : renderEntities(lookup));
    }
    if (options.command === 'profiles') {
      const profiles = await service.listProfiles();
      out.push(options.json ? profiles : renderProfiles(profiles));
    }
    io.out(
      options.json ? JSON.stringify(out.length === 1 ? out[0] : out, null, 2) : out.join('\n\n'),
    );
    return code;
  } catch (error) {
    io.error(messageOf(error));
    // A 404 (unknown profile or notice) and a 400 (a window the plan cannot run) are usage problems.
    return error instanceof HttpException ? 2 : 1;
  }
}

export async function cli(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv);
  if (options instanceof Error) {
    console.error(options.message);
    return 2;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const pulls = app.get(PullService);
    const opportunities = app.get(OpportunitiesService);
    const awards = app.get(AwardsService);
    const entities = app.get(EntitiesService);
    const profiles = app.get(ProfilesService);
    const service: CliService = {
      pull: (profileId, request) => pulls.pull(profileId, request),
      leads: (profileId, options) => opportunities.leads(profileId, options),
      notice: (noticeId, profileId) => opportunities.notice(noticeId, profileId),
      fetchDescription: (noticeId) => opportunities.fetchDescription(noticeId),
      fetchAwards: (request) => awards.fetch(request),
      lookupEntities: (ueis) => entities.lookup(ueis),
      listProfiles: () => profiles.list(),
    };
    return await execute(options, service, {
      out: (text) => console.log(text),
      error: (text) => console.error(text),
    });
  } finally {
    await app.close();
  }
}
