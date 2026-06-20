import type { ReactNode } from 'react';

/* ── Minimal inline icons (no deps), inherit currentColor ─────────────────── */
const IconWeb = (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false">
    <rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M3 8h18M9 21h6M12 17v4" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
  </svg>
);
const IconBooks = (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false">
    <path d="M5 4h9a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M16 6h3v14H7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M8.5 8.5h4M8.5 11.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const IconDocs = (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false">
    <path d="M7 3h7l4 4v14H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M14 3v4h4M9.5 12h5M9.5 15h5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);
const IconCart = (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false">
    <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 8H6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9.5" cy="20" r="1.3" fill="currentColor" />
    <circle cx="17.5" cy="20" r="1.3" fill="currentColor" />
  </svg>
);
const IconCards = (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false">
    <rect x="3.5" y="6.5" width="11" height="14" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.7" transform="rotate(-8 9 13)" />
    <rect x="9.5" y="4.5" width="11" height="14" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.7" transform="rotate(8 15 11)" />
    <path d="M15 8.4l1 2 2.2.2-1.7 1.5.5 2.2-2-1.2-2 1.2.5-2.2-1.7-1.5 2.2-.2z" fill="currentColor" />
  </svg>
);
const IconPos = (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false">
    <rect x="4" y="3" width="16" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M4 10h16" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 6.4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 14v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const IconIntegrate = (
  <svg viewBox="0 0 24 24" aria-hidden focusable="false">
    <circle cx="6" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="18" cy="6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="18" cy="18" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8.1 10.9l7.8-3.8M8.1 13.1l7.8 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export interface SwModule {
  key: string;
  label: string;
  icon: ReactNode;
}

export const SPORTSWEB_MODULES: SwModule[] = [
  { key: 'web', label: 'Premium websites & club apps', icon: IconWeb },
  { key: 'books', label: 'Books — club finance & treasury', icon: IconBooks },
  { key: 'workplace', label: 'Workplace — docs & office suite, MS & Google compatible', icon: IconDocs },
  { key: 'store', label: 'Superstore — low transaction fees, built for local sport, easy to reconcile, stock control & more', icon: IconCart },
  { key: 'pos', label: 'POS — coming soon', icon: IconPos },
  { key: 'cards', label: 'Engagement — tools that keep members, players & supporters coming back time after time', icon: IconCards },
  { key: 'integrate', label: 'Every system integrates seamlessly — no disconnected tools from 10 different suppliers', icon: IconIntegrate },
];

/** Seamless horizontal marquee of module chips (used under the top banner). */
export function ModuleMarquee() {
  const items = [...SPORTSWEB_MODULES, ...SPORTSWEB_MODULES];
  return (
    <div className="sw1-marquee" aria-hidden>
      <div className="sw1-marquee__track">
        {items.map((m, i) => (
          <span key={`${m.key}-${i}`} className="sw1-marquee__item">
            <span className="sw1-marquee__icon">{m.icon}</span>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
