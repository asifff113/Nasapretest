// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { useT } from '../i18n';
import { Logo } from './Logo';

export function Footer() {
  const t = useT();
  const links = [
    { href: '#/data', key: 'nav.data' },
    { href: '#/ai', key: 'nav.ai_use' },
    { href: '#/offline', key: 'nav.offline' },
    { href: '#/about', key: 'nav.about' },
    { href: '#/methods', key: 'nav.methods' },
  ];
  return (
    <footer className="mt-16 border-t border-line bg-surface-2/60 pb-28 lg:pb-0">
      <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="flex max-w-xl gap-3">
          <Logo className="mt-0.5 size-7 shrink-0" />
          <div>
            <p className="font-semibold">{t('app.name')}</p>
            <p className="mt-1 text-[15px] text-muted">{t('home.credit_line')}</p>
            <p className="mt-2 text-sm text-muted">{t('site.footer.no_ai')}</p>
          </div>
        </div>
        <nav aria-label={t('site.footer.nav')} className="flex flex-wrap content-start gap-x-5 gap-y-2 text-[15px]">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="inline-flex min-h-11 items-center">
              {t(l.key)}
            </a>
          ))}
          <a href={t('site.footer.source_url')} className="inline-flex min-h-11 items-center" rel="noopener">
            {t('site.footer.source')}
          </a>
        </nav>
      </div>
    </footer>
  );
}
