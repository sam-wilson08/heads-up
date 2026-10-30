import { type PointerEvent, useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { duckDownHint, duckHint, isTouch, jumpHint, jumpUpHint } from "../controls";
import { kitById } from "../kits";
import { freePlayAt, type Level } from "../levels";
import type { Profile } from "../profile";
import { HeartIcon } from "../ui/icons";
import { holdPictures } from "../ui/three/studio";
import { venueById, type VenueId } from "../venues";
import { columnWidth, isWide, useWide } from "../wide";
import { crowdReady } from "./creatures";
import {
  decoyPool,
  duck,
  FITNESS_MAX,
  GHOST,
  hasSpears,
  hasSweeps,
  isHigh,
  isOver,
  isSkimmed,
  isTired,
  jump,
  type Lane,
  newRound,
  pointHead,
  type RoundEvent,
  type Rules,
  seededRandom,
  step,
  summarise,
  type Summary,
} from "./engine";
import { fansReady } from "./fans";
import { groundReady } from "./ground";
import { LevelHud } from "./LevelHud";
import { Loading } from "./Loading";
import { lookOf } from "./look";
import { hasMusic, isMuted, musicFor, setMuted } from "./music";
import { perfOverlay } from "./perf";
import { loadPlayerModel } from "./player";
import { roundQuality, SHOW_PERF } from "./quality";
import { gameRenderer } from "./renderer";
import { createGameScene, type GameScene } from "./scene";
import { sceneryReady } from "./scenery";
import { sameSweeps, SweepHud, type Sweeps, sweepsOf } from "./SweepHud";
import { type Trace, tracer } from "./trace";
import { type Input, type Lesson, tutor, tutorialRound } from "./tutorial";
import { TutorialHud } from "./TutorialHud";
import { type Hint, hintsFor } from "./twists/hints";
import { sameVerdict, type Verdict, VerdictHud, verdictOf } from "./VerdictHud";

/**
 * Starts loading the player model, the crowd's fans and the grass photos early, so they're ready by
 * the time someone presses play.
 */
export const preload = (): void => {
  void loadPlayerModel();
  void fansReady();
  void groundReady();
};

/** Where the round's loading has got by the time the scene's built, before it's prepared. */
const BUILT = 0.2;

/** How many rounds are being played: one, or none. Nothing's warmed up while one is. */
let playing = 0;
/** The venues each renderer has compiled the shaders for, so each is warmed up once. */
const warmed = new WeakMap<THREE.WebGLRenderer, Set<VenueId>>();
const warmedBy = (renderer: THREE.WebGLRenderer): Set<VenueId> => {
  const venues = warmed.get(renderer) ?? new Set<VenueId>();
  warmed.set(renderer, venues);
  return venues;
};

/** Waits until the page has nothing else to do, or a second where the browser can't say. */
const idle = () =>
  new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 5000 });
    else setTimeout(resolve, 1000);
  });

/**
 * Builds a round at a venue out of sight and compiles its shaders, once the page is idle, so the
 * first round played there doesn't wait for them: most of the wait before a round on a phone.
 * For the title and stage screens. The browser compiles them in the background.
 */
export const warmUp = async (profile: Profile, venue: VenueId): Promise<void> => {
  const model = await loadPlayerModel();
  await crowdReady(venueById(venue).crowd);
  await groundReady();
  await sceneryReady(venue).catch(() => undefined);
  await idle();
  const quality = roundQuality();
  if (playing > 0 || warmedBy(gameRenderer(quality)).has(venue)) return;
  const renderer = gameRenderer(quality);
  warmedBy(renderer).add(venue);
  const scene = createGameScene(renderer, {
    venue: venueById(venue),
    name: profile.name,
    number: profile.number,
    kit: kitById(profile.kit),
    model,
    rules: freePlayAt(venue),
    quality,
  });
  // Laid out as on a phone, so the crowd's in place to be compiled.
  scene.resize(window.innerWidth || 390, window.innerHeight || 844);
  scene.warm();
  scene.dispose();
};

