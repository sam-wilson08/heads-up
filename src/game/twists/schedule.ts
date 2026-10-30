import { type Item, type Lane, LANES, seededRandom } from "../engine";
import { strengthAt, type TwistRule } from "./twist";

// The twists that only change what the player sees: the currents and the shark underwater, the dust devils on Mars, the flare smoke at the Cup Final, the candles guttering
// out in the Haunted Castle, the screen leaning over at the Leaning Tower and the dragon flying over Sakura Peak. They don't change what happens, so the engine doesn't settle them, but
// a level has to look the same every time it's played, so they're drawn from the round's seed and
// clock here, never from Math.random. Each has a tell and leaves time to act: see twists.test.ts.

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Mixes a round's seed with a twist's own number, so each schedule has a stream of its own. */
const streamOf = (seed: number, salt: number) =>
  seededRandom((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0);

/**
 * Something that comes and goes over a round, with a warning first: a dust devil spinning up, or
 * the castle's candles guttering before they go out. Times are milliseconds into the round.
 */
export interface Spell {
  readonly warnFrom: number;
  readonly from: number;
  readonly to: number;
}

/** When the first spell can start, so the round settles in before the twist. */
const FIRST_SPELL_MS = 4000;

// --- Mars ----------------------------------------------------------------------------------------

export const DUST = {
  /** How long a devil takes to spin up, which is its warning. */
  warnMs: 750,
  /** How long it's thick enough to hide what's behind it. */
  thickMs: (s: number) => lerp(1300, 2600, s),
  /** How many spin up a minute. */
  perMinute: (s: number) => lerp(4, 11, s),
  /**
   * How far through their flight things in its lane stay hidden: it stands on the pitch, so things
   * come out in front of it with plenty of their flight to go.
   */
  hidesTo: (s: number) => lerp(0.36, 0.52, s),
  /** How long it takes to blow away. */
  clearMs: 450,
} as const;

/** A dust devil in a lane. */
export interface Devil extends Spell {
  readonly lane: Lane;
}

/**
 * When and where dust devils spin up over a round. There's never one in every lane at once, and
 * a lane gets a rest between them.
 */
export const dustDevils = (rule: TwistRule, roundMs: number, seed: number): readonly Devil[] => {
  const random = streamOf(seed, 2);
  const devils: Devil[] = [];
  let at = FIRST_SPELL_MS + random() * 2000;
  for (;;) {
    const s = strengthAt(rule, roundMs, at);
    const from = at + DUST.warnMs;
    const to = from + DUST.thickMs(s);
    if (to > roundMs - 500) break;
    const busy = (lane: Lane) =>
      devils.some((d) => d.lane === lane && d.to + DUST.clearMs + 1000 > at);
    const live = devils.filter((d) => d.to + DUST.clearMs > at).length;
    const lanes = LANES.filter((lane) => !busy(lane));
    const lane = lanes[Math.floor(random() * lanes.length)];
    if (lane !== undefined && live < 2) devils.push({ lane, warnFrom: at, from, to });
    at += (60_000 / DUST.perMinute(s)) * lerp(0.5, 1.5, random());
  }
  return devils;
};

/** How thick a devil is at a moment: 0 before it starts, rising to 1, and back to 0 as it clears. */
export const thicknessOf = (devil: Devil, now: number): number => {
  if (now < devil.warnFrom || now > devil.to + DUST.clearMs) return 0;
  if (now < devil.from) return smoothstep(devil.warnFrom, devil.from, now);
  if (now <= devil.to) return 1;
  return 1 - smoothstep(devil.to, devil.to + DUST.clearMs, now);
};

// --- Underwater ----------------------------------------------------------------------------------

export const SWAY = {
  /** How far things sway either side of their lane, in lanes. */
  reach: (s: number) => lerp(0.35, 0.95, s),
  /** How far through their flight they've settled into their lane. */
  settled: (s: number) => lerp(0.42, 0.62, s),
  /** How many times they sway from side to side on the way. */
  sways: (s: number) => lerp(1, 1.8, s),
} as const;

/** A number from 0 to 1 for a thing in a run, the same every time it's played. */
const hash = (seed: number, id: number) => {
  const x = Math.sin(seed * 0.0137 + id * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * How far a thing has swayed off its lane, in lanes, at `p` through its flight. It sways about its
 * own lane, so on average it's where it'll land, and settles into it well before it arrives. Its
 * shadow doesn't sway, so it always shows the lane.
 */
export const swayOf = (rule: TwistRule, roundMs: number, seed: number, item: Item, p: number) => {
  const s = strengthAt(rule, roundMs, item.launchedAt);
  const settled = SWAY.settled(s);
  const fade = 1 - smoothstep(settled - 0.28, settled, p);
  const phase = hash(seed, item.id) * Math.PI * 2;
  const side = hash(seed + 1, item.id) < 0.5 ? -1 : 1;
  return side * SWAY.reach(s) * fade * Math.sin(phase + p * Math.PI * 2 * SWAY.sways(s));
};

/**
 * Now and then a great white swims across the pitch, in front of what's coming, and hides whatever's
 * behind it as it passes. It comes in from off the screen's edge, so it's seen coming, and swims
 * slowly enough to be got round.
 */
export const SHARK = {
  /**
   * How far down the pitch it swims across, in metres (the goal's 30 m away), and how high: up
   * where things are lobbed through on their way, so from behind the player it covers them.
   */
  z: -15,
  y: 4,
  /** How long it is, nose to tail, in metres: a big great white. */
  length: 6,
  /** Where it starts and finishes, either side, in metres: off the edge of a wide screen. */
  reach: 18,
  /**
   * How far out from the middle things fly where it crosses, in metres: the lanes, and as far
   * again as the currents sway them.
   */
  lanes: 1.6,
  /** How fast it swims, in metres a second: slower as the twist bites, so it hides things longer. */
  speed: (s: number) => lerp(4.6, 3.4, s),
  /** How many swim past a minute. */
  perMinute: (s: number) => lerp(1.5, 3.5, s),
  /**
   * How far through their flight things it hides stay hidden, at most: it swims across in front of
   * where they're thrown, 27 m down the pitch, and they reach it 12 m on, of the 27.35 m to the
   * player's head (see scene.ts), and come out in front of it.
   */
  hidesTo: 12 / 27.35,
  /** The least time between one leaving and the next coming. */
  restMs: 6000,
} as const;

/**
 * A shark swimming across: from coming in at the edge (`warnFrom`), to its nose reaching the lanes
 * (`from`), to its tail leaving them (`to`), and on out of sight (`gone`), going `way` across.
 */
export interface Shark extends Spell {
  readonly gone: number;
  readonly way: 1 | -1;
}

/** When sharks swim across over a round, and which way. Only ever one at a time. */
export const sharks = (rule: TwistRule, roundMs: number, seed: number): readonly Shark[] => {
  const random = streamOf(seed, 7);
  const passes: Shark[] = [];
  let at = FIRST_SPELL_MS + 2000 + random() * 4000;
  for (;;) {
    const s = strengthAt(rule, roundMs, at);
    const msPerMetre = 1000 / SHARK.speed(s);
    const half = SHARK.length / 2;
    const from = at + (SHARK.reach - half - SHARK.lanes) * msPerMetre;
    const to = from + (2 * SHARK.lanes + SHARK.length) * msPerMetre;
    const gone = at + 2 * SHARK.reach * msPerMetre;
    if (to > roundMs - 500) break;
    passes.push({ warnFrom: at, from, to, gone, way: random() < 0.5 ? 1 : -1 });
    at = Math.max(
      gone + SHARK.restMs,
      at + (60_000 / SHARK.perMinute(s)) * lerp(0.6, 1.4, random()),
    );
  }
  return passes;
};

/** Where a shark is across the pitch at a moment, in metres, or undefined if it's not swimming. */
export const sharkAt = (shark: Shark, now: number): number | undefined => {
  if (now < shark.warnFrom || now > shark.gone) return undefined;
  const t = (now - shark.warnFrom) / (shark.gone - shark.warnFrom);
  return shark.way * SHARK.reach * (2 * t - 1);
};

// --- Cup Final -----------------------------------------------------------------------------------

export const SMOKE = {
  /** How long the pitch invader takes to run on and plant their flare: the first warning. */
  runMs: 1100,
  /** How long the smoke takes to billow up thick once it's planted: the second. */
  billowMs: 800,
  /** How long the smoke hangs thick. */
  thickMs: (s: number) => lerp(2600, 4400, s),
  /** How long it takes to thin and clear. */
  clearMs: 1200,
  /** How many flares a minute. */
  perMinute: (s: number) => lerp(2.5, 6.5, s),
  /**
   * How far through their flight things in the smoke's lane stay hidden. The flare's planted out
   * on the pitch, and its smoke drifts back down the lane towards the goal, so things come out of
   * it in front of the flare with plenty of their flight to go.
   */
  hidesTo: (s: number) => lerp(0.36, 0.55, s),
  /** How thick the smoke is: at its thinnest, things in it show faintly through. */
  density: (s: number) => lerp(0.7, 0.97, s),
  /** The least time between one flare's smoke clearing and the next invader. */
  restMs: 1500,
} as const;

/** A flare, planted in a lane by a pitch invader, and the smoke from it. */
export interface Flare extends Spell {
  readonly lane: Lane;
  /** When it's planted and starts to smoke. The invader runs on at `warnFrom`. */
  readonly plantedAt: number;
  /** Which side the invader runs on from: -1 the left, 1 the right. */
  readonly side: -1 | 1;
  /** How far through their flight things in the smoke stay hidden: see SMOKE. */
  readonly hidesTo: number;
  /** How thick the smoke is: see SMOKE. */
  readonly density: number;
}

/**
 * When and where pitch invaders plant flares over a round. One at a time, so the smoke's only
 * ever in one lane, and each clears before the next invader runs on.
 */
export const flares = (rule: TwistRule, roundMs: number, seed: number): readonly Flare[] => {
  const random = streamOf(seed, 3);
  const spells: Flare[] = [];
  let at = FIRST_SPELL_MS + random() * 3000;
  for (;;) {
    const s = strengthAt(rule, roundMs, at);
    const lane = LANES[Math.floor(random() * LANES.length)] ?? 0;
    // From the side nearest their lane, or either for the middle.
    const side = lane === 0 ? (random() < 0.5 ? -1 : 1) : lane;
    const plantedAt = at + SMOKE.runMs;
    const from = plantedAt + SMOKE.billowMs;
    const to = from + SMOKE.thickMs(s);
    if (to + SMOKE.clearMs > roundMs - 500) break;
    spells.push({
      warnFrom: at,
      plantedAt,
      from,
      to,
      lane,
      side,
      hidesTo: SMOKE.hidesTo(s),
      density: SMOKE.density(s),
    });
    at = Math.max(
      to + SMOKE.clearMs + SMOKE.restMs,
      at + (60_000 / SMOKE.perMinute(s)) * lerp(0.6, 1.4, random()),
    );
  }
  return spells;
};

/** How thick a flare's smoke is at a moment: 0 until it's planted, up to 1, and back as it clears. */
export const smokeOf = (flare: Flare, now: number): number => {
  if (now < flare.plantedAt || now > flare.to + SMOKE.clearMs) return 0;
  if (now < flare.from) return smoothstep(flare.plantedAt, flare.from, now);
  if (now <= flare.to) return 1;
  return 1 - smoothstep(flare.to, flare.to + SMOKE.clearMs, now);
};

/** The flare whose invader's on the pitch, or whose smoke's still hanging, at a moment, if any. */
export const flareAt = (spells: readonly Flare[], now: number): Flare | undefined =>
  spells.find((flare) => now >= flare.warnFrom && now <= flare.to + SMOKE.clearMs);

// --- Haunted Castle ------------------------------------------------------------------------------

export const GLOOM = {
  /** How long the candles gutter and smoke before they go out: the warning. */
  warnMs: 900,
  /** How long the hall stays dim. */
  dimMs: (s: number) => lerp(1800, 4600, s),
  /** How long the candles take to flicker back. */
  relightMs: 600,
  /** How many times a minute the candles go out. */
  perMinute: (s: number) => lerp(2, 6, s),
  /** The least time they stay lit between one dim and the next warning. */
  restMs: 2500,
  /**
   * How far through its flight something fades from sight in the dim. Before then it's in plain
   * view, so there's a good look at where it's going, and in the castle nothing changes lane.
   */
  fadeAt: (s: number) => lerp(0.62, 0.42, s),
  /** How long it takes to fade, as a share of its flight. */
  fadeSpan: 0.1,
  /** How often lightning flashes through the windows in a dim, lighting everything for a moment. */
  lightning: 0.5,
  flashMs: 240,
} as const;

/** A time the candles go out, the hall dim until they flicker back. */
export interface Dim extends Spell {
  /** How far through its flight something fades in it: see GLOOM. */
  readonly fadeAt: number;
  /** When lightning flashes in it, if it does. */
  readonly lightning?: number;
}

/** When the candles go out over a round, and when lightning flashes while they're out. */
export const dims = (rule: TwistRule, roundMs: number, seed: number): readonly Dim[] => {
  const random = streamOf(seed, 4);
  const spells: Dim[] = [];
  let at = FIRST_SPELL_MS + random() * 3000;
  for (;;) {
    const s = strengthAt(rule, roundMs, at);
    const from = at + GLOOM.warnMs;
    const to = from + GLOOM.dimMs(s);
    const flash =
      random() < GLOOM.lightning ? lerp(from + 400, to - 400 - GLOOM.flashMs, random()) : undefined;
    if (to + GLOOM.relightMs > roundMs - 500) break;
    spells.push({
      warnFrom: at,
      from,
      to,
      fadeAt: GLOOM.fadeAt(s),
      ...(flash === undefined ? {} : { lightning: flash }),
    });
    at = Math.max(
      to + GLOOM.relightMs + GLOOM.restMs,
      at + (60_000 / GLOOM.perMinute(s)) * lerp(0.55, 1.45, random()),
    );
  }
  return spells;
};

/** The dim the hall's in at a moment, flickering back to life included, if it's in one. */
const dimAt = (spells: readonly Dim[], now: number) =>
  spells.find((dim) => now >= dim.from && now < dim.to + GLOOM.relightMs);

/** How bright a flash of lightning is at a moment: a flash, a moment's dark, and a second flash. */
export const flashAt = (spells: readonly Dim[], now: number): number => {
  const strike = dimAt(spells, now)?.lightning;
  if (strike === undefined) return 0;
  const t = now - strike;
  return (t >= 0 && t < 70) || (t >= 120 && t < GLOOM.flashMs) ? 1 : 0;
};

/** How dim the hall is at a moment: 0 candlelit, rising to 1 as they go out, 0 in lightning. */
export const gloomAt = (spells: readonly Dim[], now: number): number => {
  const dim = dimAt(spells, now);
  if (!dim || flashAt(spells, now) > 0) return 0;
  if (now <= dim.to) return smoothstep(dim.from, dim.from + 200, now);
  return 1 - smoothstep(dim.to, dim.to + GLOOM.relightMs, now);
};

/**
 * How far something's faded from sight at a moment, from 0, in plain view, to 1, gone. Things are
 * clear as they're thrown, and fade at `fadeAt` of their flight if it's dim by then, staying gone
 * while it's dim, so they're headed or dodged from memory. Anything already past that point when
 * the candles go out is too close to lose, so it stays in sight.
 */
export const fadeOf = (spells: readonly Dim[], item: Item, now: number): number => {
  const dim = dimAt(spells, now);
  if (!dim || item.launchedAt + item.flightMs * dim.fadeAt < dim.from) return 0;
  const p = (now - item.launchedAt) / item.flightMs;
  return smoothstep(dim.fadeAt, dim.fadeAt + GLOOM.fadeSpan, p) * gloomAt(spells, now);
};

// --- The Leaning Tower ---------------------------------------------------------------------------

export const LEAN = {
  /** How long the screen creaks and shudders towards the side it's going before it goes: the warning. */
  warnMs: 700,
  /** How long it takes to lean over, and to right itself. */
  overMs: 900,
  backMs: 1100,
  /** How far it leans over, in degrees. The tower itself leans about four. */
  degrees: (s: number) => lerp(5, 14, s),
  /** How long it stays over. */
  holdMs: (s: number) => lerp(2200, 4800, s),
  /** How many times a minute it goes over. */
  perMinute: (s: number) => lerp(4, 9, s),
  /** The least time it stays level between righting itself and the next creak. */
  restMs: 1500,
  /** How far the shudder jolts it towards the side it's going, in degrees, and how many times a second. */
  shudder: 1.2,
  jolts: 9,
} as const;

/** A time the screen leans over. */
export interface Tip extends Spell {
  /** Which way it goes: 1 clockwise, its top to the right, or -1 to the left. */
  readonly side: 1 | -1;
  /** How far, in radians. */
  readonly angle: number;
}

/** When the screen leans over a round, which way and how far. It mostly goes the other way each time. */
export const leans = (rule: TwistRule, roundMs: number, seed: number): readonly Tip[] => {
  const random = streamOf(seed, 5);
  const tips: Tip[] = [];
  let side: 1 | -1 = random() < 0.5 ? 1 : -1;
  let at = FIRST_SPELL_MS + random() * 2000;
  for (;;) {
    const s = strengthAt(rule, roundMs, at);
    const from = at + LEAN.warnMs;
    const to = from + LEAN.overMs + LEAN.holdMs(s);
    if (to + LEAN.backMs > roundMs - 500) break;
    tips.push({ warnFrom: at, from, to, side, angle: (LEAN.degrees(s) * Math.PI) / 180 });
    if (random() < 0.75) side = side === 1 ? -1 : 1;
    at = Math.max(
      to + LEAN.backMs + LEAN.restMs,
      at + (60_000 / LEAN.perMinute(s)) * lerp(0.6, 1.4, random()),
    );
  }
  return tips;
};

/**
 * How far the screen leans at a moment, in radians, clockwise: level, then jolting towards the side
 * it's going in the creak, over and held there, and righting itself.
 */
export const leanAt = (tips: readonly Tip[], now: number): number => {
  const tip = tips.find((t) => now >= t.warnFrom && now < t.to + LEAN.backMs);
  if (!tip) return 0;
  const over = tip.side * tip.angle;
  if (now < tip.from) {
    const t = (now - tip.warnFrom) / LEAN.warnMs;
    const jolt = Math.abs(Math.sin(t * Math.PI * LEAN.jolts * (LEAN.warnMs / 1000)));
    return ((tip.side * LEAN.shudder * Math.PI) / 180) * t * jolt;
  }
  if (now < tip.to) return over * smoothstep(tip.from, tip.from + LEAN.overMs, now);
  return over * (1 - smoothstep(tip.to, tip.to + LEAN.backMs, now));
};

// --- Sakura Peak ---------------------------------------------------------------------------------

/**
 * Sakura Peak's dragon: a long pink dragon flies laps of the sky out over the drop, its body and
 * tail following its head round in one long, flowing curve. It comes in from the side and across
 * close, through where things are thrown, hiding whatever's coming behind it; swings away round the
 * side into the distance and back across far off, small, in front of Fuji; and round again, then
 * away into the distance. Close as it comes, anything it hides comes out in front of it with half
 * its flight still to go, and it's seen coming: its head flies in from the side first.
 */
export const DRAGON = {
  /** How long it takes to fly its laps, head and tail, in ms. */
  passMs: (s: number) => lerp(32_000, 26_000, s),
  /** How many times a minute it comes. */
  perMinute: (s: number) => lerp(0.9, 1.4, s),
  /** The least time between one leaving and the next coming. */
  restMs: 4000,
  /** How many laps it flies. */
  laps: 2,
  /**
   * How far through their flight things are, from 0 at launch to 1 at the player, where the
   * dragon's body comes nearest the player: anything it's hiding comes out in front of it there.
   */
  hidesTo: 0.5,
  /** How far down the pitch it flies on the far side of its laps, in metres: behind the throws. */
  far: 46,
  /** How far out to either side its laps turn, in metres: off a phone's screen. */
  turn: 12,
  /**
   * How high it flies across nearest the player, in metres, through the throws, and furthest, up
   * above Fuji: its laps are tilted, so they show as loops on the screen.
   */
  height: (s: number) => lerp(3.5, 3.9, s),
  farHeight: 9,
  /** How long it is, head to tail, in metres. */
  length: 30,
} as const;

/** A time the dragon flies its laps. */
export interface Pass extends Spell {
  /** The way it first flies across: 1 to the right, -1 to the left. */
  readonly side: 1 | -1;
  /** How its laps differ from another pass's, from -1 to 1. */
  readonly sway: number;
  readonly height: number;
}

/** When the dragon flies its laps in a round, and which way. */
export const dragons = (rule: TwistRule, roundMs: number, seed: number): readonly Pass[] => {
  const random = streamOf(seed, 6);
  const passes: Pass[] = [];
  let at = FIRST_SPELL_MS + 2000 + random() * 3000;
  for (;;) {
    const s = strengthAt(rule, roundMs, at);
    const to = at + DRAGON.passMs(s);
    if (to > roundMs - 500) break;
    passes.push({
      // Its head's in sight from the start: there's no hiding before it's there to see.
      warnFrom: at,
      from: at,
      to,
      side: random() < 0.5 ? 1 : -1,
      sway: random() * 2 - 1,
      height: DRAGON.height(s),
    });
    at = Math.max(
      to + DRAGON.restMs,
      at + (60_000 / DRAGON.perMinute(s)) * lerp(0.6, 1.4, random()),
    );
  }
  return passes;
};
