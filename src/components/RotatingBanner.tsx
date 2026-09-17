import { useEffect, useState } from 'react';
import type { Sponsor } from '../types';

interface Props {
  sponsors?: Sponsor[];
  /** ms per slide */
  interval?: number;
  /** show the small SportsWeb One "advertise" link tag (admin/public, not in export) */
  showAdvertise?: boolean;
  /** Click-through for the "Advertise with us" tag — an email (auto-mailto'd) or a URL. */
  advertiseHref?: string;
}

/** Sensible default if a club hasn't set their own enquiries contact yet. */
const DEFAULT_ADVERTISE_HREF = 'mailto:president@geelongaflmasters.com.au';

/** Accept either an email address or a full URL and return a usable href. */
function resolveAdvertiseHref(value?: string): string {
  const raw = (value ?? '').trim();
  if (!raw) return DEFAULT_ADVERTISE_HREF;
  if (/^(https?:\/\/|mailto:)/i.test(raw)) return raw;
  // looks like a bare email -> mailto
  if (raw.includes('@') && !/\s/.test(raw)) return `mailto:${raw}`;
  return raw;
}

/**
 * Sponsor banner above the ground that rotates through each banner slot.
 * The "Advertise with us" call-to-action is a small corner tag (a SportsWeb One
 * revenue hook) — NOT one of the rotating banners.
 */
export default function RotatingBanner({ sponsors, interval = 3800, showAdvertise = true, advertiseHref }: Props) {
  // Only slots with a real banner/logo/name count — the editor seeds placeholder
  // "Banner N" slots, and those shouldn't suppress the empty-state CTA.
  const real = (sponsors ?? []).filter(
    (s) => s.bannerUrl || s.logoUrl || (s.name && !/^banner \d+$/i.test(s.name.trim())),
  );
  const slides = real.length > 0 ? real : [{ name: 'Banner 1' }];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setI(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const id = setInterval(() => setI((n) => (n + 1) % slides.length), interval);
    return () => clearInterval(id);
  }, [slides.length, interval, paused]);

  const active = slides[i % slides.length];

  // Empty state: no sponsors yet — fill the strip with an "Advertise with us here"
  // call-to-action instead of a blank placeholder, so the space sells itself.
  if (real.length === 0) {
    return (
      <div className="sw1-banner sw1-banner--empty">
        {showAdvertise ? (
          <a
            className="sw1-banner__empty"
            href={resolveAdvertiseHref(advertiseHref)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="sw1-banner__empty-main">Advertise with us here</span>
            <span className="sw1-banner__empty-sub">Your business in front of the whole club — every team, every round</span>
            <span className="sw1-banner__empty-tag">Click here to book this ad →</span>
          </a>
        ) : (
          <span className="sw1-banner__empty sw1-banner__empty--quiet" aria-hidden="true" />
        )}
      </div>
    );
  }

  const inner = active.bannerUrl ? (
    // The strip is 6:1 and the stylesheet fills it edge to edge (object-fit:
    // cover). Deliberately no per-image fit from here: an inline style would
    // override the stylesheet, which is exactly how a 6:1 banner used to end
    // up letterboxed with blank space either side.
    <img className="sw1-banner__img" src={active.bannerUrl} alt={active.name} />
  ) : (
    <div className="sw1-banner__fallback">
      {active.tier && <span className="sw1-banner__tier">{active.tier}</span>}
      {active.logoUrl ? (
        <img src={active.logoUrl} alt={active.name} />
      ) : (
        <span className="sw1-banner__name">{active.name}</span>
      )}
    </div>
  );

  return (
    <div
      className="sw1-banner"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="sw1-banner__slide" key={i}>
        {active.href ? (
          <a href={active.href} target="_blank" rel="noopener noreferrer" aria-label={active.name}>
            {inner}
          </a>
        ) : (
          inner
        )}
      </div>

      {slides.length > 1 && (
        <div className="sw1-banner__dots" aria-hidden>
          {slides.map((_, n) => (
            <span key={n} className={n === i ? 'is-active' : ''} />
          ))}
        </div>
      )}

      {showAdvertise && (
        <a
          className="sw1-banner__advertise"
          href={resolveAdvertiseHref(advertiseHref)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Advertise with us →
        </a>
      )}
    </div>
  );
}
