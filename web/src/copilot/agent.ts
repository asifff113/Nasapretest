// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The copilot's conversation loop in the browser. It sends the conversation to the relay (/api/copilot), runs the
// tools the model asks for against the build's own files, opens the evidence in the workspace, and checks the final
// answer before showing it (validate.ts). If the check fails, a verified summary built from the files replaces it.
import { create } from 'zustand';
import type { Lang } from '../data/types';
import type { View } from '../state/view';
import { href, useView } from '../state/view';
import { loadCurrent, loadJson, MissingFileError } from '../data/results';
import type { Catalog, RegionIndex } from '../data/types';
import type { ExploreIndex } from '../data/explore';
import { LIMITS } from './contract';
import { runTool, type Evidence, type Outcome, type Store } from './executors';
import { checkAnswer } from './validate';

// ---- the wire format (the Messages API's content blocks, kept as the relay returns them) ------------------------
type Block = { type: string; [k: string]: unknown };
export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string | Block[];
}

export interface Reply {
  text: string;
  /** False when the written answer failed the checks and the verified summary is shown instead. */
  checked: boolean;
  replaced: boolean;
  evidence: Evidence[];
  views: View[];
}

export interface Exchange {
  question: string;
  reply?: Reply;
  error?: string;
}

interface CopilotState {
  open: boolean;
  available: boolean | null;
  busy: boolean;
  messages: ApiMessage[];
  /** The provider's state for continuing the conversation (Gemini: the previous interaction id). */
  state: Record<string, unknown> | null;
  exchanges: Exchange[];
  /** A challenge panel the copilot asked to open: "<region>|<variable>|<season>". */
  challengeKey: string | null;
  setOpen: (open: boolean) => void;
  reset: () => void;
  clearChallenge: () => void;
}

export const useCopilot = create<CopilotState>((set) => ({
  open: false,
  available: null,
  busy: false,
  messages: [],
  state: null,
  exchanges: [],
  challengeKey: null,
  setOpen: (open) => set({ open }),
  reset: () => set({ messages: [], state: null, exchanges: [], busy: false }),
  clearChallenge: () => set({ challengeKey: null }),
}));

