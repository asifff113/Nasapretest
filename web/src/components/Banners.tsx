// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The synthetic-data banner (yellow, top, cannot be dismissed while synthetic data show), the offline banner
// and the results-unreachable banner (docs/01_ARCHITECTURE.md §9; docs/04_UI.md §10).
import { useEffect, useState } from 'react';
import { CloudOff, FlaskConical, WifiOff } from 'lucide-react';
import { useT } from '../i18n';
import { useSession } from '../data/hooks';
import { IS_OFFLINE_BUILD } from '../data/offline';

function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function Banners() {
  const t = useT();
  const { synthetic, unreachable, offlineMiss } = useSession();
  const online = useOnline();
  const showOffline = (IS_OFFLINE_BUILD && offlineMiss) || (!IS_OFFLINE_BUILD && !online);
  return (
    <div className="relative z-50">
      {synthetic ? (
        <div role="status" data-testid="synthetic-banner" className="bg-banner text-banner-ink">
          <div className="mx-auto flex max-w-[1280px] items-center gap-2.5 px-4 py-2 text-[14px] font-medium sm:px-6">
            <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
            <span>{t('banner.synthetic')}</span>
          </div>
        </div>
      ) : null}
      {showOffline ? (
        <div role="status" data-testid="offline-banner" className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2.5 px-4 py-2 text-[14px] sm:px-6">
            <WifiOff className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span>{t('banner.offline')}</span>
            <a href="#/offline" className="font-medium">
              {t('nav.offline')}
            </a>
          </div>
        </div>
      ) : null}
      {unreachable && !IS_OFFLINE_BUILD ? (
        <div role="alert" data-testid="unreachable-banner" className="border-b border-noverdict/40 bg-surface">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2.5 px-4 py-2 text-[14px] sm:px-6">
            <CloudOff className="size-4 shrink-0 text-noverdict" aria-hidden="true" />
            <span>{t('banner.results_unreachable')}</span>
            <a href="#/offline" className="font-medium">
              {t('nav.offline')}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
