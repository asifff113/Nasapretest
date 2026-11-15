// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The investigation copilot: a panel beside the workspace. The conversation drives the charts (the evidence opens
// beside the panel); each answer shows its evidence class, whether its numbers passed the checks, its sources and
// the views it opened. Where the relay is not available (a static host, the offline file) it says so and points to
// the ask box, which works without it.
import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, RotateCcw, Send, X } from 'lucide-react';
import { useT } from '../i18n';
import { useLang } from '../state/prefs';
import { href, type View } from '../state/view';
import { useSpineStore } from '../state/spine';
import { Button } from '../ui/common/button';
import { cn } from '../ui/common/utils';
import { ask, checkAvailable, useCopilot, type Exchange } from './agent';

const ERROR_KEYS = new Set(['refusal', 'rate_limited', 'model_busy', 'not_configured']);
const VIEW_KEYS = new Set(['place', 'compare', 'map', 'trends', 'methods']);

export { COPILOT_HOSTED } from './hosted';

/** The floating button that opens the copilot, on every page (bottom right). It appears once the relay says it is
 * configured, hides while the panel is open, and sits above the bars fixed to the bottom of a phone screen (the
 * step bar, through --bottombar, and the current-claim bar when a result is on screen). */
export function CopilotLauncher() {
  const t = useT();
  const { open, setOpen, available } = useCopilot();
  const claim = useSpineStore((s) => s.claim !== null);
  useEffect(() => {
    if (available === null) checkAvailable().then((ok) => useCopilot.setState({ available: ok }));
  }, [available]);
  if (open || available !== true) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      title={t('site.copilot.panel.open')}
      data-testid="copilot-open"
      className={cn(
        'fixed right-4 z-40 inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-accent px-3.5 text-[15px] font-semibold text-ocean shadow-lift sm:right-6 sm:px-5 lg:bottom-6',
        'transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        claim ? 'bottom-[calc(var(--bottombar,0px)+56px)]' : 'bottom-[calc(var(--bottombar,0px)+16px)]',
      )}
    >
      <MessagesSquare className="size-5" aria-hidden="true" />
      <span className="hidden sm:inline">{t('site.copilot.panel.open')}</span>
      <span className="sr-only sm:hidden">{t('site.copilot.panel.open')}</span>
    </button>
  );
}

function Answer({ ex }: { ex: Exchange }) {
  const t = useT();
  if (ex.error) {
    const key = ERROR_KEYS.has(ex.error) ? `site.copilot.panel.errors.${ex.error}` : 'site.copilot.panel.errors.other';
    return <p className="rounded-md border border-line px-3 py-2 text-[14px] text-muted" role="alert">{t(key, { code: ex.error })}</p>;
  }
  const r = ex.reply;
  if (!r) return null;
  const classes = [...new Set(r.evidence.map((e) => e.cls))];
  const sources = [...new Set(r.evidence.flatMap((e) => e.sources))];
  return (
    <div className="flex flex-col gap-2" data-testid="copilot-answer" data-checked={r.checked} data-replaced={r.replaced}>
      {classes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <span key={c} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] font-semibold" data-class={c}>
              {t(`site.copilot.class.${c}`)}
            </span>
          ))}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{r.text}</p>
      <p className="text-[12px] text-muted">{r.replaced ? t('site.copilot.panel.replaced') : t('site.copilot.panel.checked')}</p>
      {r.views.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="text-muted">{t('site.copilot.panel.opened')}:</span>
          {r.views.map((v: View, i) => (
            <a key={i} href={href(v)} className="rounded-md border border-line px-2 py-0.5 no-underline hover:bg-ink/[0.05]">
              {VIEW_KEYS.has(v.screen) ? t(`site.copilot.panel.view.${v.screen}`) : v.screen}
            </a>
          ))}
        </div>
      ) : null}
      {sources.length > 0 ? (
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer">{t('site.copilot.panel.sources')} ({sources.length})</summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono">
            {sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function CopilotPanel() {
  const t = useT();
  const lang = useLang();
  const { open, setOpen, available, busy, exchanges, reset } = useCopilot();
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && available === null) checkAvailable().then((ok) => useCopilot.setState({ available: ok }));
  }, [open, available]);
  // A block body: some browsers return a Promise from scrollIntoView, and an effect may only return a clean-up.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [exchanges.length, busy]);

  if (!open) return null;
  const submit = (q: string) => {
    if (!q.trim() || busy) return;
    setDraft('');
    void ask(q.trim(), lang);
  };
  const suggestions = ['s1', 's2', 's3', 's4', 's5'].map((k) => t(`site.copilot.panel.suggestions.${k}`));

  return (
    <aside id="copilot-panel" aria-label={t('site.copilot.panel.title')} className="fixed bottom-0 right-0 top-[var(--header-h)] z-40 flex w-full flex-col border-l border-line bg-surface shadow-lift sm:w-[420px]" data-testid="copilot-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          <MessagesSquare aria-hidden="true" className="size-5" />
          {t('site.copilot.panel.title')}
        </h2>
        <div className="flex items-center gap-1">
          {exchanges.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy} title={t('site.copilot.panel.new')} aria-label={t('site.copilot.panel.new')}>
              <RotateCcw aria-hidden="true" />
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label={t('site.copilot.panel.close')}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        <p className="text-[13.5px] text-muted">{t('site.copilot.panel.intro')}</p>
        <p className="mt-1 text-[12px] text-muted">{t('site.copilot.panel.ai_note')}</p>
        {available === null ? <p className="mt-4 text-[14px] text-muted">{t('site.copilot.panel.checking')}</p> : null}
        {available === false ? (
          <div className="mt-4 rounded-md border border-line p-3 text-[14px]" data-testid="copilot-unavailable">
            <p>{t('site.copilot.panel.unavailable')}</p>
            <a href={href({ screen: 'map' })} className="mt-2 inline-block">{t('site.copilot.panel.to_map')}</a>
          </div>
        ) : null}
        {available && exchanges.length === 0 ? (
          <div className="mt-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t('site.copilot.panel.suggestions_title')}</p>
            <div className="mt-2 flex flex-col items-start gap-1.5">
              {suggestions.map((s) => (
                <button key={s} type="button" className="rounded-md border border-line px-3 py-1.5 text-left text-[14px] hover:bg-ink/[0.05]" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ol className="mt-4 flex flex-col gap-5">
          {exchanges.map((ex, i) => (
            <li key={i} className="flex flex-col gap-2">
              <p className="self-end rounded-[10px] bg-ink/[0.06] px-3 py-2 text-[15px]">
                <span className="sr-only">{t('site.copilot.panel.you')}: </span>
                {ex.question}
              </p>
              {ex.reply || ex.error ? (
                <div>
                  <span className="sr-only">{t('site.copilot.panel.copilot')}: </span>
                  <Answer ex={ex} />
                </div>
              ) : (
                <p className="text-[14px] text-muted">{t('site.copilot.panel.thinking')}</p>
              )}
            </li>
          ))}
        </ol>
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          rows={2}
          maxLength={600}
          disabled={!available || busy}
          placeholder={t('site.copilot.panel.placeholder')}
          aria-label={t('site.copilot.panel.placeholder')}
          className="min-h-11 flex-1 resize-none rounded-md border border-line-strong bg-bg px-3 py-2 text-[15px] outline-none focus:border-ink/50"
          data-testid="copilot-input"
        />
        <Button type="submit" variant="primary" disabled={!available || busy || !draft.trim()} aria-label={t('site.copilot.panel.send')}>
          <Send aria-hidden="true" />
        </Button>
      </form>
    </aside>
  );
}
