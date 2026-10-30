import { bodyMessage, JsonCallFailed, sendJson } from './json-call';

const answering =
  (status: number, text: string): typeof fetch =>
  async () =>
    new Response(text.length === 0 ? null : text, { status });

const failedWith = async (promise: Promise<unknown>): Promise<JsonCallFailed> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof JsonCallFailed) return error;
    throw error;
  }
  throw new Error('the call did not fail');
};

describe('one JSON call', () => {
  it('sends the body as JSON and hands back the status with the body parsed, as text, or absent', async () => {
    let sent: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      sent = init;
      return new Response('{"data":{"id":"x"}}', { status: 201 });
    };
    const answer = await sendJson(fetchImpl, 'http://svc', '/things', {
      method: 'POST',
      body: { name: 'n' },
      timeoutMs: 1_000,
    });
    expect(answer).toEqual({ status: 201, body: { data: { id: 'x' } } });
    expect(sent?.body).toBe('{"name":"n"}');
    expect(sent?.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
    });

    const call = { method: 'GET' as const, timeoutMs: 1_000 };
    expect(await sendJson(answering(502, 'Bad Gateway'), 'http://svc', '/x', call)).toEqual({
      status: 502,
      body: 'Bad Gateway',
    });
    expect(await sendJson(answering(204, ''), 'http://svc', '/x', call)).toEqual({
      status: 204,
      body: undefined,
    });
  });

  it('says which way a call failed to get an answer: never reached, past its timeout, or withdrawn', async () => {
    const refused: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const unreachable = await failedWith(
      sendJson(refused, 'http://svc', '/x', { method: 'GET', timeoutMs: 1_000 }),
    );
    expect([unreachable.failure, unreachable.message]).toEqual([
      'unreachable',
      'GET /x: fetch failed',
    ]);

    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const late = await failedWith(
      sendJson(hanging, 'http://svc', '/x', { method: 'GET', timeoutMs: 20 }),
    );
    expect([late.failure, late.message]).toEqual(['timeout', 'GET /x: took over 20 ms']);

    const controller = new AbortController();
    const pending = sendJson(hanging, 'http://svc', '/x', {
      method: 'GET',
      timeoutMs: 60_000,
      signal: controller.signal,
    });
    controller.abort();
    expect((await failedWith(pending)).failure).toBe('aborted');
  });

  it("reads a service's error body by its message, or as JSON when it gave none", () => {
    expect(bodyMessage({ message: 'no such space' })).toBe('no such space');
    expect(bodyMessage({ issues: [] })).toBe('{"issues":[]}');
    expect(bodyMessage(undefined)).toBe('no body');
  });
});
