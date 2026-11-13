// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// ProvenancePanel (docs/04_UI.md §4.10): dataset (name, short name, version, DOI), years used, values used and
// missing, route, build id, pre-registration SHA-256, input-manifest SHA-256, engine and config hash, and a
// link to the result file itself.
import { useState } from 'react';
import { Check, Copy, FileJson } from 'lucide-react';
import { useT } from '../i18n';
import { int, shortHash } from '../i18n/format';
import type { Provenance, Window } from '../data/types';
import { useLang } from '../state/prefs';
import { useBuild } from '../data/hooks';
import { IS_OFFLINE_BUILD } from '../data/offline';

function HashValue({ value }: { value: string | null | undefined }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <code className="truncate font-mono text-[13px]" title={value}>
        {shortHash(value, 16)}
      </code>
      <button
        type="button"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink/[0.06] hover:text-ink"
        aria-label={t('site.provenance.copy_hash')}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      </button>
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="m-0 min-w-0 text-[15px] tabular">{children}</dd>
    </div>
  );
}

export function ProvenancePanel({
  provenance,
  window,
  used,
  missing,
  resultPath,
}: {
  provenance: Provenance;
  window?: Window;
  used?: number;
  missing?: number;
  resultPath?: string;
}) {
  const t = useT();
  const lang = useLang();
  const build = useBuild();
  const root = build.data?.root ?? '';
  const fileHref = resultPath && !IS_OFFLINE_BUILD ? `${root.replace(/\/+$/, '')}/${resultPath}` : null;
  return (
    <div data-tour="provenance" data-testid="provenance" className="text-[15px]">
      <dl className="m-0">
        {provenance.items.map((it) => (
          <Row key={`${it.shortName}-${it.version}`} label={t('provenance.dataset')}>
            <span className="block">{it.product}</span>
            <span className="mt-0.5 block text-sm text-muted">
              {it.shortName} · {t('provenance.version')} {it.version}
              {it.doi ? (
                <>
                  {' · DOI '}
                  <span className="font-mono text-[13px]">{it.doi}</span>
                </>
              ) : null}
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {t('site.provenance.route')}: {it.route}
              {it.granules !== null ? ` · ${t('site.provenance.granules', { n: it.granules })}` : ''}
            </span>
            {it.note ? <span className="mt-0.5 block text-sm text-muted">{it.note}</span> : null}
          </Row>
        ))}
        {window ? (
          <Row label={t('provenance.years')}>
            {int(window.first, lang)}–{int(window.last, lang)}
          </Row>
        ) : null}
        {used !== undefined ? (
          <Row label={t('provenance.values')}>
            {t('site.provenance.used_missing', { used: int(used, lang), missing: int(missing ?? 0, lang) })}
          </Row>
        ) : null}
        <Row label={t('provenance.build')}>
          <code className="font-mono text-[13px]">{provenance.buildId}</code>
          <span className="ml-2 text-sm text-muted">{provenance.created.slice(0, 10)}</span>
        </Row>
        <Row label={t('provenance.prereg')}>
          <HashValue value={provenance.preregSha256} />
        </Row>
        <Row label={t('provenance.manifest')}>
          <HashValue value={provenance.inputManifestSha256} />
        </Row>
        <Row label={t('provenance.engine')}>
          <span className="block">{provenance.engine}</span>
          <span className="mt-0.5 block text-sm text-muted">
            {t('site.provenance.config')}: <HashValue value={provenance.configSha256} />
          </span>
        </Row>
      </dl>
      {fileHref ? (
        <a href={fileHref} className="mt-3 inline-flex min-h-11 items-center gap-2 font-medium" target="_blank" rel="noopener" data-testid="result-file-link">
          <FileJson className="size-4" aria-hidden="true" />
          {t('site.provenance.result_file')}
        </a>
      ) : resultPath ? (
        <p className="mt-3 break-all font-mono text-xs text-muted">{resultPath}</p>
      ) : null}
    </div>
  );
}
