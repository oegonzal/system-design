import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import {
  CANVAS_PIPELINE_ID,
  PROMPT_PIPELINE_ID,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import {
  DerivationFailed,
  FakeLoop,
  LoopRefused,
  LoopUnreachable,
  type RunScenario,
} from '@sysdesign/studio-testing';

import { LIBRARY } from './library-fixtures';
import { E2E_PORTS, GRADER_HOST } from './stack';

/**
 * The quality loop, stubbed over HTTP for the e2e suite.
 *
 * The studio API reaches its grader through `QUALITY_LOOP_URL`, so the suite
 * points that at this process instead of the real service: every route the
 * studio's client calls answers here with the same envelopes, and a run
 * completes on its own a moment after it starts with a trace that is a pure
 * function of the request — no model, no network, no database — and a run that
 * asks to recall is handed the fake's two fixed lessons. That is what
 * makes a grade in a spec a literal (`64` for three nodes) rather than a
 * range.
 *
 * The state machine is `@sysdesign/studio-testing`'s `FakeLoop` — the same
 * one the studio API's in-process client fake wraps — so the API's specs and
 * the browser suite grade the same markdown the same way. This file owns
 * only the HTTP: plain `node:http`, because it is a fixture, not a service.
 *
 * A test scripts its own run through the control routes, keyed by the run's
 * goal (a prompt's markdown, unique per test by its title):
 *
 *     POST   /__stub/scenarios { goal, scenario }   one run's fate: complete | fail | refuse
 *     DELETE /__stub/scenarios                       forget every scenario
 *     PUT    /__stub/health { unreachable }          global — every route, /health included,
 *                                                    drops the socket; only the serial
 *                                                    grader-down project may flip it
 *     GET    /__stub/requests                        the goals every run and derivation asked for,
 *                                                    and whether each run asked to recall
 *     POST   /__stub/reset                           runs, requests and scenarios, gone
 *
 * It listens on the suite's own grader port (`stack.ts`), which
 * `playwright.config.ts` hands the API under test as its `QUALITY_LOOP_URL`:
 *
 *     pnpm exec tsx --tsconfig tsconfig.base.json \
 *       packages/studio-e2e/src/support/quality-loop-stub.ts
 */

const PORT = E2E_PORTS.grader;
const HOST = GRADER_HOST;

/** How long a run stays `running` before its trace lands. */
const COMPLETION_DELAY_MS = 400;

const loop = new FakeLoop({
  model: 'stub',
  /** Fresh per process, so a stub restarted mid-suite never hands out an id a stored revision already cites. */
  runIdPrefix: `stub-${Date.now().toString(36)}`,
  pipelineVersion: 'stub',
  library: LIBRARY,
  knownPipelines: [CANVAS_PIPELINE_ID, PROMPT_PIPELINE_ID],
  startExchanges: ['producer.s1', 'critic.structure.s1', 'evaluator.coverage.s1'],
  now: () => new Date().toISOString(),
});

// ---- HTTP -----------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown): void {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

const notFound = (res: ServerResponse, message: string): void =>
  send(res, 404, { statusCode: 404, message, error: 'Not Found' });

const badRequest = (res: ServerResponse, message: string): void =>
  send(res, 400, { statusCode: 400, message, error: 'Bad Request' });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length === 0 ? undefined : JSON.parse(text);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The fake's typed errors as the loop's wire answers; a dead socket is exactly that. */
function answerError(req: IncomingMessage, res: ServerResponse, error: unknown): void {
  if (error instanceof LoopUnreachable) {
    req.socket.destroy();
    return;
  }
  if (error instanceof DerivationFailed) {
    return send(res, 503, {
      statusCode: 503,
      message: error.message,
      error: 'Service Unavailable',
      llm: error.llm,
      diagnostic: error.diagnostic,
    });
  }
  if (error instanceof LoopRefused) {
    return send(res, error.status, { ...error.body, error: 'Refused' });
  }
  throw error;
}

async function control(
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method === 'POST' && path === '/__stub/scenarios') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body['goal'] !== 'string' || !isRecord(body['scenario'])) {
      badRequest(res, 'goal and scenario are required');
      return true;
    }
    loop.scenario(body['goal'], body['scenario'] as unknown as RunScenario);
    send(res, 204, undefined);
    return true;
  }
  if (method === 'DELETE' && path === '/__stub/scenarios') {
    loop.clearScenarios();
    send(res, 204, undefined);
    return true;
  }
  if (method === 'PUT' && path === '/__stub/health') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body['unreachable'] !== 'boolean') {
      badRequest(res, 'unreachable (boolean) is required');
      return true;
    }
    loop.unreachable = body['unreachable'];
    send(res, 204, undefined);
    return true;
  }
  if (method === 'GET' && path === '/__stub/requests') {
    send(res, 200, {
      startRequests: [...loop.requests].map(([runId, { pipeline, goal, adopt, recall }]) => ({
        runId,
        pipeline,
        goal,
        adopt: adopt ?? null,
        recall: recall === true,
      })),
      criteriaRequests: loop.criteriaRequests.map(({ pipeline, goal }) => ({ pipeline, goal })),
    });
    return true;
  }
  if (method === 'POST' && path === '/__stub/reset') {
    loop.reset();
    send(res, 204, undefined);
    return true;
  }
  return false;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const path = url.pathname;

  if (await control(method, path, req, res)) return;

  try {
    if (method === 'GET' && path === '/health') {
      return send(res, 200, loop.health());
    }
    if (method === 'GET' && path === '/pipelines') {
      loop.health();
      return send(res, 200, { data: [] });
    }
    if (method === 'GET' && path === '/prompts') {
      return send(res, 200, { data: loop.listPrompts() });
    }
    if (method === 'GET' && path.startsWith('/prompts/')) {
      const id = path.slice('/prompts/'.length).split('/').map(decodeURIComponent).join('/');
      const document = loop.getPrompt(id);
      return document
        ? send(res, 200, { data: document })
        : notFound(res, `prompt ${id} not found`);
    }

    if (method === 'POST' && path === '/criteria') {
      const body = await readJson(req);
      if (
        !isRecord(body) ||
        typeof body['pipeline'] !== 'string' ||
        typeof body['goal'] !== 'string'
      ) {
        return badRequest(res, 'pipeline and goal are required');
      }
      return send(res, 200, {
        data: loop.deriveCriteria({ pipeline: body['pipeline'], goal: body['goal'] }),
      });
    }

    if (method === 'POST' && path === '/runs') {
      const body = await readJson(req);
      if (
        !isRecord(body) ||
        typeof body['pipeline'] !== 'string' ||
        typeof body['goal'] !== 'string'
      ) {
        return badRequest(res, 'pipeline and goal are required');
      }
      const started = loop.startRun(body as unknown as StartQualityRunRequest);
      setTimeout(() => loop.settle(started.runId), COMPLETION_DELAY_MS);
      return send(res, 202, { data: started });
    }
    // The studio hands a finished coach run to the memory orchestrator. The
    // stub only has to accept it; nothing downstream of the studio reads it.
    if (method === 'POST' && path === '/orchestrations/memory/from-run') {
      const body = await readJson(req);
      if (!isRecord(body) || typeof body['runId'] !== 'string') {
        return badRequest(res, 'runId is required');
      }
      return send(res, 202, { data: loop.digestRun(body['runId']) });
    }
    if (method === 'GET' && path === '/runs') {
      loop.health();
      return send(res, 200, { data: [], meta: { total: 0, limit: 50, offset: 0 } });
    }
    if (method === 'GET' && path.startsWith('/runs/')) {
      const runId = decodeURIComponent(path.slice('/runs/'.length));
      const run = loop.getRun(runId);
      return run ? send(res, 200, { data: run }) : notFound(res, `run ${runId} not found`);
    }

    loop.health();
    return notFound(res, `Cannot ${method} ${path}`);
  } catch (error) {
    answerError(req, res, error);
  }
}

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SyntaxError) return badRequest(res, `invalid JSON body: ${message}`);
    send(res, 500, { statusCode: 500, message, error: 'Internal Server Error' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`quality-loop stub listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
