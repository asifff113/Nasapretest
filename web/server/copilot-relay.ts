// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The copilot relay: the only code that talks to the model. The browser sends the conversation; the relay adds the
// fixed instructions and tools (src/copilot/contract.ts), so a visitor cannot change what the model is told or
// allowed to do. The API key stays on the server (ANTHROPIC_API_KEY). Tools run in the browser, against the
// build's own files, and their results come back here as ordinary tool_result blocks.
// Served by the Vite dev server (build/plugins.ts) and by the Vercel function api/copilot.ts.
// Provider: Google Gemini when GEMINI_API_KEY is set (copilot-gemini.ts), else Claude when ANTHROPIC_API_KEY is set.
import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { LIMITS, MODEL, SYSTEM_PROMPT, TOOLS } from '../src/copilot/contract.js';
import { GEMINI_MODEL, geminiConfigured, geminiError, geminiTurn } from './copilot-gemini.js';

type Messages = Anthropic.Beta.Messages.BetaMessageParam[];

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  client ??= new Anthropic();
  return client;
}

// A small per-visitor limit for a public demo (per server instance; a host's own limits apply on top).
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 40;
const hits = new Map<string, number[]>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_WINDOW) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > LIMITS.maxBytes) throw new Error('too_large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The conversation must start with the user, alternate roles and stay within the limits. */
export function checkMessages(x: unknown): Messages | string {
  if (!Array.isArray(x) || x.length === 0) return 'messages must be a non-empty array';
  if (x.length > LIMITS.maxMessages) return 'conversation too long: start a new one';
  let expect = 'user';
  for (const m of x) {
    if (!m || typeof m !== 'object') return 'bad message';
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== expect) return 'roles must alternate, starting with the user';
    if (typeof content !== 'string' && !Array.isArray(content)) return 'bad message content';
    expect = expect === 'user' ? 'assistant' : 'user';
  }
  if (expect !== 'assistant') return 'the last message must be the user\'s';
  return x as Messages;
}

export async function handleCopilot(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const gemini = geminiConfigured();
  if (req.method === 'GET') return send(res, 200, { available: gemini || getClient() !== null, provider: gemini ? 'gemini' : 'anthropic', model: gemini ? GEMINI_MODEL : MODEL });
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const anthropic = gemini ? null : getClient();
  if (!gemini && !anthropic) return send(res, 503, { error: 'not_configured' });
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0]!.trim();
  if (!allowed(ip)) return send(res, 429, { error: 'rate_limited' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, err instanceof Error && err.message === 'too_large' ? 413 : 400, { error: 'bad_request' });
  }
  const messages = checkMessages((parsed as { messages?: unknown })?.messages);
  if (typeof messages === 'string') return send(res, 400, { error: 'bad_request', detail: messages });
  if (gemini) {
    try {
      return send(res, 200, await geminiTurn(messages as never, (parsed as { state?: { previous_interaction_id?: unknown } }).state));
    } catch (err) {
      const e = geminiError(err);
      return send(res, e.status, { error: e.error });
    }
  }
  if (!anthropic) return send(res, 503, { error: 'not_configured' });
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: LIMITS.maxTokens,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS as unknown as Anthropic.Beta.Messages.BetaToolUnion[],
      output_config: { effort: 'medium' },
      // On a policy decline the API reruns the request on a fallback model it chooses ("default").
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages,
    });
    return send(res, 200, { content: response.content, stop_reason: response.stop_reason, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'model_busy' });
    if (err instanceof Anthropic.AuthenticationError) return send(res, 503, { error: 'not_configured' });
    if (err instanceof Anthropic.BadRequestError) return send(res, 400, { error: 'model_rejected', detail: err.message.slice(0, 300) });
    if (err instanceof Anthropic.APIError) return send(res, 502, { error: 'model_error', status: err.status });
    return send(res, 502, { error: 'model_unreachable' });
  }
}
