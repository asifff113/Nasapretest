// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { lazy, Suspense, useEffect, useRef, type ComponentType } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Banners } from './components/Banners';
import { ConfidenceSpine } from './components/ConfidenceSpine';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageSkeleton } from './components/LoadState';
import { useView, type Screen } from './state/view';
import { useT } from './i18n';
import { Home } from './screens/Home';

// Screens load on demand, so the first view stays small (docs/01_ARCHITECTURE.md §8).
const screens: Record<Exclude<Screen, 'home'>, ComponentType> = {
  question: lazy(() => import('./screens/Question')),
  place: lazy(() => import('./screens/Place')),
  compare: lazy(() => import('./screens/Compare')),
  map: lazy(() => import('./screens/MapScreen')),
  methods: lazy(() => import('./screens/Methods')),
  watch: lazy(() => import('./screens/Watch')),
  offline: lazy(() => import('./screens/Offline')),
  data: lazy(() => import('./screens/DataCredits')),
  ai: lazy(() => import('./screens/AiUse')),
  about: lazy(() => import('./screens/About')),
};

export function App() {
  const view = useView((s) => s.view);
  const t = useT();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Move focus to the page on navigation (not on first load), and set the document title.
  useEffect(() => {
    const titleKey = view.screen === 'home' ? null : `site.title.${view.screen}`;
    document.title = titleKey ? `${t(titleKey)} · ${t('app.name')}` : t('app.name');
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    main.current?.focus({ preventScroll: true });
  }, [view.screen, view.case, t]);

  const ScreenComp = view.screen === 'home' ? Home : screens[view.screen];

  return (
    <>
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-[10px] focus:bg-surface focus:px-4 focus:py-3 focus:shadow-lift"
      >
        {t('app.skip_to_content')}
      </a>
      <Banners />
      <Header />
      <ConfidenceSpine />
      <main id="main" ref={main} tabIndex={-1} className="flex-1 outline-none" data-screen={view.screen}>
        <ErrorBoundary key={view.screen}>
          <Suspense fallback={<PageSkeleton />}>
            <ScreenComp />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
