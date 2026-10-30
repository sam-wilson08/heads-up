import { type Decoy, decoyPool, FREE_PLAY, parOf, type Rules, type Summary } from "./game/engine";
import { FREE_PLAY_STRENGTH, type TwistKind } from "./game/twists/twist";
import { HIDDEN_VENUES, type Venue, type VenueId, VENUES } from "./venues";

// The venues are stages, opened by XP (see Venue.unlockLevel), and each plays its own way: its
// twist. A stage has a few fixed levels to practise it on, each a seeded run that plays the same
// every time, with medals for the score against targets set from its par, the score of a perfect
// run. Free play is still there at any stage that's open, on a fresh seed each time.

/** What a venue is like to play, as a stage. */
export interface Stage {
  readonly venue: VenueId;
  /** What makes it play differently. The park has nothing: it's where the game is learnt. */
  readonly twist?: TwistKind;
  /**
   * Whether the player can duck there as well as jump, with frisbees skimmed in at head height to
   * duck. None, for now: the park tried it out, and plays without it.
   */
  readonly ducks?: boolean;
  /** The twist in a few words. */
  readonly title: string;
  /** How it plays, and the tell to watch for. */
  readonly blurb: string;
}

const BASICS: Stage = {
  venue: "park",
  title: "The basics",
  blurb: "No tricks here. Head the balls, dodge everything else and jump the hurdles.",
};

const EVERY_STAGE: readonly Stage[] = [
  BASICS,
  {
    venue: "beach",
    twist: "breeze",
    title: "Sea breeze",
    blurb:
      "Gusts blow a whole wave one lane across mid-flight. Sand whipping over the pitch shows which way.",
  },
  {
    venue: "snow",
    twist: "snow",
    title: "Snowed under",
    blurb:
      "Some things come over caked in snow, so you can't tell a ball from a snowball until the snow shakes off.",
  },
  {
    venue: "moon",
    twist: "zap",
    title: "Alien zaps",
    blurb:
      "A UFO zaps balls green, and a zapped ball explodes just before it reaches you. Don't head it: letting it go keeps your streak.",
  },
  {
    venue: "underwater",
    twist: "sway",
    title: "Currents",
    blurb:
      "Currents sway everything across the lanes. Its shadow on the seabed always shows where it'll land.",
  },
  {
    venue: "volcano",
    twist: "bombs",
    title: "Lava bombs",
    blurb:
      "Lava bombs drop out of the sky beside the ball. A glowing ring on the pitch shows where each will land.",
  },
  {
    venue: "mars",
    twist: "dust",
    title: "Dust devils",
    blurb: "Dust devils spin up in a lane and hide whatever's coming down it until it's close.",
  },
  {
    venue: "space",
    twist: "warp",
    title: "Wormholes",
    blurb: "Portals open in two lanes: whatever flies into one comes out of the other.",
  },
  {
    venue: "funfair",
    twist: "bounce",
    title: "Trampolines",
    blurb:
      "A ball off a trampoline goes BOING and drops in high: jump to head it, for double. Let it go and your streak goes. Keep a jump for the hurdles!",
  },
  {
    venue: "castle",
    twist: "haunt",
    title: "Candles out",
    blurb:
      "When the candles gutter, the lights are going: in the dark, things fade mid-flight. Ghost balls have no shadow, so don't head them.",
  },
  {
    venue: "final",
    twist: "flare",
    title: "Pitch invader",
    blurb:
      "A pitch invader runs on and plants a flare in one lane. Its red smoke hides whatever's coming down that lane until it's close, then clears.",
  },
  {
    venue: "colosseum",
    twist: "verdict",
    title: "Thumbs up, thumbs down",
    blurb:
      "Thumbs up, head the green balls; thumbs down, the red. When the side of the screen flashes, a spear's coming: step aside or tap to duck.",
  },
  {
    venue: "pisa",
    twist: "lean",
    title: "Leaning screen",
    blurb:
      "The whole screen leans over like the tower, holds, then rights itself. It creaks and jolts the way it's going first.",
  },
  {
    venue: "fuji",
    twist: "gale",
    title: "Mountain gusts",
    blurb:
      "Gusts blow balls across mid-flight: blossom streaming past shows which way. A dragon's coils hide balls as it flies over. Ninjas sweep staffs in low: step out of reach or jump.",
  },
];

/** The stages there are to play: every one but those whose venues are hidden (see venues.ts). */
export const STAGES: readonly Stage[] = EVERY_STAGE.filter(
  (stage) => !HIDDEN_VENUES.has(stage.venue),
);

