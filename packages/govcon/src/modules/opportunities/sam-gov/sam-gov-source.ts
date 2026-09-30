import type {
  DescribeResult,
  OpportunitySource,
  SourceAvailability,
  SourceFailure,
  SourceResult,
} from '../../../core/ports';
import type { OpportunityQuery } from '../../../core/query';
import { htmlToText } from './description-text';
import { normalizePage } from './normalize';
import { samDescriptionSchema, samEnvelopeSchema } from './schemas';

/**
 * SAM.gov's Contract Opportunities search over plain `fetch`: the endpoint is
 * one GET. Transport and sleep are injectable — the seam every network adapter
 * in this repo has — so a spec never touches the network and never needs a
 * real key.
 *
 * Budget discipline: one retry on a server error or a dropped connection, and
 * none on 429 — a second request against a spent quota is a spent request.
 * Key discipline: the key rides in the query string, so no message here ever
 * carries the URL, and every provider string passes through `redact`.
 */
export const SAM_GOV_SEARCH_URL = 'https://api.sam.gov/opportunities/v2/search';
export const SAM_GOV_ALPHA_SEARCH_URL = 'https://api-alpha.sam.gov/opportunities/v2/search';
/** A notice's description is a second, separately priced request. */
export const SAM_GOV_DESCRIPTION_URL = 'https://api.sam.gov/prod/opportunities/v1/noticedesc';
export const SAM_GOV_SOURCE_ID = 'sam.gov';

/** A stalled provider must not hold a pull for undici's five-minute default. */
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_MS = 10_000;
const DEFAULT_RETRY_AFTER_MS = 1_000;
const ERROR_BODY_CHARS = 200;

export type SamGovTransport = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export interface SamGovSourceOptions {
  apiKey: string;
  /** The search URL; the alpha environment for testing against a prodlike key. */
  baseUrl?: string;
  /** The notice description URL. */
  descriptionUrl?: string;
  fetch?: SamGovTransport;
  sleep?: Sleep;
  warn?: (message: string) => void;
}

/** `2026-09-20` → `09/20/2026`, the only date spelling the API accepts. */
export const toSamDate = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
};

/** The query under the provider's parameter names — never the key. */
export function toSamParams(query: OpportunityQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('postedFrom', toSamDate(query.postedFrom));
  params.set('postedTo', toSamDate(query.postedTo));
  params.set('limit', String(query.limit));
  params.set('offset', String(query.offset));
  const optional: [string, string | undefined][] = [
    ['ptype', query.noticeType],
    ['ncode', query.naics],
    ['ccode', query.psc],
    ['typeOfSetAside', query.setAside],
    ['title', query.title],
    ['solnum', query.solicitationNumber],
    ['noticeid', query.noticeId],
    ['state', query.state],
    ['zip', query.zip],
    ['organizationName', query.organizationName],
    ['organizationCode', query.organizationCode],
    ['rdlfrom', query.deadlineFrom ? toSamDate(query.deadlineFrom) : undefined],
    ['rdlto', query.deadlineTo ? toSamDate(query.deadlineTo) : undefined],
  ];
  for (const [name, value] of optional) if (value !== undefined) params.set(name, value);
  return params;
}

const retryAfterMs = (response: Response): number => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : DEFAULT_RETRY_AFTER_MS;
};

export class SamGovSource implements OpportunitySource {
  readonly id = SAM_GOV_SOURCE_ID;
  readonly availability: SourceAvailability = { enabled: true, reason: null };
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly descriptionUrl: string;
  private readonly transport: SamGovTransport;
  private readonly sleep: Sleep;
  private readonly warn: (message: string) => void;

