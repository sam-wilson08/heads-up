import type { Lane } from "../engine";

// What makes each venue play its own way: the twist. The park has none, since it's where the game
// is learnt. Each twist bites harder as its strength goes from 0 to 1, which a level sets for its
// kick-off and full time (see levels.ts), so a stage's first level teaches it gently.
//
// Some twists change what happens, like a zapped ball that mustn't be headed, and the engine
// settles those from its own random source when it launches a wave, so a seed still fixes the run.
// Others only change what the player sees, like the dark at night, and are drawn from the round's
// seed and clock (see ./schedule.ts). Every one has a tell, and leaves time to act on it: the
// numbers below are tested against the slowest reactions they allow (see twists.test.ts).

export type TwistKind =
  /** The Moon: aliens zap balls, which then explode just before they'd be headed. */
  | "zap"
  /** The Beach: gusts of sea breeze blow a wave one lane across. */
  | "breeze"
  /** Snowy Pitch: things come over caked in snow, so a ball looks like a snowball. */
  | "snow"
  /** Underwater: currents sway things across the lanes; their shadows show where they'll land. */
  | "sway"
  /** Volcano: lava bombs drop into a lane, their landing spot glowing as they fall. */
  | "bombs"
  /** Mars: dust devils spin up in a lane and hide what's coming down it. */
  | "dust"
  /** Space Stadium: things fly into a portal in one lane and out of one in another. */
  | "warp"
  /** Funfair: balls bounce off a trampoline into a high arc, and have to be headed in a jump. */
  | "bounce"
  /** Haunted Castle: the candles gutter out, things fade mid-flight, and ghost balls come. */
  | "haunt"
  /** Cup Final: a pitch invader's flare fills a lane with smoke, hiding what's coming down it. */
  | "flare"
  /**
   * The Colosseum: balls come in green and red, and the emperor's thumb says which to head: up
   * for green, down for red. Spears thrust in from the side instead of hurdles, ducked by the tap.
   */
  | "verdict"
  /**
   * The Leaning Tower: the whole screen leans over to one side, as the tower does, holds there,
   * and rights itself. A creak and a shudder come first.
   */
  | "lean"
  /**
   * Sakura Peak: mountain gusts blow a whole wave across, as the Beach's breeze does, but a strong
   * one can blow a lone thing two lanes, from one side of the pitch to the other.
   */
  | "gale";

export const TWIST_KINDS: readonly TwistKind[] = [
  "zap",
  "breeze",
  "snow",
  "sway",
  "bombs",
  "dust",
  "warp",
  "bounce",
  "haunt",
  "flare",
  "verdict",
  "lean",
  "gale",
];

/** A twist, and how strongly it bites at kick-off and at full time, each from 0 to 1. */
export interface TwistRule {
  readonly kind: TwistKind;
  readonly strength: readonly [number, number];
}

/** How strongly a venue's twist bites in free play: from gentle to firm, never its fiercest. */
export const FREE_PLAY_STRENGTH = [0.25, 0.75] as const;

/**
 * What a twist has done to one thing in the air. `at` and `until` are how far through its flight,
 * from 0 at launch to 1 when it reaches the player.
 */
export type ItemTwist =
  /** Zapped by aliens at `at`. It explodes as it reaches the player: a knock if it's headed. */
  | { readonly kind: "zap"; readonly at: number }
  /** Launched down `from`, then blown into its own lane, starting at `at`. */
  | { readonly kind: "drift"; readonly from: Lane; readonly at: number }
  /** Launched down `from`, then warped into its own lane at `at`. */
  | { readonly kind: "warp"; readonly from: Lane; readonly at: number }
  /** Caked in snow until `until`, when it shakes off and shows what it is. */
  | { readonly kind: "snowed"; readonly until: number }
  /** A lava bomb, dropping out of the sky rather than coming from the goal. */
  | { readonly kind: "bomb" }
  /**
   * Bounced off a trampoline at BOUNCE_AT into a high arc, so it can only be headed near the top
   * of a jump (see engine.ts).
   */
  | { readonly kind: "bounce" }
  /**
   * A ball in the Colosseum's green or red, and whether it's the colour the emperor wants when it
   * reaches the player. One that isn't mustn't be headed.
   */
  | { readonly kind: "colour"; readonly colour: BallColour; readonly right: boolean };

/** The emperor's thumb: up or down. */
export type Thumb = "up" | "down";
export type BallColour = "green" | "red";
/** What each verdict says to head: green for thumbs up, red for thumbs down. */
export const WANTED: Readonly<Record<Thumb, BallColour>> = { up: "green", down: "red" };

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** How strongly a twist bites at a moment of a round `roundMs` long. */
export const strengthAt = (rule: TwistRule, roundMs: number, at: number): number =>
  lerp(rule.strength[0], rule.strength[1], clamp01(at / roundMs));