export const stageOf = (venue: VenueId): Stage =>
  STAGES.find((stage) => stage.venue === venue) ?? BASICS;

/** The decoys a stage throws: the classic ones and the venue's own. */
export const decoysAt = (venue: Venue): readonly [Decoy, ...Decoy[]] => decoyPool(venue.decoys);

/** How free play goes at each venue: the usual 75 seconds, with the venue's twist. */
const FREE_PLAY_AT = new Map(
  STAGES.map((stage): [VenueId, Rules] => [
    stage.venue,
    {
      ...FREE_PLAY,
      ...(stage.twist ? { twist: { kind: stage.twist, strength: FREE_PLAY_STRENGTH } } : {}),
      ...(stage.ducks ? { ducks: true } : {}),
    },
  ]),
);

/** How free play goes at a venue. The same object each time, so a round's rules hold still. */
export const freePlayAt = (venue: VenueId): Rules => FREE_PLAY_AT.get(venue) ?? FREE_PLAY;

export interface Level {
  /** Like "moon-2". */
  readonly id: string;
  readonly venue: VenueId;
  /** Its place in the stage, from 1. */
  readonly number: number;
  readonly name: string;
  /** Whether it's the stage's last and hardest. */
  readonly final: boolean;
  readonly rules: Rules;
  readonly seed: number;
  /** The score of a perfect run: every ball headed. The tests check it still is. */
  readonly par: number;
}

/**
 * A level as the table writes it: its name, how many seconds it lasts, its pace at kick-off and
 * full time (on free play's scale of 0 to 1), its lives, whether it has hurdles, how strongly the
 * twist bites at kick-off and full time, its seed and its par.
 */
type Row = readonly [
  name: string,
  seconds: number,
  pace: readonly [number, number],
  lives: number,
  hurdles: boolean,
  twist: readonly [number, number],
  seed: number,
  par: number,
];

/**
 * Each stage's levels. The first teaches the twist: short, slow, gentle and without hurdles. Each
 * after is longer, faster and bites harder, up to the final. Later stages start a little faster.
 * Seeds are picked for a par near the middle of what that level's rules give, so no level is a
 * freak draw; levels.test.ts recomputes every par.
 */
