// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// About (docs/04_UI.md §4.13): the project, the team and the licences.
import { Info } from 'lucide-react';
import { useT } from '../i18n';
import { Page, PageHeader } from '../components/Page';

export default function AboutScreen() {
  const t = useT();
  const roles = ['a', 'b', 'c'] as const;
  const licences = ['code', 'data', 'fonts', 'icons', 'outlines', 'libs'] as const;
  return (
    <Page wide={false}>
      <PageHeader eyebrow={<Info className="inline size-4" aria-hidden="true" />} title={t('nav.about')} lead={t('app.subtitle')} />
      <section className="flex flex-col gap-3 text-[17px] leading-relaxed">
        <p>{t('site.about.body_1')}</p>
        <p>{t('site.about.body_2')}</p>
      </section>
      <section className="mt-10">
        <h2 className="text-h2">{t('site.about.team_title')}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {roles.map((r) => (
            <li key={r} className="rounded-[10px] border border-line bg-surface p-4">
              <p className="font-mono text-sm text-accent-ink">{r.toUpperCase()}</p>
              <p className="mt-1 font-semibold">{t(`site.about.role_${r}`)}</p>
              <p className="mt-1 text-[15px] text-muted">{t(`site.about.role_${r}_body`)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10">
        <h2 className="text-h2">{t('site.about.licences_title')}</h2>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-6 text-[15px]">
          {licences.map((l) => (
            <li key={l}>{t(`site.about.licence_${l}`)}</li>
          ))}
        </ul>
      </section>
      <section className="mt-10">
        <h2 className="text-h2">{t('site.about.challenge_title')}</h2>
        <p className="mt-2 text-[17px]">{t('site.about.challenge_body')}</p>
      </section>
    </Page>
  );
}
