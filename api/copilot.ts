// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Vercel function for the copilot relay (POST /api/copilot). The handler lives in web/server/copilot-relay.ts; set
// ANTHROPIC_API_KEY in the Vercel project's environment variables. GitHub Pages serves no functions: there the
// copilot reports itself unavailable and the rest of the site works as before.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleCopilot } from '../web/server/copilot-relay.js';

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleCopilot(req, res);
}
