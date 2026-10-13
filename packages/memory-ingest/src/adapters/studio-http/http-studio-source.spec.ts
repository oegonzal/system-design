import { MAX_LIST_LIMIT } from '@sysdesign/contracts';

import { sampleExperience, sampleStory } from '../../test/fakes';
import { HttpStudioSource, StudioRefused } from './http-studio-source';

type Call = string;

/** A fetch answering by script and recording the URLs asked. */
function scripted(answer: (url: string) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return answer(url);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HttpStudioSource', () => {
  it('[ING-3] reads a list whole, page by page at the largest page the API allows, until the page runs short of the total', async () => {
    const total = MAX_LIST_LIMIT + 3;
    const all = Array.from({ length: total }, (_, i) =>
      sampleExperience({ slug: `experience-${i + 1}`, title: `Role ${i + 1}` }),
    );
    const { fetch, calls } = scripted((url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      const data = all.slice(offset, offset + MAX_LIST_LIMIT);
      return json(200, { data, meta: { total, limit: MAX_LIST_LIMIT, offset } });
    });

    const items = await new HttpStudioSource('http://studio', fetch).experiences();

    expect(items).toHaveLength(total);
    expect(items[0]?.title).toBe('Role 1');
    expect(items[total - 1]?.title).toBe(`Role ${total}`);
    expect(calls).toEqual([
      `http://studio/experiences?limit=${MAX_LIST_LIMIT}&offset=0`,
      `http://studio/experiences?limit=${MAX_LIST_LIMIT}&offset=${MAX_LIST_LIMIT}`,
    ]);
  });

  it('[ING-3] reads the stories from their own route, and refuses a list the studio will not give, naming the route and the status', async () => {
    const { fetch, calls } = scripted((url) =>
      url.includes('/star-stories')
        ? json(200, { data: [sampleStory()], meta: { total: 1, limit: MAX_LIST_LIMIT, offset: 0 } })
        : json(503, { statusCode: 503, message: 'down' }),
    );
    const source = new HttpStudioSource('http://studio', fetch);

    expect((await source.stories()).map((story) => story.title)).toEqual([
      'The settlement backlog',
    ]);
    await expect(source.experiences()).rejects.toThrow(StudioRefused);
    await expect(source.experiences()).rejects.toThrow('GET /experiences: the studio answered 503');
    expect(calls[0]).toBe(`http://studio/star-stories?limit=${MAX_LIST_LIMIT}&offset=0`);
  });
});
