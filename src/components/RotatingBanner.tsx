import { useEffect, useState } from 'react';
import type { Sponsor } from '../types';

interface Props {
  sponsors?: Sponsor[];
  /** ms per slide */
  interval?: number;
  /** show the small SportsWeb One "advertise" link tag (admin/public, not in export) */
  showAdvertise?: boolean;
}

/**
 * Sponsor banner above the ground that rotates through each banner slot.
 * The "Advertise with us" call-to-action is a small corner tag (a SportsWeb One
 * revenue hook) — NOT one of the rotating banners.
 */
export default function RotatingBanner({ sponsors, interval = 3800, showAdvertise = true }: Props) {
  const slides = sponsors && sponsors.length > 0 ? sponsors : [{ name: 'Banner 1' }];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // Wide banners (≈4:1 or wider) fill the strip; small/square logos stay contained
  // so they aren't cropped. Decided per image once it loads.
  const [fit, setFit] = useState<'cover' | 'contain'>('contain');

  useEffect(() => {
    setI(0);
  }, [slides.length]);

  useEffect(() => {
    setFit('contain'); // reset until the new slide's image reports its ratio
  }, [i]);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const id = setInterval(() => setI((n) => (n + 1) % slides.length), interval);
    return () => clearInterval(id);
  }, [slides.length, interval, paused]);

  const active = slides[i % slides.length];

  const inner = active.bannerUrl ? (
    <img
      className="sw1-banner__img"
      src={active.bannerUrl}
      alt={active.name}
      style={{ objectFit: fit }}
      onLoad={(e) => {
        const im = e.currentTarget;
        if (im.naturalHeight > 0) {
          // Only switch to cover for ULTRA-wide banners (wider than the strip box
          // itself). Anything 4:1–~7:1 stays contained so the whole sponsor banner
          // is visible — cover was cropping the sides of normal wide banners.
          setFit(im.naturalWidth / im.naturalHeight >= 8 ? 'cover' : 'contain');
        }
      }}
    />
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
          href="https://sportsweb.com.au"
          target="_blank"
          rel="noopener noreferrer"
        >
          Advertise with us →
        </a>
      )}
    </div>
  );
}
