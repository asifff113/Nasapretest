// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The copilot on Google Gemini, through the Interactions API of @google/genai (stateful: Google keeps the
// conversation and the model's thought signatures; each request sends only the new turn with the id of the previous
// interaction). The relay calls this when GEMINI_API_KEY is set. It translates both ways so the browser keeps one
// format: the browser's tool_result blocks become function_result steps, and the model's function_call steps and
// text come back as tool_use and text blocks. Instructions and tools are the same contract as for any model.
import { ApiError, GoogleGenAI } from '@google/genai';
import { LIMITS, SYSTEM_PROMPT, TOOLS } from '../src/copilot/contract.js';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

type Block = { type: string; [k: string]: unknown };
export interface Turn {
  role: 'user' | 'assistant';
  content: string | Block[];
}
export interface RelayReply {
  content: Block[];
  stop_reason: string;
  model: string;
  /** What the browser sends back next time: the interaction to continue. */
  state: { previous_interaction_id: string };
}

/** The contract's JSON Schema in the subset Gemini's function parameters accept: a nullable field ("type":
 * ["string","null"]) becomes an optional field of its single type, and the strict-mode keys are dropped. */
export function geminiParameters(schema: { properties: Record<string, Record<string, unknown>>; required: readonly string[] }) {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    const t = prop.type;
    const nullable = Array.isArray(t) && t.includes('null');
    properties[name] = { ...prop, type: Array.isArray(t) ? t.find((x) => x !== 'null') : t };
    if (!nullable && schema.required.includes(name)) required.push(name);
  }
  return { type: 'object', properties, required };
}

export const GEMINI_TOOLS = TOOLS.map((t) => ({
  type: 'function' as const,
  name: t.name,
  description: t.description,
  parameters: geminiParameters(t.input_schema as unknown as { properties: Record<string, Record<string, unknown>>; required: readonly string[] }),
}));

/** The new input of this turn: the user's text, or the results of the tools the model asked for. Gemini requires each
 * function_result to name its function; the browser's tool_result blocks carry only the call id, so `names` maps each
 * call id to the tool the model called (from the previous assistant turn). */
export function turnInput(last: Turn, names?: Map<string, string>): string | Record<string, unknown>[] {
  if (typeof last.content === 'string') return last.content;
  const steps: Record<string, unknown>[] = [];
  for (const b of last.content) {
    if (b.type === 'tool_result') {
      const id = String(b.tool_use_id);
      const name = names?.get(id);
      steps.push({ type: 'function_result', call_id: id, ...(name ? { name } : {}), result: String(b.content ?? '') });
    }
    else if (b.type === 'text') steps.push({ type: 'user_input', content: [{ type: 'text', text: String(b.text) }] });
  }
  return steps;
}

/** The model's steps as the browser's blocks; the stop reason the browser's loop understands. */
export function toBlocks(steps: { type: string; [k: string]: unknown }[], status: string): { content: Block[]; stop_reason: string } {
  const content: Block[] = [];
  for (const s of steps) {
    if (s.type === 'function_call') content.push({ type: 'tool_use', id: String(s.id), name: String(s.name), input: (s.arguments ?? {}) as Record<string, unknown> });
    else if (s.type === 'model_output') {
      for (const c of (s.content ?? []) as { type: string; text?: string }[]) if (c.type === 'text' && c.text) content.push({ type: 'text', text: c.text });
    }
  }
  const calls = content.some((b) => b.type === 'tool_use');
  const stop_reason = calls ? 'tool_use' : status === 'incomplete' ? 'max_tokens' : status === 'completed' ? 'end_turn' : status;
  return { content, stop_reason };
}

/** Every tool call in the conversation's assistant turns: call id → tool name. */
export function callNames(messages: Turn[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of messages) {
    if (m.role !== 'assistant' || typeof m.content === 'string') continue;
    for (const b of m.content) if (b.type === 'tool_use' && b.id && b.name) out.set(String(b.id), String(b.name));
  }
  return out;
}

let client: GoogleGenAI | null = null;

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function geminiTurn(messages: Turn[], state: { previous_interaction_id?: unknown } | undefined): Promise<RelayReply> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const previous = typeof state?.previous_interaction_id === 'string' ? state.previous_interaction_id : undefined;
  // A new conversation sends its whole text; a continued one sends only the latest turn, with each tool result named
  // after the call it answers.
  const input = previous ? turnInput(messages[messages.length - 1]!, callNames(messages)) : messages.length === 1 ? turnInput(messages[0]!) : null;
  if (input === null) throw new Error('lost_state');
  const interaction = await client.interactions.create({
    model: GEMINI_MODEL,
    system_instruction: SYSTEM_PROMPT,
    tools: GEMINI_TOOLS,
    input: input as never,
    previous_interaction_id: previous,
    generation_config: { thinking_level: 'low', max_output_tokens: LIMITS.maxTokens },
  });
  const { content, stop_reason } = toBlocks((interaction.steps ?? []) as { type: string; [k: string]: unknown }[], String(interaction.status));
  return { content, stop_reason, model: GEMINI_MODEL, state: { previous_interaction_id: interaction.id } };
}

export function geminiError(err: unknown): { status: number; error: string } {
  // The models client throws ApiError; the Interactions client throws its own error classes (BadRequestError, …),
  // which are not exported: both carry the HTTP status.
  const status = err instanceof ApiError ? err.status : typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : null;
  if (status !== null) {
    if (status === 429) return { status: 429, error: 'model_busy' };
    if (status === 401 || status === 403) return { status: 503, error: 'not_configured' };
    if (status === 400) return { status: 400, error: 'model_rejected' };
    return { status: 502, error: 'model_error' };
  }
  if (err instanceof Error && err.message === 'lost_state') return { status: 409, error: 'lost_state' };
  return { status: 502, error: 'model_unreachable' };
}
