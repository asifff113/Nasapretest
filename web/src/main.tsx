// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { applyLang, applyTheme, usePrefs } from './state/prefs';
import { startHashSync } from './state/view';

const prefs = usePrefs.getState();
applyTheme(prefs.theme);
applyLang(prefs.lang);
startHashSync();

// Follow the system theme while the choice is "system".
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (usePrefs.getState().theme === 'system') applyTheme('system');
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