const TABLE: Readonly<Record<VenueId, readonly Row[]>> = {
  park: [
    ["Kick-about", 40, [0, 0.3], 3, false, [0, 0], 1109, 5_340],
    ["Hurdles", 50, [0.1, 0.5], 3, true, [0, 0], 1219, 9_730],
    ["Busy Sunday", 60, [0.25, 0.75], 2, true, [0, 0], 1318, 18_170],
    ["Park final", 75, [0.4, 0.95], 2, true, [0, 0], 1415, 33_320],
  ],
  beach: [
    ["Sea breeze", 40, [0.06, 0.36], 3, false, [0, 0.3], 3123, 6_070],
    ["Crosswind", 50, [0.16, 0.56], 3, true, [0.25, 0.6], 3204, 10_430],
    ["Gusty", 60, [0.31, 0.81], 2, true, [0.5, 0.85], 3323, 18_550],
    ["Beach final", 75, [0.46, 1], 2, true, [0.7, 1], 3406, 35_010],
  ],
  snow: [
    ["First flurry", 40, [0.09, 0.39], 3, false, [0, 0.3], 4128, 6_020],
    ["Snowed under", 50, [0.19, 0.59], 3, true, [0.25, 0.6], 4225, 10_400],
    ["Blizzard", 60, [0.34, 0.84], 2, true, [0.5, 0.85], 4317, 18_310],
    ["Snow final", 75, [0.49, 1], 2, true, [0.7, 1], 4403, 36_390],
  ],
  moon: [
    ["Close encounter", 40, [0.12, 0.42], 3, false, [0, 0.3], 5113, 5_520],
    ["Zap zone", 50, [0.22, 0.62], 3, true, [0.25, 0.6], 5218, 8_450],
    ["Invasion", 60, [0.37, 0.87], 2, true, [0.5, 0.85], 5305, 14_210],
    ["Moon final", 75, [0.52, 1], 2, true, [0.7, 1], 5408, 25_030],
  ],
  underwater: [
    ["Shallows", 40, [0.15, 0.45], 3, false, [0, 0.3], 6107, 6_360],
    ["Currents", 50, [0.25, 0.65], 3, true, [0.25, 0.6], 6226, 11_220],
    ["Riptide", 60, [0.4, 0.9], 2, true, [0.5, 0.85], 6318, 20_000],
    ["Deep final", 75, [0.55, 1], 2, true, [0.7, 1], 6405, 36_910],
  ],
  volcano: [
    ["Rumble", 40, [0.18, 0.48], 3, false, [0, 0.3], 7108, 6_800],
    ["Eruption", 50, [0.28, 0.68], 3, true, [0.25, 0.6], 7213, 11_580],
    ["Lava rain", 60, [0.43, 0.93], 2, true, [0.5, 0.85], 7317, 22_020],
    ["Volcano final", 75, [0.58, 1], 2, true, [0.7, 1], 7401, 36_920],
  ],
  mars: [
    ["Red dust", 40, [0.21, 0.51], 3, false, [0, 0.3], 8127, 6_830],
    ["Devils", 50, [0.31, 0.71], 3, true, [0.25, 0.6], 8205, 10_770],
    ["Dust storm", 60, [0.46, 0.96], 2, true, [0.5, 0.85], 8317, 21_330],
    ["Mars final", 75, [0.61, 1], 2, true, [0.7, 1], 8418, 38_440],
  ],
  space: [
    ["Lift-off", 40, [0.24, 0.54], 3, false, [0, 0.3], 9116, 6_910],
    ["Wormholes", 50, [0.34, 0.74], 3, true, [0.25, 0.6], 9217, 12_970],
    ["Hyperspace", 60, [0.49, 0.99], 2, true, [0.5, 0.85], 9327, 21_820],
    ["Sudden death", 75, [0.64, 1], 1, true, [0.7, 1], 9410, 36_640],
  ],
  funfair: [
    ["Roll up", 40, [0.27, 0.57], 3, false, [0, 0.3], 10118, 7_430],
    ["Bouncy", 50, [0.37, 0.77], 3, true, [0.25, 0.6], 10201, 12_410],
    ["Big wheel", 60, [0.52, 1], 2, true, [0.5, 0.85], 10354, 23_140],
    ["Funfair final", 75, [0.67, 1], 2, true, [0.7, 1], 10424, 44_300],
  ],
  castle: [
    ["Candlelight", 40, [0.3, 0.6], 3, false, [0, 0.3], 11102, 7_480],
    ["Bump in the night", 50, [0.4, 0.8], 3, true, [0.25, 0.6], 11226, 11_890],
    ["Midnight", 60, [0.55, 1], 2, true, [0.5, 0.85], 11323, 23_280],
    ["Castle final", 75, [0.7, 1], 2, true, [0.7, 1], 11404, 40_380],
  ],
  final: [
    ["Walk-out", 40, [0.33, 0.63], 3, false, [0, 0.3], 12113, 7_760],
    ["Flares up", 50, [0.43, 0.83], 3, true, [0.25, 0.6], 12222, 13_520],
    ["Extra time", 60, [0.58, 1], 2, true, [0.5, 0.85], 12314, 24_500],
    ["The Final", 75, [0.73, 1], 1, true, [0.7, 1], 12421, 39_850],
  ],
  colosseum: [
    ["Thumbs up", 40, [0.36, 0.66], 3, false, [0, 0.3], 13102, 6_100],
    ["Spears", 50, [0.46, 0.86], 3, true, [0.25, 0.6], 13224, 11_960],
    ["Gladiators", 60, [0.61, 1], 2, true, [0.5, 0.85], 13328, 20_710],
    ["Thumbs down", 75, [0.76, 1], 2, true, [0.7, 1], 13419, 35_510],
  ],
  pisa: [
    ["Creak", 40, [0.39, 0.69], 3, false, [0, 0.3], 14103, 8_700],
    ["Off level", 50, [0.49, 0.89], 3, true, [0.25, 0.6], 14234, 14_890],
    ["Tipping point", 60, [0.64, 1], 2, true, [0.5, 0.85], 14307, 25_350],
    ["Pisa final", 75, [0.79, 1], 2, true, [0.7, 1], 14409, 42_320],
  ],
  fuji: [
    ["First blossom", 40, [0.42, 0.72], 3, false, [0, 0.3], 15148, 8_680],
    ["Ninja sweep", 50, [0.52, 0.92], 3, true, [0.25, 0.6], 15216, 16_550],
    ["Gale force", 60, [0.67, 1], 2, true, [0.5, 0.85], 15340, 26_650],
    ["Peak final", 75, [0.82, 1], 2, true, [0.7, 1], 15446, 46_100],
  ],
};

