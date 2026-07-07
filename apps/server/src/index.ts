import { createServer } from 'node:http';
import {
  MockLLMProvider,
  PrivacyRedactor,
  builtinPacks,
  type GuideMode,
  type GuideLLMRequest,
  type Intent,
  type LLMProvider,
} from '@voiceguide/core';
import { AnthropicLLMProvider } from './anthropicProvider.js';

const PORT = Number(process.env['VOICEGUIDE_SERVER_PORT'] ?? 8787);
const HOST = process.env['VOICEGUIDE_SERVER_HOST'] ?? '127.0.0.1';
const MAX_BODY_BYTES = Number(process.env['VOICEGUIDE_MAX_BODY_BYTES'] ?? 64 * 1024);
const ALLOWED_ORIGINS = new Set(
  (process.env['VOICEGUIDE_ALLOWED_ORIGINS'] ??
    'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const INTENTS = new Set<Intent>([
  'ask_how',
  'done',
  'not_found',
  'repeat',
  'simplify',
  'error_help',
  'start_tutorial',
  'explore',
  'verify',
  'unknown',
]);
const MODES = new Set<GuideMode>([
  'ask',
  'tutorial',
  'coach',
  'troubleshooting',
  'explore',
]);

function selectProvider(): LLMProvider {
  const kind = process.env['VOICEGUIDE_LLM_PROVIDER'] ?? 'mock';
  const key = process.env['ANTHROPIC_API_KEY'];
  if (kind === 'anthropic' && key) {
    const model = process.env['VOICEGUIDE_ANTHROPIC_MODEL'] ?? 'claude-sonnet-5';
    console.log(`[voiceguide] LLM provider: anthropic (${model})`);
    return new AnthropicLLMProvider(key, model);
  }
  console.log('[voiceguide] LLM provider: mock (no API key required)');
  return new MockLLMProvider();
}

const llm = selectProvider();
const redactor = new PrivacyRedactor();

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly clientMessage: string,
  ) {
    super(clientMessage);
  }
}

function requestOrigin(req: import('node:http').IncomingMessage): string | null {
  const origin = req.headers.origin;
  return typeof origin === 'string' ? origin : null;
}

function isAllowedOrigin(req: import('node:http').IncomingMessage): boolean {
  const origin = requestOrigin(req);
  // curl, same-origin proxy, server-to-server 호출은 보통 Origin 헤더가 없습니다.
  return origin === null || ALLOWED_ORIGINS.has(origin);
}

function responseHeaders(req: import('node:http').IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    vary: 'Origin',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  };
  const origin = requestOrigin(req);
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

function json(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, responseHeaders(req));
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

function ensureTrustedOrigin(req: import('node:http').IncomingMessage): void {
  if (!isAllowedOrigin(req)) {
    throw new HttpError(403, 'origin not allowed');
  }
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, 'request body too large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseGuideRequest(raw: string): GuideLLMRequest {
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value)) throw new HttpError(400, 'invalid request');

  const utterance = value['utterance'];
  const goal = value['goal'];
  const intent = value['intent'];
  const mode = value['mode'];
  const detection = value['detection'];
  const history = value['history'];
  const genericStepIndex = value['genericStepIndex'];
  const simplify = value['simplify'];
  const detectionRecord = isRecord(detection) ? detection : null;
  const toolId = detectionRecord?.['toolId'];
  const toolName = detectionRecord?.['toolName'];
  const confidence = detectionRecord?.['confidence'];
  const evidence = detectionRecord?.['evidence'];

  if (
    typeof utterance !== 'string' ||
    utterance.length > 4000 ||
    typeof goal !== 'string' ||
    goal.length > 4000 ||
    typeof intent !== 'string' ||
    !INTENTS.has(intent as Intent) ||
    typeof mode !== 'string' ||
    !MODES.has(mode as GuideMode) ||
    !detectionRecord ||
    !(toolId === null || typeof toolId === 'string') ||
    typeof toolName !== 'string' ||
    typeof confidence !== 'number' ||
    !isStringArray(evidence) ||
    !Array.isArray(history) ||
    typeof genericStepIndex !== 'number' ||
    typeof simplify !== 'boolean'
  ) {
    throw new HttpError(400, 'invalid request');
  }

  return {
    utterance,
    intent: intent as Intent,
    mode: mode as GuideMode,
    goal,
    redactedContext:
      (value['redactedContext'] as GuideLLMRequest['redactedContext']) ?? null,
    detection: {
      toolId,
      toolName,
      confidence,
      evidence,
    },
    pack: (value['pack'] as GuideLLMRequest['pack']) ?? null,
    history: history as GuideLLMRequest['history'],
    genericStepIndex,
    simplify,
  };
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
      ensureTrustedOrigin(req);
      json(req, res, 204, {});
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      json(req, res, 200, { ok: true, llmProvider: llm.name });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/packs') {
      json(req, res, 200, {
        packs: builtinPacks.map((p) => ({
          toolId: p.toolId,
          toolName: p.toolName,
          description: p.description,
          supportedDomains: p.supportedDomains,
          version: p.version,
          tasks: p.commonTasks.map((t) => t.title),
        })),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/llm') {
      try {
        ensureTrustedOrigin(req);
        const contentType = req.headers['content-type'];
        if (
          typeof contentType !== 'string' ||
          !contentType.toLowerCase().includes('application/json')
        ) {
          throw new HttpError(415, 'content-type must be application/json');
        }
        const raw = await readBody(req);
        const request = parseGuideRequest(raw);
        // Defense in depth: redact again server-side before it reaches any
        // model provider, even though clients redact first.
        if (request.redactedContext) {
          request.redactedContext = redactor.redactContext(
            request.redactedContext,
          ).context;
        }
        request.utterance = redactor.redact(request.utterance).redacted;
        const response = await llm.generateGuide(request);
        json(req, res, 200, response);
      } catch (err) {
        // Never log request bodies — they may describe the user's screen.
        console.error('[voiceguide] /api/llm failed:', (err as Error).message);
        const status = err instanceof HttpError ? err.status : 400;
        const error = err instanceof HttpError ? err.clientMessage : 'bad request';
        json(req, res, status, { error });
      }
      return;
    }

    json(req, res, 404, { error: 'not found' });
  })().catch((err) => {
    console.error('[voiceguide] request failed:', (err as Error).message);
    const status = err instanceof HttpError ? err.status : 500;
    const error =
      err instanceof HttpError ? err.clientMessage : 'internal server error';
    json(req, res, status, { error });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[voiceguide] server listening on http://${HOST}:${PORT}`);
});
