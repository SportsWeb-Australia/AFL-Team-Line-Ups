import { useEffect, useState } from 'react';
import logo from '../assets/app-logo.png';

/**
 * Branded launch screen — shows the AFL Team Line Ups crest on a dark
 * stadium-green wash, then fades away. Skipped inside club embeds.
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
      <div className="sw1-splash__inner">
        <img src={logo} alt="AFL Team Line Ups" className="sw1-splash__logo" />
        <div className="sw1-splash__tag">Built for fans. Made for game day.</div>
      </div>
    </div>
  );
}
