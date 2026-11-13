// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Data & credits (docs/04_UI.md §4.13; docs/02_DATA.md §12): the citations from the catalog, the products and
// files of this build from input_manifest.json, and the credits for boundaries and outlines.
import { Database } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int } from '../i18n/format';
import type { Manifest } from '../data/types';
import { useCatalog, useResult } from '../data/hooks';
import { useLang } from '../state/prefs';
import { WithData } from '../components/LoadState';
import { Body } from '../components/Page';
import { Hero } from '../components/atlas/Hero';
import { KindBadge } from '../components/RecordCard';
import { SimpleTable } from '../components/PivotTable';

export default function DataCreditsScreen() {
  const t = useT();
  const lang = useLang();
  const catalog = useCatalog();
  const manifest = useResult<Manifest>('input_manifest.json');
  return (
    <>
      <Hero
        wide={false}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Database className="size-4" aria-hidden="true" />
            {t('app.name')}
          </span>
        }
        title={t('nav.data')}
        lead={t('site.data.lead')}
      />
      <Body wide={false}>
      <section className="flex flex-col gap-4">
        <h2 className="text-chapter">{t('site.data.used_title')}</h2>
        <WithData res={catalog}>
          {(c) => (
            <ul className="flex flex-col gap-3" data-testid="citations">
              {c.sources
                .filter((s) => s.status !== 'deferred')
                .map((s) => {
                  const vars = c.variables.filter((v) => v.source === s.id);
                  return (
                    <li key={s.id} className="atlas-panel rounded-card border border-line bg-surface p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{s.name}</p>
                        {vars[0] ? <KindBadge v={vars[0]} /> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {[s.short_name, s.version ? `${t('provenance.version')} ${s.version}` : null, s.doi && s.doi_verified ? `DOI ${s.doi}` : null].filter(Boolean).join(' · ')}
                      </p>
                      {vars.length ? <p className="mt-1 text-sm">{vars.map((v) => pick(v.name, lang)).join(' · ')}</p> : null}
                      {s.citation ? <p className="mt-2 text-[15px]">{s.citation}</p> : null}
                      {s.reference ? <p className="mt-1 text-sm text-muted">{s.reference}</p> : null}
                      {s.licence ? <p className="mt-1 text-sm text-muted">{t('site.data.licence', { licence: s.licence })}</p> : null}
                    </li>
                  );
                })}
            </ul>
          )}
        </WithData>
      </section>
      <section className="mt-12 flex flex-col gap-4">
        <h2 className="text-chapter">{t('site.data.files_title')}</h2>
        <WithData res={manifest} path="input_manifest.json">
          {(m) => (
            <SimpleTable
              testId="manifest-table"
              head={[t('provenance.dataset'), t('provenance.version'), t('site.methods.months'), t('site.methods.granules'), t('site.data.route')]}
              rows={m.products.map((p) => [p.shortName, p.version, `${p.firstMonth} – ${p.lastMonth}`, int(p.granuleCount, lang), p.query.provider])}
            />
          )}
        </WithData>
      </section>
      <section className="mt-12 flex flex-col gap-3">
        <h2 className="text-chapter">{t('site.data.other_title')}</h2>
        <ul className="flex list-disc flex-col gap-2 pl-6 text-[15px]">
          <li>{t('site.data.boundaries')}</li>
          <li>{t('site.data.outlines')}</li>
          <li>{t('site.data.power')}</li>
          <li>{t('site.data.no_logos')}</li>
        </ul>
      </section>
    </Body>
    </>
  );
}