/**
 * The rules a row of the table sets, with its stage's twist. Balls are skied on every level but
 * the park's first, where the game is learnt, unless the twist rules them out (see skies).
 */
const rulesOf = (venue: VenueId, row: Row, number: number): Rules => {
  const [, seconds, pace, lives, hurdles, strength] = row;
  const { twist, ducks } = stageOf(venue);
  return {
    roundMs: seconds * 1000,
    pace,
    lives,
    hurdles,
    skied: venue !== "park" || number > 1,
    ...(twist ? { twist: { kind: twist, strength } } : {}),
    ...(ducks ? { ducks: true } : {}),
  };
};

export const LEVELS: readonly Level[] = VENUES.flatMap((venue) =>
  TABLE[venue.id].map((row, i, rows): Level => {
    const [name, , , , , , seed, par] = row;
    return {
      id: `${venue.id}-${i + 1}`,
      venue: venue.id,
      number: i + 1,
      name,
      final: i === rows.length - 1,
      rules: rulesOf(venue.id, row, i + 1),
      seed,
      par,
    };
  }),
);

export const levelsAt = (venue: VenueId): readonly Level[] =>
  LEVELS.filter((level) => level.venue === venue);

export const levelById = (id: string): Level | undefined => LEVELS.find((l) => l.id === id);

/** Works a level's par out afresh, by playing it perfectly. */
export const parFor = (level: Level, venues = VENUES): number => {
  const venue = venues.find((v) => v.id === level.venue);
  return parOf(level.rules, decoyPool(venue?.decoys), level.seed);
};

// --- Medals --------------------------------------------------------------------------------------

/**
 * The medals, each needing the one before. Bronze is for finishing with a life left. Silver and
 * gold are for the score. A header scores ten times the streak, so a run's score goes with the
 * square of its streaks, and one slip that breaks the streak mid-run costs about half of it. Over
 * every level, one slip leaves 44 to 53% of par, two leave 30 to 37%, three 21 to 28% and five 14
 * to 18%. So gold allows one slip wherever it falls but never two, and silver three however
 * they're spread but never five (levels.test.ts plays each level to check). Perfect is a badge on
 * top, for heading every ball without a knock.
 */
export type Medal = "bronze" | "silver" | "gold";
export const MEDALS: readonly Medal[] = ["bronze", "silver", "gold"];

/** The share of par the score medals need. */
export const SHARE = { silver: 0.2, gold: 0.4 } as const;

/** XP for reaching a medal on a level, once: not again for playing it again. */
export const MEDAL_XP: Readonly<Record<Medal, number>> = { bronze: 100, silver: 250, gold: 500 };

/** The score each medal needs, rounded down to a ten. Bronze needs none, just a life left. */
export const targetsOf = (level: Level): Readonly<Record<Medal, number>> => ({
  bronze: 0,
  silver: Math.floor((level.par * SHARE.silver) / 10) * 10,
  gold: Math.floor((level.par * SHARE.gold) / 10) * 10,
});

/** The best medal a run earned, if any. */
export const medalFor = (level: Level, summary: Summary): Medal | undefined => {
  if (summary.outOfLives) return undefined;
  const targets = targetsOf(level);
  return [...MEDALS].reverse().find((medal) => summary.score >= targets[medal]);
};

/** Whether a run headed every ball without a knock. */
export const isPerfect = (level: Level, summary: Summary, livesLeft: number): boolean =>
  !summary.outOfLives &&
  summary.footballs > 0 &&
  summary.headers === summary.footballs &&
  livesLeft === level.rules.lives;

const rank = (medal: Medal | undefined) => (medal ? MEDALS.indexOf(medal) : -1);

/** The medals from `from` (not included) up to `to`, as the next run reaching `to` earns them. */
export const medalsBetween = (from: Medal | undefined, to: Medal | undefined): Medal[] =>
  MEDALS.filter((medal) => rank(medal) > rank(from) && rank(medal) <= rank(to));

/** The next medal to go for in a run that's scored `score`, and what it needs. */
export const nextTarget = (
  level: Level,
  score: number,
): { readonly medal: Medal; readonly score: number } | undefined => {
  const targets = targetsOf(level);
  const medal = (["silver", "gold"] as const).find((m) => score < targets[m]);
  return medal && { medal, score: targets[medal] };
};
