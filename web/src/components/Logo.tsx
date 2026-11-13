// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The mark: a case folder with a trend line. Drawn in code; no logo of any agency.
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H12l3 3h11.5A2.5 2.5 0 0 1 29 11.5v13a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 3 24.5z" fill="var(--accent)" />
      <path d="M3 12.5h26" stroke="var(--accent-ink)" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M8 22l4.5-4.5 3.5 3 7-7.5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="13" r="1.8" fill="#fff" />
    </svg>
  );
}
