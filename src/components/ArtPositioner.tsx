import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { ArtPosition } from '../types';
import { CENTRED, SCALE_MAX, SCALE_MIN, clampScale, clampXY, isCentred } from '../lib/artPosition';

export { CENTRED, isCentred };

/**
 * Drag a picture into place on its name plate: the team jumper, the team's
 * headshots, one player's headshot, or the staff polos.
 *
 * Every photo and product shot is framed differently: a top-half crop needs
 * lifting so the chest graphic clears the plate, a headshot taken from further
 * back needs growing, an off-centre shot needs sliding across.
 *
 * The preview is a REAL plate — the same PlayerPlate inside the same `.sw1-slot`
 * (or `.sw1-staff`) the graphic uses, enlarged — so what the club lines up here
 * is what lands on the sheet, rather than an approximation of it. The position
 * reaches that plate through CSS custom properties (on `.sw1-root`, which this
 * panel sits inside, or on the plate itself for one player), so the preview and
 * the graphic can never disagree.
 *
 * Offsets are percent of the picture's own rendered size, so one setting holds
 * on a 40px phone plate, a 58px desktop plate and the PNG export alike.
 */

const STEP = 2;
const BIG_STEP = 6;
const SCALE_STEP = 0.05;

function describe({ x, y, scale = 1 }: ArtPosition, withScale: boolean): string {
  const parts: string[] = [];
  if (y) parts.push(`${y < 0 ? 'Up' : 'Down'} ${Math.abs(y)}`);
  if (x) parts.push(`${x < 0 ? 'Left' : 'Right'} ${Math.abs(x)}`);
  if (withScale && scale !== 1) parts.push(`Size ${Math.round(scale * 100)}%`);
  return parts.length ? parts.join(' · ') : 'Centred';
}

interface Props {
  title: string;
  value: ArtPosition;
  onChange: (next: ArtPosition) => void;
  /** The plate to line up, already wrapped in the context that sizes it. */
  children: ReactNode;
  /** 'field' draws a patch of the ground; 'staff' the light coaches'-box panel. */
  stage?: 'field' | 'staff';
  /** Offer the size slider. The team jumper doesn't: it's sized to the plate. */
  allowScale?: boolean;
  /** Explains what this moves. */
  hint?: ReactNode;
  /** Replaces the readout, e.g. "Same as team". */
  readout?: string;
  /** An extra action beside the pad, e.g. "Use team position". */
  extra?: ReactNode;
}

export default function ArtPositioner({
  title,
  value,
  onChange,
  children,
  stage = 'field',
  allowScale = false,
  hint,
  readout,
  extra,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; start: ArtPosition; w: number; h: number; id: number } | null>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  const scale = value.scale ?? 1;
  const emit = (next: Partial<ArtPosition>) => {
    const cur = latest.current;
    onChange({
      x: clampXY(next.x ?? cur.x),
      y: clampXY(next.y ?? cur.y),
      scale: allowScale ? clampScale(next.scale ?? cur.scale ?? 1) : 1,
    });
  };
  const nudge = (dx: number, dy: number) => emit({ x: latest.current.x + dx, y: latest.current.y + dy });
  const grow = (d: number) => emit({ scale: (latest.current.scale ?? 1) + d });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const art = stageRef.current?.querySelector('.sw1-plate__art > img, .sw1-plate__art > svg');
    if (!art) return;
    // The on-screen size of the picture, preview enlargement included, so a pixel
    // of pointer travel converts to exactly the percent the graphic will apply.
    // Translate percentages are of the UNSCALED picture, so take the size back out.
    const r = art.getBoundingClientRect();
    const s = latest.current.scale ?? 1;
    if (!r.width || !r.height) return;
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      start: { ...latest.current },
      w: r.width / s,
      h: r.height / s,
      id: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const x = clampXY(d.start.x + ((e.clientX - d.px) / d.w) * 100);
    const y = clampXY(d.start.y + ((e.clientY - d.py) / d.h) * 100);
    // One update per frame: every change re-renders the whole team sheet behind
    // this panel, and pointermove fires far faster than the screen repaints.
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (x !== latest.current.x || y !== latest.current.y) emit({ x, y });
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
    } else if (allowScale && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      grow(SCALE_STEP);
    } else if (allowScale && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      grow(-SCALE_STEP);
    } else if (e.key === '0' || e.key === 'Home') {
      e.preventDefault();
      onChange({ ...CENTRED });
    }
  };

  const moved = !isCentred(value);

  return (
    <div className="sw1-jumperpos">
      <div className="sw1-jumperpos__head">
        <span className="sw1-jumperpos__title">{title}</span>
        <span className={`sw1-jumperpos__readout ${moved ? 'is-moved' : ''}`} aria-live="polite">
          {readout ?? describe(value, allowScale)}
        </span>
      </div>

      <div className="sw1-jumperpos__body">
        <div
          ref={stageRef}
          className={`sw1-jumperpos__stage sw1-jumperpos__stage--${stage}`}
          tabIndex={0}
          role="group"
          aria-label={`${title}. Drag the picture, or use the arrow keys. Hold Shift to move further.${
            allowScale ? ' Plus and minus change the size.' : ''
          } Press 0 to centre.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          {/* Plates size themselves off the ground's width (cqw). This panel is
              far narrower than the ground, so on its own the plate would drop to
              its phone size and seat the picture differently from the embed and
              the PNG. A ground-width sizing canvas, clipped by the stage, makes
              the preview use the same desktop plate they do. */}
          <div className="sw1-jumperpos__canvas">{children}</div>
          <span className="sw1-jumperpos__grip" aria-hidden>
            Drag to move
          </span>
        </div>

        <div className="sw1-jumperpos__controls">
          <div className="sw1-jumperpos__pad" role="group" aria-label="Nudge the picture">
            <button type="button" className="sw1-jumperpos__btn is-up" onClick={() => nudge(0, -STEP)} aria-label="Move up">
              <Chevron dir="up" />
            </button>
            <button type="button" className="sw1-jumperpos__btn is-left" onClick={() => nudge(-STEP, 0)} aria-label="Move left">
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              className="sw1-jumperpos__btn is-reset"
              onClick={() => onChange({ ...CENTRED })}
              disabled={!moved}
              aria-label="Centre the picture"
            >
              Centre
            </button>
            <button type="button" className="sw1-jumperpos__btn is-right" onClick={() => nudge(STEP, 0)} aria-label="Move right">
              <Chevron dir="right" />
            </button>
            <button type="button" className="sw1-jumperpos__btn is-down" onClick={() => nudge(0, STEP)} aria-label="Move down">
              <Chevron dir="down" />
            </button>
          </div>

          {allowScale && (
            <div className="sw1-jumperpos__size">
              <button type="button" className="sw1-jumperpos__btn" onClick={() => grow(-SCALE_STEP)} aria-label="Smaller" disabled={scale <= SCALE_MIN}>
                −
              </button>
              <label className="sw1-jumperpos__slider">
                <span>Size {Math.round(scale * 100)}%</span>
                <input
                  type="range"
                  min={SCALE_MIN * 100}
                  max={SCALE_MAX * 100}
                  step={SCALE_STEP * 100}
                  value={Math.round(scale * 100)}
                  onChange={(e) => emit({ scale: Number(e.target.value) / 100 })}
                />
              </label>
              <button type="button" className="sw1-jumperpos__btn" onClick={() => grow(SCALE_STEP)} aria-label="Bigger" disabled={scale >= SCALE_MAX}>
                +
              </button>
            </div>
          )}
          {extra}
        </div>
      </div>

      {hint && <p className="sw1-admin__hint">{hint}</p>}
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