  constructor(options: SamGovSourceOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? SAM_GOV_SEARCH_URL;
    this.descriptionUrl = options.descriptionUrl ?? SAM_GOV_DESCRIPTION_URL;
    this.transport = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.()));
    this.warn = options.warn ?? (() => undefined);
  }

  async search(query: OpportunityQuery): Promise<SourceResult> {
    const response = await this.attempt(`${this.baseUrl}?${toSamParams(query).toString()}`);
    const failed = await this.failure(response);
    if (failed) return failed;

    const body = await this.json(response as Response);
    if (body instanceof Error) return this.invalid(`body is not JSON: ${body.message}`);
    const parsed = samEnvelopeSchema.safeParse(body);
    if (!parsed.success) return this.invalid(`envelope: ${issuesOf(parsed.error.issues)}`);
    const { opportunities, rejected } = normalizePage(parsed.data.opportunitiesData ?? [], this.id);
    if (rejected.length > 0) this.warn(`sam.gov: ${rejected.length} record(s) did not normalize`);
    return { kind: 'ok', opportunities, rejected, totalRecords: parsed.data.totalRecords };
  }

  async describe(noticeId: string): Promise<DescribeResult> {
    const params = new URLSearchParams({ noticeid: noticeId });
    const response = await this.attempt(`${this.descriptionUrl}?${params.toString()}`);
    const failed = await this.failure(response);
    if (failed) return failed;

    const body = await this.json(response as Response);
    if (body instanceof Error) return this.invalid(`body is not JSON: ${body.message}`);
    const parsed = samDescriptionSchema.safeParse(body);
    if (!parsed.success) return this.invalid(`description: ${issuesOf(parsed.error.issues)}`);
    return { kind: 'ok', text: htmlToText(parsed.data.description) };
  }

  /** The response, after at most one retry on a server error or a dropped connection. */
  private async attempt(url: string): Promise<Response | Error> {
    let last: Response | Error = new Error('no attempt');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        last = await this.request(url);
      } catch (error) {
        last = error instanceof Error ? error : new Error(String(error));
        if (attempt === 0) await this.sleep(DEFAULT_RETRY_AFTER_MS);
        continue;
      }
      if (last.status >= 500 && attempt === 0) {
        await this.sleep(retryAfterMs(last));
        continue;
      }
      return last;
    }
    return last;
  }

  private request(url: string): Promise<Response> {
    const target = new URL(url);
    // The key is appended here and nowhere else; the URL is never logged.
    target.searchParams.set('api_key', this.apiKey);
    return this.transport(target.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** A dropped connection, a rate limit or a non-2xx status as the port's failure; null when the response is usable. */
  private async failure(response: Response | Error): Promise<SourceFailure | null> {
    if (response instanceof Error) {
      return {
        kind: 'error',
        outcome: 'error',
        status: null,
        message: this.redact(response.message),
      };
    }
    if (response.status === 429) {
      return {
        kind: 'error',
        outcome: 'rate-limited',
        status: 429,
        message: `rate limited${await this.detail(response)}`,
      };
    }
    if (!response.ok) {
      return {
        kind: 'error',
        outcome: 'error',
        status: response.status,
        message: `status ${response.status}${await this.detail(response)}`,
      };
    }
    return null;
  }

  private async json(response: Response): Promise<unknown | Error> {
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  private invalid(message: string): SourceFailure {
    return {
      kind: 'error',
      outcome: 'invalid-response',
      status: 200,
      message: this.redact(message),
    };
  }

  /** The provider's own words, bounded and redacted — a bad key is otherwise a bare status. */
  private async detail(response: Response): Promise<string> {
    try {
      const text = (await response.text()).replace(/\s+/g, ' ').trim();
      return text.length > 0 ? ` — ${this.redact(text.slice(0, ERROR_BODY_CHARS))}` : '';
    } catch {
      return '';
    }
  }

  private redact(text: string): string {
    return this.apiKey.length > 0 ? text.split(this.apiKey).join('[api_key]') : text;
  }
}

const issuesOf = (issues: readonly { path: PropertyKey[]; message: string }[]): string =>
  issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'} ${issue.message}`)
    .join('; ');
