import { OBSERVATION_RESULT_MAX_LENGTH, type ToolDeclaration } from '@sysdesign/contracts';
import { z } from 'zod';

import { isArgumentsRefusal, ToolCatalog } from './catalog';
import { HttpToolProvider, PeerUnreachable } from './http-tool-provider';
import { defineTool, ToolArgumentsRefused, ToolUnknown } from './tool';

const echo = defineTool(
  {
    name: 'echo',
    description: 'Says the words back.',
    parameters: z.object({ words: z.string(), times: z.number().int().min(1).default(1) }),
    effect: 'read',
    approval: false,
    run: (args) =>
      Promise.resolve({
        outcome: 'ok',
        summary: Array.from({ length: args.times }, () => args.words).join(' '),
        data: args,
      }),
  },
  'example',
);

const explode = defineTool(
  {
    name: 'explode',
    description: 'Throws.',
    parameters: z.object({}),
    effect: 'write',
    approval: false,
    run: () => Promise.reject(new Error('boom')),
  },
  'example',
);

describe('a tool and the catalog', () => {
  it('[TSS-2] is defined once with its schema and its run; its declaration carries the schema for the wire, and its run parses the arguments first', async () => {
    expect(echo.declaration).toMatchObject({
      name: 'echo',
      effect: 'read',
      approval: false,
      provider: 'example',
    });
    expect(echo.declaration.parameters['required']).toEqual(['words']);
    await expect(echo.run({ words: 'hi', times: 2 }, {})).resolves.toMatchObject({
      outcome: 'ok',
      summary: 'hi hi',
    });
    await expect(echo.run({ words: 1 }, {})).rejects.toThrow(ToolArgumentsRefused);
    await expect(echo.run({ words: 1 }, {})).rejects.toMatchObject({
      issues: [{ path: 'words', message: expect.stringContaining('string') }],
    });
  });

  it('[TSS-2] refuses a name declared twice, answers an unknown tool by name, and turns a refusal and a failure into outcomes a plan can read', async () => {
    expect(() => new ToolCatalog([echo, echo])).toThrow('tool echo is declared twice');
    const catalog = new ToolCatalog([echo, explode]);
    expect(catalog.declarations().map((tool) => tool.name)).toEqual(['echo', 'explode']);
    expect(catalog.declaration('echo')?.description).toBe('Says the words back.');
    expect(catalog.declaration('nope')).toBeNull();
    await expect(catalog.execute('nope', {})).rejects.toThrow(ToolUnknown);
    const refused = await catalog.execute('echo', { words: 1 });
    expect(refused.outcome).toBe('refused');
    expect(isArgumentsRefusal(refused.data)).toBe(true);
    expect(refused.summary).toContain('echo refuses its arguments');
    const failed = await catalog.execute('explode', {});
    expect(failed).toMatchObject({
      outcome: 'failed',
      summary: 'explode failed: Error: boom',
      data: null,
    });
    const long = await catalog.execute('echo', {
      words: 'w'.repeat(OBSERVATION_RESULT_MAX_LENGTH),
      times: 2,
    });
    expect(long.summary).toHaveLength(OBSERVATION_RESULT_MAX_LENGTH);
    expect(
      catalog
        .with([
          defineTool(
            {
              ...echo.declaration,
              name: 'echo2',
              parameters: z.object({}),
              run: () => Promise.resolve({ outcome: 'ok', summary: '', data: null }),
            },
            'other',
          ),
        ])
        .declarations(),
    ).toHaveLength(3);
  });

  it('[TSS-2] mounts another program’s tools from its GET /tools and runs each through its POST /tools/:name, reading a refusal, an unknown tool and a dead peer as what they are', async () => {
    const declaration: ToolDeclaration = { ...echo.declaration, provider: 'peer' };
    const calls: { url: string; body: unknown }[] = [];
    const answers = new Map<string, () => Response>([
      ['GET http://peer.test/tools', () => Response.json({ data: [declaration] })],
      [
        'POST http://peer.test/tools/echo',
        () => Response.json({ data: { outcome: 'ok', summary: 'from the peer', data: null } }),
      ],
    ]);
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
      const answer = answers.get(`${init?.method ?? 'GET'} ${url}`);
      return answer === undefined ? new Response('', { status: 404 }) : answer();
    }) as typeof fetch;
    const tools = await new HttpToolProvider('http://peer.test', fetchImpl).tools();
    expect(tools.map((tool) => tool.declaration)).toEqual([declaration]);
    const catalog = new ToolCatalog(tools);
    await expect(catalog.execute('echo', { words: 'x' })).resolves.toMatchObject({
      outcome: 'ok',
      summary: 'from the peer',
    });
    expect(calls.at(-1)).toEqual({
      url: 'http://peer.test/tools/echo',
      body: { arguments: { words: 'x' } },
    });
    answers.set('POST http://peer.test/tools/echo', () =>
      Response.json(
        { message: 'validation failed', issues: [{ path: 'words', message: 'x' }] },
        { status: 400 },
      ),
    );
    const refused = await catalog.execute('echo', { words: 1 });
    expect(refused.outcome).toBe('refused');
    expect(isArgumentsRefusal(refused.data)).toBe(true);
    answers.delete('POST http://peer.test/tools/echo');
    expect((await catalog.execute('echo', { words: 'x' })).outcome).toBe('failed');
    await expect(
      new HttpToolProvider('http://dead.test', (() =>
        Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch).tools(),
    ).rejects.toThrow(PeerUnreachable);
  });
});
