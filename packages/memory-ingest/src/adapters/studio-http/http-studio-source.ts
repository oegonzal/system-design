import {
  MAX_LIST_LIMIT,
  type ApiListResponse,
  type ExperienceProfileDto,
  type StarStoryDto,
} from '@sysdesign/contracts';

import type { StudioSource } from '../../core/ports';

/**
 * The studio's record over its own HTTP API, each list read whole page by
 * page at the largest page the API allows. A list the studio will not give —
 * a status other than 200 — is refused naming the route and the status; a
 * studio that cannot be reached is the fetch's own error, with the URL.
 */
export class StudioRefused extends Error {
  override readonly name = 'StudioRefused';
  constructor(
    readonly route: string,
    readonly status: number,
  ) {
    super(`${route}: the studio answered ${status}`);
  }
}

export class HttpStudioSource implements StudioSource {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  experiences(): Promise<ExperienceProfileDto[]> {
    return this.whole<ExperienceProfileDto>('/experiences');
  }

  stories(): Promise<StarStoryDto[]> {
    return this.whole<StarStoryDto>('/star-stories');
  }

  /** Every item of a paged list: pages of the largest size, until the page runs short of the total. */
  private async whole<T>(route: string): Promise<T[]> {
    const items: T[] = [];
    for (;;) {
      const url = `${this.baseUrl}${route}?limit=${MAX_LIST_LIMIT}&offset=${items.length}`;
      const response = await this.fetchImpl(url);
      if (response.status !== 200) throw new StudioRefused(`GET ${route}`, response.status);
      const page = (await response.json()) as ApiListResponse<T>;
      items.push(...page.data);
      if (page.data.length === 0 || items.length >= page.meta.total) return items;
    }
  }
}
