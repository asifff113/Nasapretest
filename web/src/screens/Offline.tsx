// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Cases on this device (docs/04_UI.md §4.12): the cases in offline/set.json, their count, titles and files.
import { FileJson, HardDriveDownload, Play } from 'lucide-react';
import { pick, useT } from '../i18n';
import { bytes, int } from '../i18n/format';
import { useOfflineSet } from '../data/cases';
import { IS_OFFLINE_BUILD } from '../data/offline';
import { useLang } from '../state/prefs';
import { href } from '../state/view';
import { WithData } from '../components/LoadState';
import { Page, PageHeader } from '../components/Page';
import { buttonVariants } from '../ui/common/button';
import { Disclosure } from '../ui/common/collapsible';

export function OfflineList() {
  const t = useT();
  const lang = useLang();
  const set = useOfflineSet();
  return (
    <WithData res={set} path="offline/set.json">
      {(s) => (
        <div data-testid="offline-list">
          <p className="mb-4 font-medium tabular" data-testid="offline-count">
            {t('offline.count', { n: int(s.cases.length, lang) })} · {bytes(s.totalBytes, lang)}
          </p>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {s.cases.map((c) => (
              <li key={c.id} className="flex flex-col rounded-[10px] border border-line bg-surface p-4 shadow-card" data-testid={`offline-case-${c.id}`}>
                <p className="font-mono text-xs text-muted">{c.id}</p>
                <h3 className="mt-1 font-semibold leading-snug">{pick(c.title, lang)}</h3>
                <Disclosure className="mt-3" title={t('site.offline.files', { n: int(c.files.length, lang) })} icon={<FileJson className="size-4 text-muted" aria-hidden="true" />}>
                  <ul className="flex flex-col gap-1">
                    {c.files.map((f) => (
                      <li key={f} className="break-all font-mono text-xs text-muted">
                        {f}
                      </li>
                    ))}
                  </ul>
                </Disclosure>
                <a href={href({ screen: 'watch', case: c.id })} className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-3 self-start`}>
                  <Play aria-hidden="true" />
                  {t('site.offline.play')}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WithData>
  );
}

export default function OfflineScreen() {
  const t = useT();
  return (
    <Page>
      <PageHeader eyebrow={<HardDriveDownload className="inline size-4" aria-hidden="true" />} title={t('offline.title')} lead={t('offline.intro')} />
      <OfflineList />
      {!IS_OFFLINE_BUILD ? (
        <div className="mt-10 flex flex-col items-start gap-3 rounded-[12px] border border-line bg-surface p-5">
          <p className="max-w-[68ch] text-[15px]">{t('site.offline.how_to_get')}</p>
          <a href="./casefile-earth-offline.html" download className={buttonVariants({ variant: 'accent' })} data-testid="offline-download">
            <HardDriveDownload aria-hidden="true" />
            {t('site.offline.download')}
          </a>
        </div>
      ) : null}
    </Page>
  );
}