/** Asks the relay whether the copilot is configured here (it is not on a static host or in the offline file). */
export async function checkAvailable(): Promise<boolean> {
  try {
    const res = await fetch('./api/copilot', { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const body = (await res.json()) as { available?: boolean };
    return body.available === true;
  } catch {
    return false;
  }
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  storePromise ??= (async () => {
    const build = await loadCurrent();
    const root = build.root;
    const load = async <T,>(p: string): Promise<T | null> => {
      try {
        return await loadJson<T>(root, p);
      } catch (err) {
        if (err instanceof MissingFileError) return null;
        throw err;
      }
    };
    const [catalog, regionIndex, exploreIndex] = await Promise.all([load<Catalog>('catalog.json'), load<RegionIndex>('regions/index.json'), load<ExploreIndex>('explore/index.json')]);
    if (!catalog || !regionIndex) throw new Error('the result build has no catalog or region index');
    return { buildId: build.buildId, catalog, regionIndex, exploreIndex, load };
  })();
  return storePromise;
}

/** Opens a view in the workspace; a requested challenge panel is opened by the verdict view when it appears. */
function openView(view: View & { challenge?: boolean }) {
  const { challenge, ...rest } = view;
  useView.getState().navigate(rest);
  if (challenge && rest.region && rest.variable) useCopilot.setState({ challengeKey: `${rest.region}|${rest.variable}|${rest.season ?? 'ANN'}` });
}

async function relay(messages: ApiMessage[], state: Record<string, unknown> | null): Promise<{ content: Block[]; stop_reason: string | null; state: Record<string, unknown> | null }> {
  const res = await fetch('./api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, state }) });
  const body = (await res.json().catch(() => ({}))) as { content?: Block[]; stop_reason?: string | null; error?: string; state?: Record<string, unknown> };
  if (!res.ok || !body.content) throw new Error(body.error ?? `http_${res.status}`);
  return { content: body.content, stop_reason: body.stop_reason ?? null, state: body.state ?? null };
}

/** Every tool result already in the conversation (earlier turns), parsed back from its tool_result block. A follow-up
 * answer may repeat a number a tool returned earlier in the same conversation; it is still a number from the files. */
export function priorToolResults(messages: ApiMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role !== 'user' || typeof m.content === 'string') continue;
    for (const b of m.content) {
      if (b.type !== 'tool_result') continue;
      try {
        out.push(JSON.parse(String(b.content ?? '')));
      } catch {
        out.push(String(b.content ?? ''));
      }
    }
  }
  return out;
}

/** A summary made only of file content, used when a written answer fails the checks. */
function verifiedSummary(outcomes: Outcome[], lang: Lang): string {
  const main = [...outcomes].reverse().find((o) => o.evidence && o.result.evidence_class);
  if (!main) return lang === 'bn' ? 'এই প্রশ্নের উত্তর এই সাইটের ফলাফল-ফাইলে নেই।' : 'This site\'s result files do not hold an answer to that question.';
  const r = main.result as { evidence_class?: string; engine_headline?: string; reason?: string; findings?: { id?: string; kind: string; text: string }[]; rate?: { display?: string | null } };
  const lines = [`${r.evidence_class}.`];
  if (r.engine_headline) lines.push(r.engine_headline);
  else if (r.rate?.display) lines.push(r.rate.display);
  if (r.reason) lines.push(r.reason);
  // The headline already states the deciding test; add the first limitation that is not the test itself.
  const limit = (r.findings as { id?: string; kind: string; text: string }[] | undefined)?.find((f) => f.kind === 'qualify' && !String(f.id).startsWith('test_'));
  if (limit) lines.push(limit.text);
  return lines.join(' ');
}

/** One question: the full tool loop, then the checked answer. */
export async function ask(question: string, lang: Lang): Promise<void> {
  const st = useCopilot.getState();
  if (st.busy || !question.trim()) return;
  const exchanges = [...st.exchanges, { question }];
  const messages: ApiMessage[] = [...st.messages, { role: 'user', content: question }];
  const earlier = priorToolResults(st.messages);
  let state = st.state;
  useCopilot.setState({ busy: true, exchanges });
  const outcomes: Outcome[] = [];
  const views: View[] = [];
  try {
    const store = await getStore();
    for (let round = 0; round <= LIMITS.toolRoundsPerTurn; round++) {
      const res = await relay(messages, state);
      state = res.state ?? state;
      messages.push({ role: 'assistant', content: res.content });
      if (res.stop_reason === 'pause_turn') continue;
      if (res.stop_reason === 'tool_use') {
        const results: Block[] = [];
        for (const b of res.content.filter((x) => x.type === 'tool_use')) {
          const outcome = await runTool(String(b.name), (b.input ?? {}) as Record<string, unknown>, store, lang);
          outcomes.push(outcome);
          if (outcome.view) {
            openView(outcome.view);
            const { challenge: _c, ...plain } = outcome.view;
            void _c;
            if (!views.some((v) => href(v) === href(plain))) views.push(plain);
          }
          results.push({ type: 'tool_result', tool_use_id: String(b.id), content: JSON.stringify(outcome.result) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      if (res.stop_reason === 'refusal') throw new Error('refusal');
      if (res.stop_reason === 'max_tokens') throw new Error('too_long');
      const written = res.content.filter((x) => x.type === 'text').map((x) => String(x.text)).join('\n').trim();
      const check = checkAnswer(written, [...earlier, ...outcomes.map((o) => o.result)], question);
      const reply: Reply = {
        text: check.ok && written ? written : verifiedSummary(outcomes, lang),
        checked: check.ok,
        replaced: !check.ok || !written,
        evidence: outcomes.flatMap((o) => (o.evidence ? [o.evidence] : [])),
        views,
      };
      exchanges[exchanges.length - 1] = { question, reply };
      useCopilot.setState({ messages, state, exchanges: [...exchanges], busy: false });
      return;
    }
    throw new Error('too_many_steps');
  } catch (err) {
    exchanges[exchanges.length - 1] = { question, error: err instanceof Error ? err.message : String(err) };
    // The failed turn is not kept: the next question starts from the last complete exchange.
    useCopilot.setState({ exchanges: [...exchanges], busy: false });
  }
}
