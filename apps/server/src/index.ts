import { createServer } from 'node:http';
import {
  MockLLMProvider,
  PrivacyRedactor,
  builtinPacks,
  type GuideLLMRequest,
  type LLMProvider,
} from '@voiceguide/core';
import { AnthropicLLMProvider } from './anthropicProvider.js';

const PORT = Number(process.env['VOICEGUIDE_SERVER_PORT'] ?? 8787);

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

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
      json(res, 204, {});
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      json(res, 200, { ok: true, llmProvider: llm.name });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/packs') {
      json(res, 200, {
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
        const raw = await readBody(req);
        const request = JSON.parse(raw) as GuideLLMRequest;
        // Defense in depth: redact again server-side before it reaches any
        // model provider, even though clients redact first.
        if (request.redactedContext) {
          request.redactedContext = redactor.redactContext(
            request.redactedContext,
          ).context;
        }
        request.utterance = redactor.redact(request.utterance).redacted;
        const response = await llm.generateGuide(request);
        json(res, 200, response);
      } catch (err) {
        // Never log request bodies — they may describe the user's screen.
        console.error('[voiceguide] /api/llm failed:', (err as Error).message);
        json(res, 400, { error: 'bad request' });
      }
      return;
    }

    json(res, 404, { error: 'not found' });
  })();
});

server.listen(PORT, () => {
  console.log(`[voiceguide] server listening on http://localhost:${PORT}`);
});
