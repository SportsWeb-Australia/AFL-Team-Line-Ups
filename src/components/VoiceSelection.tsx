import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player, PlayerStatus } from '../types';
import { parseSelection, TARGET_LABEL, type PlayerRef, type VoiceAction, type VoiceTarget } from '../lib/voiceParse';

/**
 * Voice selection: read the side out, check what was heard, apply it.
 *
 * Speech goes through the browser's own recogniser (Chrome, Edge, Safari on
 * iPhone and Android), so there's no audio upload and no per-minute cost. What
 * it hears lands in an editable box — a misheard surname is fixed by typing, not
 * by saying it again — and every action is listed with a tick before anything
 * touches the sheet. The same box takes typed or pasted text, so a team list
 * copied from a group chat goes through the same path.
 */

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

function getRecognizer(): (new () => SR) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const ROLE_LABEL: Partial<Record<PlayerStatus, string>> = {
  captain: 'Captain',
  'vice-captain': 'Vice-captain',
  debut: 'Debut',
  milestone: 'Milestone',
  injured: 'Injured',
  concussion: 'Concussion',
  suspended: 'Suspended',
  personal: 'Unavailable (personal)',
};

function describe(a: VoiceAction): string {
  switch (a.kind) {
    case 'add':
      return `Add ${a.number ? `#${a.number} ` : ''}${a.name}${a.target ? ` → ${TARGET_LABEL[a.target]}` : ' to the squad'}`;
    case 'place':
      return `${a.name} → ${TARGET_LABEL[a.target]}`;
    case 'role':
      return `${a.name}: ${ROLE_LABEL[a.role]}`;
    case 'status':
      return `${a.name}: ${ROLE_LABEL[a.reason]}`;
    default:
      return a.why;
  }
}

interface Props {
  players: Player[];
  onAddPlayer: (number: string, name: string) => string | void;
  onQuickPlace: (id: string, target: VoiceTarget) => void;
  onSetRole: (id: string, role: PlayerStatus, on: boolean) => void;
  onSetAvailability: (id: string, reason: PlayerStatus | null) => void;
}

export default function VoiceSelection({ players, onAddPlayer, onQuickPlace, onSetRole, onSetAvailability }: Props) {
  const Recognizer = useMemo(getRecognizer, []);
  const rec = useRef<SR | null>(null);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  const actions = useMemo(() => parseSelection(text, players), [text, players]);
  const usable = actions.filter((a, i) => a.kind !== 'unknown' && !skip.has(i));

  const start = () => {
    if (!Recognizer) return;
    const r = new Recognizer();
    r.lang = 'en-AU';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const said = String(res[0].transcript).trim();
          if (said) setText((t) => (t.trim() ? `${t.trim()}\n${said}` : said));
        } else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e: any) => {
      setMsg({
        ok: false,
        text:
          e?.error === 'not-allowed'
            ? 'Microphone access is blocked. Allow it in the browser’s site settings, or type the side below.'
            : 'Listening stopped. Tap Start talking to carry on.',
      });
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    setMsg(null);
    r.start();
    setListening(true);
  };

  const stop = () => rec.current?.stop();

  const apply = () => {
    const created = new Map<number, string>();
    const idOf = (ref: PlayerRef) => ('id' in ref ? ref.id : created.get(ref.pending));
    let done = 0;
    actions.forEach((a, i) => {
      if (a.kind !== 'add' || skip.has(i)) return;
      const id = onAddPlayer(a.number, a.name);
      if (id) created.set(a.pending, id);
      done++;
    });
    actions.forEach((a, i) => {
      if (skip.has(i)) return;
      if (a.kind === 'add' && a.target) {
        const id = created.get(a.pending);
        if (id) onQuickPlace(id, a.target);
      } else if (a.kind === 'place') {
        const id = idOf(a.who);
        if (id) (onQuickPlace(id, a.target), done++);
      } else if (a.kind === 'role') {
        const id = idOf(a.who);
        if (id) (onSetRole(id, a.role, true), done++);
      } else if (a.kind === 'status') {
        const id = idOf(a.who);
        if (id) (onSetAvailability(id, a.reason), done++);
      }
    });
    setMsg({ ok: true, text: `Applied ${done} ${done === 1 ? 'change' : 'changes'}. Check the ground, then Save.` });
    setText('');
    setSkip(new Set());
  };

  return (
    <div className="sw1-voice">
      <div className="sw1-voice__head">
        <span className="sw1-voice__title">
          <MicIcon /> Voice selection
        </span>
        <span className="sw1-voice__badge">Premium</span>
      </div>
      <p className="sw1-admin__hint">
        Read the side out, one player at a time with a short pause: <em>&ldquo;23 Jack Reardon full forward&rdquo;</em>,{' '}
        <em>&ldquo;Okafor captain&rdquo;</em>, <em>&ldquo;Wallis injured&rdquo;</em>, <em>&ldquo;Eli Brooks interchange&rdquo;</em>. New names
        are added to the squad; names already there are moved.
      </p>

      <div className="sw1-voice__controls">
        {Recognizer ? (
          <button
            type="button"
            className={`sw1-voice__mic${listening ? ' is-on' : ''}`}
            onClick={listening ? stop : start}
            aria-pressed={listening}
          >
            <MicIcon />
            {listening ? 'Stop' : 'Start talking'}
          </button>
        ) : (
          <span className="sw1-admin__hint">This browser can&rsquo;t listen. Use Chrome, Edge or Safari, or type below.</span>
        )}
        {listening && (
          <span className="sw1-voice__live" aria-live="polite">
            {interim || 'Listening…'}
          </span>
        )}
      </div>

      <label className="sw1-voice__box">
        <span>What was heard (fix any names here, or type or paste a list)</span>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSkip(new Set());
          }}
          placeholder={'23 Jack Reardon full forward\nOkafor captain\nWallis injured'}
        />
      </label>

      {actions.length > 0 && (
        <ul className="sw1-voice__list">
          {actions.map((a, i) => (
            <li key={i} className={a.kind === 'unknown' ? 'is-unknown' : skip.has(i) ? 'is-skipped' : ''}>
              {a.kind === 'unknown' ? (
                <span className="sw1-voice__flag" aria-hidden>
                  ?
                </span>
              ) : (
                <input
                  type="checkbox"
                  checked={!skip.has(i)}
                  aria-label={`Include: ${describe(a)}`}
                  onChange={() =>
                    setSkip((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
              )}
              <span className="sw1-voice__what">
                <strong>{describe(a)}</strong>
                <small>&ldquo;{a.heard}&rdquo;</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="sw1-voice__actions">
        <button type="button" className="sw1-btn sw1-btn--primary" disabled={!usable.length} onClick={apply}>
          Apply {usable.length || ''} {usable.length === 1 ? 'change' : 'changes'}
        </button>
        {text && (
          <button type="button" className="sw1-btn" onClick={() => (setText(''), setSkip(new Set()))}>
            Clear
          </button>
        )}
      </div>
      {msg && <p className={`sw1-addmsg ${msg.ok ? 'is-ok' : 'is-err'}`}>{msg.text}</p>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