interface Popup {
  readonly id: number;
  readonly text: string;
  readonly tone: "bad" | "hint";
}

interface Hud {
  readonly score: number;
  readonly secondsLeft: number;
  readonly streak: number;
  readonly lives: number;
  /** Jumps in the player's legs, to the nearest twentieth, so the bar fills smoothly enough. */
  readonly fitness: number;
  /** On a level, the score less the best run's at the last whole second, if there's a best. */
  readonly split?: number | undefined;
}

const KEY_LANES: Record<string, Lane> = { a: -1, s: 0, d: 1, "1": -1, "2": 0, "3": 1 };
const JUMP_KEYS = new Set([" ", "ArrowUp", "w"]);

/**
 * The game across the whole display, or back in its window, on a wide screen (see wide.ts). A
 * browser that won't is left as it is.
 */
const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen().catch(() => undefined);
};

/**
 * How far a finger drags sideways to move the head one lane, as a share of the width of the lanes:
 * the screen's on a phone, the column over them on a wide screen.
 */
const DRAG = 0.18;
/**
 * A touch that moves less than this, in pixels, is a tap: a jump, or where the player can duck as
 * well, a jump on the top half of the screen and a duck on the bottom half.
 */
const TAP = 12;

/** A finger on the screen. */
interface Finger {
  /** Where it went down, and which lane the head was in then. */
  readonly x: number;
  readonly y: number;
  readonly lane: Lane;
  /** Whether it has moved far enough to be a drag rather than a tap. */
  moved: boolean;
}

/**
 * What's shouted when something goes wrong. Points aren't: the score counts them, and a shout under
 * the player for each would crowd the play. `tripped` is what's shouted for a trip: at the
 * Colosseum, the hurdles are spears, and on Sakura Peak, ninjas' staffs.
 */
const popupFor = (event: RoundEvent, id: number, tripped: string): Popup | undefined => {
  switch (event.type) {
    case "hit": {
      // A zapped ball explodes, and a lava bomb burns. A ball in the wrong colour costs no life.
      const ouch =
        event.item.twist?.kind === "zap"
          ? "ZAPPED!"
          : event.item.twist?.kind === "bomb"
            ? "LAVA!"
            : event.item.twist?.kind === "colour"
              ? "WRONG BALL!"
              : event.item.kind === GHOST
                ? "BOO!"
                : "OUCH!";
      return {
        id,
        text:
          event.lives === 0 ? "KNOCKED OUT!" : event.lostStreak > 1 ? `${ouch} STREAK LOST` : ouch,
        tone: "bad",
      };
    }
    case "missed":
      // A high ball's gone over the head, which is worth saying even with no streak to lose.
      if (isHigh(event.item)) {
        const over = "OVER YOUR HEAD!";
        return { id, text: event.lostStreak > 1 ? `${over} STREAK LOST` : over, tone: "bad" };
      }
      return event.lostStreak > 1 ? { id, text: "STREAK LOST", tone: "bad" } : undefined;
    case "tripped": {
      // A frisbee that wasn't ducked is a knock to the head, as a decoy is.
      const frisbee = isSkimmed(event.item);
      const ouch = frisbee ? "OUCH!" : tripped;
      const out = frisbee ? "KNOCKED OUT!" : "DOWN AND OUT!";
      return {
        id,
        text: event.lives === 0 ? out : event.lostStreak > 1 ? `${ouch} STREAK LOST` : ouch,
        tone: "bad",
      };
    }
    case "header":
    case "cleared":
    case "dodged":
      return undefined;
  }
};

/** Whether two moments of the tutorial say the same, so the screen needn't be drawn again. */
const sameLesson = (a: Lesson | undefined, b: Lesson) =>
  a?.step === b.step &&
  a.say === b.say &&
  a.waiting === b.waiting &&
  a.feedback === b.feedback &&
  a.lane === b.lane &&
  a.card === b.card &&
  a.done === b.done;

