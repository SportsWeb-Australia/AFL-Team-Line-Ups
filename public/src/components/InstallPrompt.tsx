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

const isIos = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
  !/crios|fxios/i.test(window.navigator.userAgent);

/**
 * Floating "Install app" prompt.
 *
 * Chromium (desktop Chrome/Edge, Android) fires `beforeinstallprompt`, which we
 * capture and replay on tap. iOS Safari has no such event, so we show the manual
 * Share → Add to Home Screen hint instead. Hidden once installed or dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
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
          <>Install <strong>AFL Team Line Ups</strong> for quick game-day access.</>
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