/**
 * The twists that change what happens, and how each bites at a strength. Chances are per wave,
 * or per ball for zaps and per thing for snow.
 */
export const TUNING = {
  zap: {
    /** How often a plain ball is zapped. A golden ball never is: it's a bonus. */
    chance: (s: number) => lerp(0.12, 0.34, s),
    /** When it's zapped. Later is harder, leaving less time to get out of its way. */
    at: (s: number) => lerp(0.2, 0.38, s),
  },
  breeze: {
    chance: (s: number) => lerp(0.14, 0.42, s),
    /** When the gust starts to blow it across. */
    at: (s: number) => lerp(0.16, 0.34, s),
  },
  gale: {
    chance: (s: number) => lerp(0.16, 0.44, s),
    /** How often a gust that can blow a lone thing two lanes does. */
    far: (s: number) => lerp(0.2, 0.6, s),
    /**
     * When the gust starts to blow it across: sooner than the breeze, since two lanes take longer
     * to cross.
     */
    at: (s: number) => lerp(0.14, 0.28, s),
  },
  warp: {
    chance: (s: number) => lerp(0.14, 0.4, s),
    at: (s: number) => lerp(0.3, 0.48, s),
  },
  snow: {
    chance: (s: number) => lerp(0.16, 0.5, s),
    /** When the snow shakes off. */
    until: (s: number) => lerp(0.34, 0.56, s),
  },
  bombs: {
    /** How often a wave with a ball in it brings a lava bomb down beside it. */
    chance: (s: number) => lerp(0.12, 0.4, s),
  },
  bounce: {
    /**
     * How often a plain ball bounces, if the player has the legs for it. At full strength that's
     * more often than they have, so their legs are what keep it in check (see engine.ts).
     */
    chance: (s: number) => lerp(0.12, 0.4, s),
  },
  ghosts: {
    /** How often a wave with a football in it brings a ghost ball beside it. */
    chance: (s: number) => lerp(0.1, 0.34, s),
  },
  verdict: {
    /** How long the emperor keeps a verdict before turning his thumb over. */
    gap: (s: number) => lerp(11000, 6500, s),
    /** How often a lone ball comes in the wrong colour, to be let go. */
    wrong: (s: number) => lerp(0.12, 0.32, s),
    /** How often a ball in the right colour comes with one in the wrong colour beside it. */
    pair: (s: number) => lerp(0.3, 0.7, s),
  },
} as const;

/** How long a gust takes to blow something one lane across, as a share of its flight. */
export const DRIFT_SPAN = 0.22;

/** How long a gust takes to blow something `lanes` across: two take half as long again as one. */
export const driftSpanOf = (lanes: number): number => DRIFT_SPAN * (lanes > 1 ? 1.5 : 1);
/** How long before a warp its portals open, as a share of the flight. */
export const PORTAL_LEAD = 0.2;
/**
 * How far through its flight a high ball hits its trampoline, which is where the trampolines are
 * set in the pitch. Early enough to see it and jump in time, even at the fastest (see
 * twists.test.ts).
 */
export const BOUNCE_AT = 0.24;

/**
 * How long after the emperor turns his thumb over before a ball in his colours can reach the
 * player: time to see the new verdict and get to the right ball. A ball due sooner comes plain.
 */
export const VERDICT_REACT_MS = 700;

/** A number from 0 to 1 for each whole number, the same every time. */
const jitter = (k: number) => {
  const x = Math.sin((k + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The emperor's verdict at a moment of a round `roundMs` long: thumbs up at kick-off, then turned
 * over every so often, sooner as the twist bites harder. It's a fixed pattern rather than drawn
 * from a random source, so the engine and the scene agree on it without sharing one, and a level
 * plays the same every time. `since` is how long he's held it, and `next` when he'll turn it over.
 */
export const verdictAt = (
  rule: TwistRule,
  roundMs: number,
  at: number,
): { readonly thumb: Thumb; readonly since: number; readonly next: number } => {
  let thumb: Thumb = "up";
  let from = 0;
  for (let k = 0; ; k++) {
    const gap = TUNING.verdict.gap(strengthAt(rule, roundMs, from)) * (0.85 + 0.3 * jitter(k));
    const next = from + gap;
    if (at < next) return { thumb, since: at - from, next };
    from = next;
    thumb = thumb === "up" ? "down" : "up";
  }
};
