import { useEffect, useState } from 'react';
import poster from '../assets/splash-poster.png';

/**
 * Branded launch screen — the Footy Team Line Ups poster, full-bleed on a dark
 * stadium wash, then fades away. Skipped inside club embeds.
 */
export default function Splash() {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHide(true), 2500);
    const t2 = setTimeout(() => setGone(true), 3050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div className={`sw1-splash ${hide ? 'is-hidden' : ''}`} aria-hidden="true">
      <img src={poster} alt="Footy Team Line Ups" className="sw1-splash__poster" />
    </div>
  );
}
