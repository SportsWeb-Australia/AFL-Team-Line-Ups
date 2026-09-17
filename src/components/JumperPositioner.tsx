import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Player } from '../types';
import PlayerPlate from './PlayerPlate';

/**
 * Drag the team jumper into place on its name plate.
 *
 * Every product shot is framed differently: a top-half crop needs lifting so the
 * chest graphic clears the plate, an off-centre shot needs sliding across. One
 * jumper image serves the whole team, so one position does too.
 *
 * The preview is a REAL field plate — the same PlayerPlate inside the same
 * `.sw1-slot` the ground uses, enlarged — so what the club lines up here is what
 * lands on every player, rather than an approximation of it. The offset reaches
 * the plate through the `--jumper-x` / `--jumper-y` custom properties on
 * `.sw1-root`, which this panel sits inside, so the preview and the graphic can
 * never disagree.
 *
 * Offsets are percent of the jumper image's own rendered size, so one setting
 * holds on a 40px phone plate, a 58px desktop plate and the PNG export alike.
 */

export type JumperOffset = { x: number; y: number };

/** Beyond this the jumper leaves its plate entirely — not a useful position. */
const LIMIT = 40;
const STEP = 2;
const BIG_STEP = 6;

const clamp = (n: number) => Math.max(-LIMIT, Math.min(LIMIT, Math.round(n * 2) / 2));

function describe({ x, y }: JumperOffset): string {
  if (!x && !y) return 'Centred';
  const parts: string[] = [];
  if (y) parts.push(`${y < 0 ? 'Up' : 'Down'} ${Math.abs(y)}`);
  if (x) parts.push(`${x < 0 ? 'Left' : 'Right'} ${Math.abs(x)}`);
  return parts.join(' · ');
}

interface Props {
  jumperUrl: string;
  offset: JumperOffset;
  onChange: (next: JumperOffset) => void;
  /** A real squad member makes the preview recognisable; falls back to a stand-in. */
  samplePlayer?: Player;
  /** Only Jumper mode draws the jumper on the ground. */
  jumperModeOn: boolean;
}

export default function JumperPositioner({ jumperUrl, offset, onChange, samplePlayer, jumperModeOn }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; start: JumperOffset; w: number; h: number; id: number } | null>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef(offset);
  latest.current = offset;

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const player: Player = samplePlayer ?? { id: 'jumper-preview', number: '7', name: 'Player Name' };

  const nudge = (dx: number, dy: number) =>
    onChange({ x: clamp(latest.current.x + dx), y: clamp(latest.current.y + dy) });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const img = stageRef.current?.querySelector('.sw1-plate__art img');
    if (!img) return;
    // The on-screen size of the jumper, preview enlargement included, so a pixel
    // of pointer travel converts to exactly the percent the ground will apply.
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return;
    drag.current = { px: e.clientX, py: e.clientY, start: { ...latest.current }, w: r.width, h: r.height, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const next = {
      x: clamp(d.start.x + ((e.clientX - d.px) / d.w) * 100),
      y: clamp(d.start.y + ((e.clientY - d.py) / d.h) * 100),
    };
    // One update per frame: every change re-renders the whole team sheet behind
    // this panel, and pointermove fires far faster than the screen repaints.
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (next.x !== latest.current.x || next.y !== latest.current.y) onChange(next);
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = e.shiftKey ? BIG_STEP : STEP;
    const move: Record<string, [number, number]> = {
      ArrowUp: [0, -s],
      ArrowDown: [0, s],
      ArrowLeft: [-s, 0],
      ArrowRight: [s, 0],
    };
    if (move[e.key]) {
      e.preventDefault();
      nudge(...move[e.key]);
    } else if (e.key === '0' || e.key === 'Home') {
      e.preventDefault();
      onChange({ x: 0, y: 0 });
    }
  };

  const moved = offset.x !== 0 || offset.y !== 0;

  return (
    <div className="sw1-jumperpos">
      <div className="sw1-jumperpos__head">
        <span className="sw1-jumperpos__title">Position the jumper</span>
        <span className={`sw1-jumperpos__readout ${moved ? 'is-moved' : ''}`} aria-live="polite">
          {describe(offset)}
        </span>
      </div>

      <div className="sw1-jumperpos__body">
        <div
          ref={stageRef}
          className="sw1-jumperpos__stage"
          tabIndex={0}
          role="group"
          aria-label="Jumper position. Drag the jumper, or use the arrow keys. Hold Shift to move further. Press 0 to centre."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          {/* Field plates size themselves off the ground's width (cqw). This
              panel is far narrower than the ground, so on its own the plate
              would drop to its phone size and seat the jumper differently from
              the embed and the PNG. A ground-width sizing canvas, clipped by the
              stage, makes the preview use the same desktop plate they do. */}
          <div className="sw1-jumperpos__canvas">
            <div className="sw1-slot sw1-jumperpos__slot">
              <PlayerPlate player={player} visualMode="jumper" teamJumperUrl={jumperUrl} compact />
            </div>
          </div>
          <span className="sw1-jumperpos__grip" aria-hidden>
            Drag to move
          </span>
        </div>

        <div className="sw1-jumperpos__pad" role="group" aria-label="Nudge the jumper">
          <button type="button" className="sw1-jumperpos__btn is-up" onClick={() => nudge(0, -STEP)} aria-label="Move jumper up">
            <Chevron dir="up" />
          </button>
          <button type="button" className="sw1-jumperpos__btn is-left" onClick={() => nudge(-STEP, 0)} aria-label="Move jumper left">
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            className="sw1-jumperpos__btn is-reset"
            onClick={() => onChange({ x: 0, y: 0 })}
            disabled={!moved}
            aria-label="Centre the jumper"
          >
            Centre
          </button>
          <button type="button" className="sw1-jumperpos__btn is-right" onClick={() => nudge(STEP, 0)} aria-label="Move jumper right">
            <Chevron dir="right" />
          </button>
          <button type="button" className="sw1-jumperpos__btn is-down" onClick={() => nudge(0, STEP)} aria-label="Move jumper down">
            <Chevron dir="down" />
          </button>
        </div>
      </div>

      <p className="sw1-admin__hint">
        Drag the jumper, or tap the arrows. This moves it on <strong>every player</strong>, on the ground, the bench and
        the downloaded image.
        {!jumperModeOn && (
          <>
            {' '}
            Set the look above to <strong>Jumper</strong> to see it on the ground.
          </>
        )}
      </p>
    </div>
  );
}

function Chevron({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }) {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