interface PlayProps extends GameProps {
  readonly model: THREE.Object3D | undefined;
}

/** One round: the 3D scene, with the score, clock and streak over the top. */
const Play = ({
  profile,
  rules,
  seed,
  level,
  best,
  tutorial,
  model,
  onFinish,
  onRestart,
  onQuit,
}: PlayProps) => {
  /** Where the game's canvas goes (see renderer.ts). */
  const stage = useRef<HTMLDivElement>(null);
  /** How dark the venue has the corners of the picture (see look.ts). */
  const lens = lookOf(profile.venue).vignette;
  /** How far the round has got loading, from 0 to 1, until its loading screen's gone. */
  const [loading, setLoading] = useState<number | undefined>(0);
  /** Whether the round's clock has started. Until it has, nothing the player does counts. */
  const started = useRef(false);
  /** Starts the round's clock, once it's loaded and the loading bar's full. */
  const begin = useRef<() => void>(() => undefined);
  // The venue's own decoys join the classic ones: helmets on the Moon, volleyballs on the beach.
  // The tutorial's round throws nothing but what the tutorial does (see tutorial.ts).
  const decoys = decoyPool(venueById(profile.venue).decoys);
  const round = useRef(tutorial ? tutorialRound(decoys) : newRound(decoys, rules));
  /** How the tutorial says to play: by touch on a phone, or with the keys on a computer. */
  const [input] = useState((): Input => (isTouch() ? "touch" : "keys"));
  const wide = useWide();
  const teacher = useRef(tutorial ? tutor(input) : undefined);
  const [lesson, setLesson] = useState(() => teacher.current?.lesson(round.current));
  // Everything launched comes from the seed, so a level plays the same every time.
  const random = useRef(seededRandom(seed));
  const trace = useRef(tracer());
  const finish = useRef(onFinish);
  finish.current = onFinish;
  const [hud, setHud] = useState<Hud>({
    score: 0,
    secondsLeft: rules.roundMs / 1000,
    streak: 0,
    lives: rules.lives,
    fitness: FITNESS_MAX,
  });
  const [popups, setPopups] = useState<readonly Popup[]>([]);
  const [hits, setHits] = useState(0);
  // At the Colosseum, the emperor's verdict and warnings of spears (see VerdictHud.tsx).
  const [verdict, setVerdict] = useState<Verdict | undefined>(() => verdictOf(round.current));
  const spears = hasSpears(rules);
  // On Sakura Peak, warnings of ninjas' staffs (see SweepHud.tsx).
  const [sweeps, setSweeps] = useState<Sweeps | undefined>(() => sweepsOf(round.current));
  /** Counts the "too tired" shouts, which get ids of their own below zero. */
  const tiredShouts = useRef(0);
  /** Whether the venue's music is muted, on this device (see music.ts). */
  const [muted, setMutedHere] = useState(isMuted);

  /** Every finger on the screen, by pointer, so one can drag while another taps. */
  const fingers = useRef(new Map<number, Finger>());

  const point = (lane: Lane) => {
    if (!started.current) return;
    round.current = pointHead(round.current, lane);
  };
  const leap = () => {
    if (!started.current) return;
    if (isTired(round.current)) {
      // Says why nothing happened, in place of whatever was last shouted.
      const shout: Popup = { id: -++tiredShouts.current, text: "TOO TIRED!", tone: "bad" };
      setPopups((p) => [...p.filter((x) => x.tone === "hint"), shout]);
    }
    round.current = jump(round.current);
  };
  const duckDown = () => {
    if (!started.current) return;
    round.current = duck(round.current);
  };

  useEffect(() => {
    const element = stage.current;
    if (!element) return undefined;
    started.current = false;
    playing++;
    // The menus' pictures wait until the round's over, rather than take the phone from it.
    const releasePictures = holdPictures();
    // The round's quality, and the game's renderer set up for it, whose canvas moves into this
    // round's stage (see quality.ts and renderer.ts).
    const quality = roundQuality();
    const renderer = gameRenderer(quality);
    element.appendChild(renderer.domElement);
    /** The round's scene, once it's built. */
    let scene: GameScene | undefined;
    let observer: ResizeObserver | undefined;
    // With ?perf in the address, the frame rate and what each frame draws (see perf.ts).
    const perf = SHOW_PERF ? perfOverlay(element.parentElement ?? element) : undefined;
    let stopped = false;

    let popupId = 0;
    let warned = false;
    let duckWarned = false;
    let thumb = verdictOf(round.current)?.thumb;
    const atColosseum = hasSpears(rules);
    const tripped = atColosseum ? "SPEARED!" : hasSweeps(rules) ? "SWEPT!" : "TRIPPED!";
    // What to watch for, each shouted the first time the venue's twist turns up.
    const hints = hintsFor(rules, seed);
    const hinted = new Set<Hint>();
    // The venue's music loads with the round, starts at kick-off and fades at the whistle.
    const music = musicFor(profile.venue);
    let last = performance.now();
    let frame = 0;
    const tick = (time: number): void => {
      if (!scene) return;
      const began = performance.now();
      const gap = time - last;
      // A long gap (a hidden tab, a slow frame) counts as a short one, so nothing jumps ahead.
      const dt = Math.min(gap, 50);
      last = time;
      // In the tutorial, it throws what's next, and stops the clock while it waits for a move.
      const teaching = teacher.current;
      const taught = teaching?.before(round.current, dt) ?? { round: round.current, dtMs: dt };
      const result = step(taught.round, taught.dtMs, random.current);
      teaching?.after(result.round, result.events);
      if (teaching) {
        const now = teaching.lesson(result.round);
        setLesson((l) => (sameLesson(l, now) ? l : now));
      }
      round.current = result.round;
      trace.current.follow(result.round, result.events);
      scene.render(result.round, result.events, dt);

      const latest = trace.current.latest();
      const bestThen = latest && best?.[latest.second - 1];
      const next: Hud = {
        score: result.round.score,
        // The round can run on past full time while the player falls.
        secondsLeft: Math.max(0, Math.ceil((rules.roundMs - result.round.now) / 1000)),
        streak: result.round.streak,
        lives: result.round.lives,
        fitness: Math.floor(result.round.fitness * 20) / 20,
        split: latest && bestThen !== undefined ? latest.score - bestThen : undefined,
      };
      setHud((h) =>
        h.score === next.score &&
        h.secondsLeft === next.secondsLeft &&
        h.streak === next.streak &&
        h.lives === next.lives &&
        h.fitness === next.fitness &&
        h.split === next.split
          ? h
          : next,
      );
      const fresh = result.events.flatMap((e) => popupFor(e, ++popupId, tripped) ?? []);
      // Says how to jump (or duck) when the first hurdle (or spear) of the round appears.
      if (!warned && result.round.items.some((i) => i.kind === "hurdle" && !isSkimmed(i))) {
        warned = true;
        const hint = atColosseum ? duckHint() : rules.ducks ? jumpUpHint() : jumpHint();
        fresh.push({ id: ++popupId, text: `${hint.toUpperCase()}!`, tone: "hint" });
      }
      // Where the player can duck as well as jump, says how when the first frisbee comes skimming.
      if (!duckWarned && result.round.items.some(isSkimmed)) {
        duckWarned = true;
        fresh.push({ id: ++popupId, text: `${duckDownHint().toUpperCase()}!`, tone: "hint" });
      }
      // The emperor turning his thumb over is shouted, as well as shown.
      const now = verdictOf(result.round);
      setVerdict((v) => (sameVerdict(v, now) ? v : now));
      if (now && thumb && now.thumb !== thumb) {
        const text = now.thumb === "up" ? "THUMBS UP! HEAD GREEN" : "THUMBS DOWN! HEAD RED";
        fresh.push({ id: ++popupId, text, tone: "hint" });
      }
      thumb = now?.thumb;
      const staffs = sweepsOf(result.round);
      setSweeps((s) => (sameSweeps(s, staffs) ? s : staffs));
      // And what to watch for, the first time the venue's twist turns up.
      for (const hint of hints) {
        if (hinted.has(hint) || !hint.due(result.round)) continue;
        hinted.add(hint);
        fresh.push({ id: ++popupId, text: hint.text.toUpperCase(), tone: "hint" });
      }
      // The tutorial says what's what itself.
      if (fresh.length && !teaching) {
        // Only the newest shout shows, so they don't pile up over the play; a hint stays put.
        const shouts = fresh.filter((f) => f.tone !== "hint");
        const hints = fresh.filter((f) => f.tone === "hint");
        setPopups((p) => [
          ...p.filter((x) => x.tone === "hint" || shouts.length === 0),
          ...hints,
          ...shouts.slice(-1),
        ]);
      }
      if (result.events.some((e) => e.type === "hit" || e.type === "tripped")) {
        setHits((n) => n + 1);
        if ("vibrate" in navigator) navigator.vibrate(result.round.lives > 0 ? 60 : 300);
      }

      if (isOver(result.round)) {
        music.fade();
        finish.current(summarise(result.round), trace.current.finish(result.round));
      } else frame = requestAnimationFrame(tick);

      perf?.frame(gap, performance.now() - began, renderer, quality);
    };

    // Once the loading screen's up, builds the round behind it and gets everything it can show
    // onto the GPU (see the scene's prepare). Only then, once the loading bar's caught up and
    // filled, does the clock start.
    const build = () => {
      if (stopped) return;
      const built = createGameScene(renderer, {
        venue: venueById(profile.venue),
        name: profile.name,
        number: profile.number,
        kit: kitById(profile.kit),
        model,
        rules,
        seed,
        quality,
      });
      scene = built;
      built.resize(element.clientWidth || 1, element.clientHeight || 1);
      observer = new ResizeObserver(([entry]) => {
        if (entry) built.resize(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(element);
      setLoading(BUILT);
      void built
        .prepare((done) => {
          if (!stopped) setLoading(BUILT + (1 - BUILT) * done);
        })
        .catch((error: unknown) => {
          console.warn("Couldn't prepare the round, so it compiles as it goes", error);
        })
        .then(() => {
          if (stopped) return;
          warmedBy(renderer).add(profile.venue);
          begin.current = () => {
            if (stopped || started.current) return;
            started.current = true;
            performance.mark("heads-up:round-start");
            music.play();
            last = performance.now();
            frame = requestAnimationFrame(tick);
          };
          setLoading(1);
        });
    };
    let timer = 0;
    const painted = requestAnimationFrame(() => {
      // The venue's own props load first, if they haven't already (see scenery.ts), and what its
      // crowd is built from (see creatures.ts).
      void Promise.all([
        sceneryReady(profile.venue).catch(() => undefined),
        crowdReady(venueById(profile.venue).crowd),
      ]).then(() => {
        timer = window.setTimeout(build);
      });
    });

    const onKey = (event: KeyboardEvent) => {
      const lane = round.current.lane;
      if (JUMP_KEYS.has(event.key)) {
        // So the space bar doesn't also press whichever button has focus.
        event.preventDefault();
        leap();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        duckDown();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const by = event.key === "ArrowLeft" ? -1 : 1;
        point(Math.min(1, Math.max(-1, lane + by)) as Lane);
      } else if (event.key in KEY_LANES) {
        point(KEY_LANES[event.key] ?? 0);
      } else if (isWide() && (event.key === "f" || event.key === "F")) {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      stopped = true;
      playing--;
      releasePictures();
      cancelAnimationFrame(painted);
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      music.stop();
      observer?.disconnect();
      perf?.dispose();
      scene?.dispose();
      if (renderer.domElement.parentElement === element) renderer.domElement.remove();
    };
    // A new round is a new Play: see Game's key in App.tsx.
  }, [profile, model, rules, seed, best]);

  // Dragging left or right moves the head a lane for each step of the drag, as the finger goes,
  // so a short swipe moves one lane and a long drag two. A tap jumps: a touch that hardly moves.
  // Where the player can duck as well, a tap on the bottom half of the screen ducks instead. Each
  // finger is followed on its own, so a tap with one doesn't interrupt a drag with another.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    fingers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      lane: round.current.lane,
      moved: false,
    });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const finger = fingers.current.get(event.pointerId);
    if (!finger) return;
    const dx = event.clientX - finger.x;
    finger.moved ||= Math.hypot(dx, event.clientY - finger.y) > TAP;
    if (!finger.moved) return;
    const box = event.currentTarget.getBoundingClientRect();
    const across = isWide() ? columnWidth(box.width, box.height) : box.width;
    const lanes = Math.round(dx / (across * DRAG));
    point(Math.min(Math.max(finger.lane + lanes, -1), 1) as Lane);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const finger = fingers.current.get(event.pointerId);
    fingers.current.delete(event.pointerId);
    if (!finger || finger.moved) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (rules.ducks && finger.y - box.top > box.height / 2) duckDown();
    else leap();
  };
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(event.pointerId);
  };

  const streakClass = hud.streak >= 10 ? "blazing" : hud.streak >= 5 ? "hot" : "";
  // From 3, as the footballs start to glow (see game/rainbow.ts), the box gets a rainbow edge.
  const rainbow = hud.streak >= 3 ? "rainbow" : "";

  return (
    <div
      className="play"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div ref={stage} style={{ position: "absolute", inset: 0 }} />
      {/* The corners darkened, as a camera's lens darkens them, by the page rather than the GPU. */}
      {lens > 0 && <div className="lens" style={{ opacity: lens }} />}
      {/* Down to the last life, having had more, the edges close in, dark red, beating like a
          heart, and stay until the round's over. */}
      {rules.lives > 1 && hud.lives <= 1 && <div className="last-life" />}
      {loading !== undefined && (
        <Loading
          done={loading}
          onFull={() => begin.current()}
          onGone={() => setLoading(undefined)}
        />
      )}
      {hits > 0 && <div key={hits} className="hit-flash" />}
      {/* Everything over the lanes: the whole screen on a phone, the middle on a wide one. */}
      <div className="play-column">
        <div className="hud">
          {/* A new player's first how-to-play has no way out but through it. */}
          {!tutorial?.required && (
            <button
              type="button"
              className="hud-back"
              aria-label="Back to the menu"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onQuit}
            >
              ←
            </button>
          )}
          {/* Under it, the music on or off, wherever there's music. */}
          {hasMusic(profile.venue) && (
            <button
              type="button"
              className="hud-back hud-mute"
              aria-label={muted ? "Music on" : "Music off"}
              aria-pressed={muted}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setMuted(!muted);
                setMutedHere(!muted);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                {muted ? (
                  <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
                ) : (
                  <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
                )}
              </svg>
            </button>
          )}
          {/* A broadcast scorebug: score, clock and streak joined in one bar, with the clock picked
            out in the middle. The tutorial has none of it, nor the lives and the legs. */}
          {!lesson && (
            <>
              <div className="hud-bug">
                <div className="hud-box hud-score">
                  <span>Score</span>
                  <strong>{hud.score.toLocaleString("en-GB")}</strong>
                </div>
                <div className={`hud-box hud-time ${hud.secondsLeft <= 10 ? "low" : ""}`}>
                  <span>Time</span>
                  <strong>{hud.secondsLeft}</strong>
                </div>
                <div className={`hud-box hud-streak ${streakClass} ${rainbow}`}>
                  <span>Streak</span>
                  <strong key={hud.streak}>{Math.max(hud.streak, 1)}×</strong>
                </div>
              </div>
              {/* One tap to start the run again, for practising. */}
              <button
                type="button"
                className="hud-back hud-restart"
                aria-label="Start again"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onRestart}
              >
                ↻
              </button>
              {/* The lives and the legs, on a strip hung under the scorebug. */}
              <div className="hud-strip">
                <div
                  className="hud-lives"
                  role="img"
                  aria-label={`${hud.lives} ${hud.lives === 1 ? "life" : "lives"} left`}
                >
                  {Array.from({ length: rules.lives }, (_, i) => (
                    <span key={i} className={i < hud.lives ? "life" : "life lost"}>
                      <HeartIcon />
                    </span>
                  ))}
                </div>
                {/* Ducking a spear doesn't tire the player, so the Colosseum has no jumps to count. */}
                {!spears && (
                  <div
                    className={hud.fitness < 1 ? "hud-fitness tired" : "hud-fitness"}
                    role="img"
                    aria-label={`${Math.floor(hud.fitness)} ${Math.floor(hud.fitness) === 1 ? "jump" : "jumps"} left`}
                  >
                    {/* A bar for each jump in the player's legs, filling back up as they get it back. */}
                    {Array.from({ length: FITNESS_MAX }, (_, i) => {
                      const fill = Math.min(Math.max(hud.fitness - i, 0), 1);
                      return (
                        <span key={i} className={fill === 1 ? "leg ready" : "leg"}>
                          <span style={{ width: `${fill * 100}%` }} />
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {/* Once the round's loaded and under way. */}
        {lesson && tutorial && loading === undefined && (
          <TutorialHud
            lesson={lesson}
            input={input}
            onGoOn={() => teacher.current?.goOn(round.current)}
            onSkip={tutorial.required ? undefined : tutorial.onDone}
            onPlay={tutorial.onDone}
          />
        )}
        {verdict && <VerdictHud verdict={verdict} />}
        {sweeps && <SweepHud sweeps={sweeps} />}
        {level && <LevelHud level={level} score={hud.score} split={hud.split} />}
        <div className="popups" aria-live="polite">
          {popups.map((p) => (
            <div
              key={p.id}
              className={`popup popup-${p.tone}`}
              onAnimationEnd={() => setPopups((all) => all.filter((x) => x.id !== p.id))}
            >
              {p.text}
            </div>
          ))}
        </div>
      </div>
      {wide && (
        <button
          type="button"
          className="play-fullscreen"
          aria-label="Full screen (F)"
          title="Full screen (F)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleFullscreen}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      )}
    </div>
  );
};

interface GameProps {
  readonly profile: Profile;
  /** How the round plays: free play's at the venue, or a level's. */
  readonly rules: Rules;
  /** What everything launched is drawn from: fixed for a level, fresh for free play. */
  readonly seed: number;
  /** The level being played, if it's one, for its medals. */
  readonly level?: Level | undefined;
  /** The best run on the level, a score for each second, to split against. */
  readonly best?: readonly number[] | undefined;
  /**
   * For the tutorial, how to play a step at a time (see tutorial.ts), what to do once it's done or
   * skipped, and whether it has to be done: a new player's first, with no skipping it or going
   * back. Its rules are TUTORIAL_RULES.
   */
  readonly tutorial?: { readonly onDone: () => void; readonly required?: boolean } | undefined;
  readonly onFinish: (summary: Summary, trace: Trace) => void;
  readonly onRestart: () => void;
  readonly onQuit: () => void;
}

/** Waits for the player model (or finds there isn't one), then plays a round. */
export const Game = (props: GameProps) => {
  const [model, setModel] = useState<{ value: THREE.Object3D | undefined }>();

  useEffect(() => {
    let current = true;
    void loadPlayerModel().then((value) => {
      if (current) setModel({ value });
    });
    return () => {
      current = false;
    };
  }, []);

  if (!model) return <Loading done={0} />;
  return <Play {...props} model={model.value} />;
};
