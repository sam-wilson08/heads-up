import { useEffect, useRef, useState } from "react";
import { LEAGUE_MARK } from "../teams";
import { BallIcon } from "../ui/icons";
import "./loading.css";

// What's really done while a round loads comes in fits and starts: nothing for a while, then a big
// step as the shaders finish compiling. So the bar doesn't show it as it is. It catches up with
// each step quickly but never in a jump, and between steps it creeps on towards a point part way
// to the end, ever more slowly, so it never sits still and never gets far ahead. It's only full
// once everything is.

/** How quickly the bar catches up with what's done: about how long it takes to close the gap. */
const CATCH_UP_MS = 90;
/** The slowest it catches up, so the last stretch doesn't drag: the whole bar in this long. */
const SLOWEST_MS = 300;
/** How far it creeps on between steps: this share of the way from what's done to the end. */
const CREEP = 0.5;
/** How slowly it creeps: about how long it takes to get most of the way. */
const CREEP_MS = 2500;
/**
 * How far ahead the bar's drawn: where it'll be this long from now, slid to over this long. The
 * browser slides it by itself, so it keeps moving through a frame held up by the round being built
 * or its pictures uploaded, rather than stopping until the next.
 */
const AHEAD_MS = 200;
/** How long the screen takes to fade once the bar's full. */
const FADE_MS = 200;

/** Where the bar's got to `ms` after `shown`, with `done` really done. */
const advance = (shown: number, done: number, ms: number): number => {
  if (shown < done) {
    const step = Math.max((done - shown) * (1 - Math.exp(-ms / CATCH_UP_MS)), ms / SLOWEST_MS);
    return Math.min(done, shown + step);
  }
  const towards = done + (1 - done) * CREEP;
  return shown < towards ? towards - (towards - shown) * Math.exp(-ms / CREEP_MS) : shown;
};

/**
 * Where a loading screen's bar last was, where it was sent sliding to, and when. A round's loading
 * passes through three screens, App's while the game's code loads, Game's while the player does,
 * then Play's, so each carries on from the one before rather than starting again. The next is drawn
 * before the last has gone, so the last keeps this up to date as it goes rather than leaving it
 * when it goes.
 */
let drawn = { shown: 0, ahead: 0, at: -Infinity };
/**
 * How soon after one screen last drew its bar the next carries on from it: long enough for a frame
 * held up by the next screen's code loading.
 */
const HANDOVER_MS = 1000;

/** Where the last screen's bar is now, part way along its slide, if that screen's only just gone. */
const handedOver = (): number => {
  const since = performance.now() - drawn.at;
  if (since >= HANDOVER_MS) return 0;
  return drawn.shown + (drawn.ahead - drawn.shown) * Math.min(since / AHEAD_MS, 1);
};

interface LoadingProps {
  /** How far the round's really got loading, from 0 to 1. */
  readonly done: number;
  /** Once everything's done and the bar's full: the moment the round starts. */
  readonly onFull?: () => void;
  /** Once the screen's faded away after that. */
  readonly onGone?: () => void;
}

/** The screen shown while a round loads: the ball bouncing over a bar that fills smoothly. */
export const Loading = ({ done, onFull, onGone }: LoadingProps) => {
  const fill = useRef<HTMLSpanElement>(null);
  const latest = useRef({ done, onFull, onGone });
  latest.current = { done, onFull, onGone };
  const [from] = useState(handedOver);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let shown = from;
    let ahead = from;
    let last = performance.now();
    /** When the bar was first drawn heading for full. */
    let fullAt: number | undefined;
    let timer = 0;
    let frame = requestAnimationFrame(function step(now) {
      // A frame held up for longer doesn't throw the bar forwards: it was drawn only so far ahead.
      shown = advance(shown, latest.current.done, Math.min(Math.max(now - last, 0), AHEAD_MS));
      last = now;
      ahead = Math.max(ahead, advance(shown, latest.current.done, AHEAD_MS));
      if (fill.current) fill.current.style.transform = `translateX(${(ahead - 1) * 100}%)`;
      // A full bar's round has loaded, so the next round's starts again.
      drawn =
        ahead < 1 ? { shown, ahead, at: performance.now() } : { shown: 0, ahead: 0, at: -Infinity };
      if (ahead >= 1) fullAt ??= now;
      if (fullAt === undefined || now - fullAt < AHEAD_MS) {
        frame = requestAnimationFrame(step);
        return;
      }
      setFull(true);
      latest.current.onFull?.();
      timer = window.setTimeout(() => latest.current.onGone?.(), FADE_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [from]);

  return (
    <div
      className={full ? "loading-screen gone" : "loading-screen"}
      role="status"
      aria-live="polite"
    >
      {LEAGUE_MARK && (
        <img className="loading-league" src={LEAGUE_MARK} alt="Serie A" draggable={false} />
      )}
      <span className="loading-ball" aria-hidden="true">
        <span>
          <BallIcon />
        </span>
      </span>
      <span className="loading-label">Warming up…</span>
      <span className="loading-bar" aria-hidden="true">
        <span
          ref={fill}
          style={{
            transform: `translateX(${(from - 1) * 100}%)`,
            transition: `transform ${AHEAD_MS}ms linear`,
          }}
        />
      </span>
    </div>
  );
};
