import type { GatewayEvent } from './http';
import type { Log } from './log';

/**
 * What the specs build requests and read logs with: a function URL event
 * (payload format 2.0) from the few fields a case names, and a log that
 * keeps its lines.
 */
export interface EventShape {
  method?: string;
  path?: string;
  query?: string;
  headers?: Record<string, string>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
}

export function functionUrlEvent({
  method = 'GET',
  path = '/',
  query = '',
  headers = {},
  cookies,
  body,
  isBase64Encoded = false,
}: EventShape = {}): GatewayEvent {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: query,
    headers: { host: 'gateway.example', ...headers },
    cookies,
    body,
    isBase64Encoded,
    requestContext: {
      accountId: 'anonymous',
      apiId: 'url',
      domainName: 'gateway.example',
      domainPrefix: 'url',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '198.51.100.7', userAgent: 'spec' },
      requestId: 'request',
      routeKey: '$default',
      stage: '$default',
      time: '11/Nov/2026:00:00:00 +0000',
      timeEpoch: 1_794_355_200_000,
    },
  };
}

interface RecordedLog {
  log: Log;
  lines: { message: string; detail: Readonly<Record<string, unknown>> }[];
}

export function recordedLog(): RecordedLog {
  const lines: RecordedLog['lines'] = [];
  return { lines, log: (message, detail = {}) => void lines.push({ message, detail }) };
}
