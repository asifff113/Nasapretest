// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { useState } from 'react';
import { Languages, Menu, Monitor, Moon, Sun } from 'lucide-react';
import { useT } from '../i18n';
import { usePrefs, type Theme } from '../state/prefs';
import { useView, type Screen } from '../state/view';
import { Button } from '../ui/common/button';
import { Sheet } from '../ui/common/dialog';
import { cn } from '../ui/common/utils';
import { Logo } from './Logo';

const NAV: { screen: Screen; key: string; href: string }[] = [
  { screen: 'question', key: 'nav.question', href: '#/question' },
  { screen: 'compare', key: 'nav.compare', href: '#/compare' },
  { screen: 'map', key: 'nav.map', href: '#/map' },
  { screen: 'watch', key: 'nav.watch', href: '#/watch' },
  { screen: 'methods', key: 'nav.methods', href: '#/methods' },
];

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

export function LanguageToggle({ className }: { className?: string }) {
  const t = useT();
  const { lang, setLang } = usePrefs();
  const other = lang === 'en' ? 'bn' : 'en';
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('min-h-11 gap-1.5 px-3', className)}
      onClick={() => setLang(other)}
      lang={other}
      aria-label={t('site.header.switch_language')}
      data-testid="language-toggle"
    >
      <Languages aria-hidden="true" />
      <span className={other === 'bn' ? 'font-[family-name:var(--font-bn)]' : ''}>{t('app.language_toggle')}</span>
    </Button>
  );
}

export function ThemeToggle() {
  const t = useT();
  const { theme, setTheme } = usePrefs();
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label={t('site.header.theme', { theme: t(`site.theme.${theme}`) })}
      title={t('site.header.theme', { theme: t(`site.theme.${theme}`) })}
      data-testid="theme-toggle"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

export function Header() {
  const t = useT();
  const screen = useView((s) => s.view.screen);
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-[var(--header-h)] max-w-[1280px] items-center gap-3 px-4 sm:px-6">
        <a href="#/" className="flex items-center gap-2.5 rounded-md text-ink no-underline hover:no-underline" aria-label={`${t('app.name')} · ${t('nav.home')}`}>
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">{t('app.name')}</span>
        </a>
        <nav aria-label={t('site.header.main_nav')} className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.screen}
              href={n.href}
              aria-current={screen === n.screen ? 'page' : undefined}
              className={cn(
                'relative rounded-[8px] px-3 py-2 text-[15px] font-medium text-muted no-underline hover:bg-ink/[0.05] hover:text-ink hover:no-underline',
                screen === n.screen && 'text-ink after:absolute after:inset-x-3 after:-bottom-[9px] after:h-[2px] after:rounded-full after:bg-accent',
              )}
            >
              {t(n.key)}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t('site.header.menu')} aria-expanded={open}>
            <Menu aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title={t('site.header.menu')} closeLabel={t('site.common.close')}>
        <nav aria-label={t('site.header.main_nav')} className="flex flex-col gap-1">
          {[{ screen: 'home' as Screen, key: 'nav.home', href: '#/' }, ...NAV, { screen: 'offline' as Screen, key: 'nav.offline', href: '#/offline' }].map((n) => (
            <a
              key={n.screen}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={screen === n.screen ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center rounded-[10px] px-3 text-[17px] font-medium text-ink no-underline hover:bg-ink/[0.05] hover:no-underline',
                screen === n.screen && 'bg-accent-soft',
              )}
            >
              {t(n.key)}
            </a>
          ))}
        </nav>
      </Sheet>
    </header>
  );
}
