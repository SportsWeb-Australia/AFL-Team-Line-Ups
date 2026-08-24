import { useEffect, useState } from 'react';

/** The non-standard event Chromium fires when the app is installable. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

/** iPadOS 13+ reports a Macintosh UA, so touch points are what give it away. */
const isIpadOs = () =>
  /macintosh/i.test(window.navigator.userAgent) && window.navigator.maxTouchPoints > 1;

const isIos = () =>
  (/iphone|ipad|ipod/i.test(window.navigator.userAgent) || isIpadOs()) &&
  !/crios|fxios/i.test(window.navigator.userAgent);

/**
 * Phone or tablet only. `beforeinstallprompt` fires on desktop Chrome and Edge
 * just as readily as on Android, so without this the install bar turns up on a
 * laptop — where nobody wants a home-screen icon and the club is usually just
 * building the sheet. UA first for the devices that declare themselves, then a
 * touch-first AND small-screen fallback, so a touchscreen laptop stays desktop.
 */
const isMobile = () => {
  if (/android|iphone|ipod|ipad|windows phone/i.test(window.navigator.userAgent)) return true;
  if (isIpadOs()) return true;
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(max-width: 1024px)').matches
  );
};

/**
 * Floating "Install app" prompt — game-day convenience, so mobile only.
 *
 * Chromium (Android) fires `beforeinstallprompt`, which we capture and replay on
 * tap. iOS Safari has no such event, so we show the manual Share → Add to Home
 * Screen hint instead. Hidden on desktop, and once installed or dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isMobile()) return; // desktop never gets the install bar
    if (isStandalone()) return; // already installed
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // iOS gets no event — offer the manual hint after a short beat.
    const t = isIos() ? window.setTimeout(() => setShowIosHint(true), 1200) : 0;
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) window.clearTimeout(t);
    };
  }, []);

  // Re-checked at render, not just in the effect: a captured `deferred` event
  // must never paint the bar on a desktop that resized or matched late.
  if (!isMobile()) return null;
  if (dismissed || isStandalone()) return null;
  if (!deferred && !showIosHint) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setDismissed(true);
  };

  return (
    <div className="sw1-install" role="dialog" aria-label="Install app">
      <div className="sw1-install__txt">
        {deferred ? (
          <>Install <strong>Footy Team Line Ups</strong> for quick game-day access.</>
        ) : (
          <>Install this app: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.</>
        )}
      </div>
      {deferred && (
        <button className="sw1-install__btn" onClick={install}>
          Install app
        </button>
      )}
      <button
        className="sw1-install__x"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
