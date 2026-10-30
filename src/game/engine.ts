// Heads Up's rules, kept apart from the 3D scene so they can be tested. Times are milliseconds
// from the start of the round. Things are launched from the far goal in waves, and each one
// reaches the player in one of three lanes; the player points their head at a lane to head the
// footballs and dodge everything else. Hurdles come along the ground in one, two or all three
// lanes, and the player steps round them or jumps them. Jumping tires them: they have a few jumps
// in their legs, which come back slowly, so they're best saved for hurdles that can't be stepped
// round, or spent on a high ball, which can only be headed in a jump: one skied off the throw,
// anywhere but the Funfair and the Colosseum, or at the Funfair one bounced off a trampoline. A
// decoy to the head or a trip over a hurdle costs a life, and losing the last one puts the player
// on the floor and ends the round early. At the Colosseum there are spears instead of hurdles,
// thrust in from the side at head height: the player steps out of reach, or ducks under them. At
// Sunny Park, where the player can duck as well as jump, some hurdles are frisbees instead, skimmed
// in at head height across every lane, so they have to be ducked. On Sakura Peak, ninjas sweep
// their staffs in low from the side instead, across the lane on that side: the player steps out
// of reach, or jumps them.
//
// A round plays by its rules: how long it lasts, how fast it gets, and the venue's twist (see
// twists/twist.ts). Free play's are the defaults. Nothing the player does changes what's launched,
// so a seeded random source fixes a whole run, which is what makes a level the same every time.

import {
  type BallColour,
  type ItemTwist,
  strengthAt,
  TUNING,
  type TwistRule,
  VERDICT_REACT_MS,
  verdictAt,
  WANTED,
} from "./twists/twist";

export const ROUND_MS = 75_000;
export const LIVES = 3;
/** How long the round goes on after the player loses their last life, while they fall down. */
export const FALL_MS = 2000;

/** Left, middle and right, as the player sees them. */
export type Lane = -1 | 0 | 1;
export const LANES: readonly Lane[] = [-1, 0, 1];

export const DECOYS = [
  "panda",
  "stopwatch",
  "hat",
  "gloves",
  "boot",
  // Each venue's own, two or three apiece (see venues.ts).
  "pigeon",
  "frisbee",
  "volleyball",
  "crab",
  "flipFlop",
  "snowball",
  "snowflake",
  "helmet",
  "moonRock",
  "cheese",
  "jellyfish",
  "starfish",
  "fireball",
  "lavaRock",
  "rover",
  "rocket",
  "ufo",
  "planet",
  "candyFloss",
  "toffeeApple",
  "rubberDuck",
  "pumpkin",
  "skull",
  "spellbook",
  "scarf",
  "banana",
  "foamFinger",
  // Thrown only by the Haunted Castle's twist, beside a real ball.
  "ghostBall",
  // The Colosseum's, thrown from the stands.
  "gladiatorHelmet",
  "amphora",
  "grapes",
] as const;
export type Decoy = (typeof DECOYS)[number];

/** The decoys at every venue. A venue can add its own as well: see decoyPool. */
export const CLASSIC_DECOYS: readonly [Decoy, ...Decoy[]] = [
  "panda",
  "stopwatch",
  "hat",
  "gloves",
  "boot",
];

/**
 * The decoys a round throws: the classic ones, plus a venue's own, which each come up three times
 * as often as any one classic decoy, so they're what that venue is known for.
 */
export const decoyPool = (own: readonly Decoy[] = []): readonly [Decoy, ...Decoy[]] => [
  ...CLASSIC_DECOYS,
  ...own.flatMap((decoy) => [decoy, decoy, decoy]),
];
export type ItemKind = "ball" | "golden" | Decoy | "hurdle";

export const isFootball = (kind: ItemKind): boolean => kind === "ball" || kind === "golden";

/** What happened when an item reached the player. */
export type Outcome = "header" | "hit" | "missed" | "dodged" | "cleared" | "tripped";

export interface Item {
  readonly id: number;
  readonly kind: ItemKind;
  readonly lane: Lane;
  /** The lanes a hurdle covers, left to right. Every lane, if not given. */
  readonly lanes?: readonly Lane[];
  readonly launchedAt: number;
  readonly flightMs: number;
  readonly outcome?: Outcome;
  /** What the venue's twist has done to it, if anything. */
  readonly twist?: ItemTwist;
  /**
   * Skied off the throw, high over its lane, so it can only be headed near the top of a jump.
   * It's the base game's, not a twist's, and no twist touches it (see launchWave).
   */
  readonly skied?: boolean;
  /**
   * A frisbee skimmed in flat at head height across every lane, in place of a hurdle along the
   * ground (see skims). It goes over a ducked head; jumping's no help against it.
   */
  readonly skimmed?: boolean;
}

/** How a round plays. Free play's are the defaults; each level sets its own (see levels.ts). */
export interface Rules {
  readonly roundMs: number;
  /**
   * How hard it is at kick-off and at full time, on free play's scale, where 0 is how a round
   * starts and 1 how it finishes. Everything speeds up and gets busier with it.
   */
  readonly pace: readonly [number, number];
  readonly lives: number;
  readonly hurdles: boolean;
  /**
   * Whether balls are sometimes skied, to be headed in a jump. Not where there are spears, which
   * the tap ducks, or at the Funfair, whose trampolines send its high balls (see skies).
   */
  readonly skied?: boolean;
  /**
   * Whether the player can duck as well as jump: under anything coming at their head, though never
   * a hurdle, and some of the hurdles are frisbees at head height to duck (see skims). Only Sunny
   * Park's, for now, to try it out. At the Colosseum the tap ducks instead.
   */
  readonly ducks?: boolean;
  readonly twist?: TwistRule;
}

export const FREE_PLAY: Rules = {
  roundMs: ROUND_MS,
  pace: [0, 1],
  lives: LIVES,
  hurdles: true,
  skied: true,
};

export interface Round {
  readonly rules: Rules;
  readonly now: number;
  /** The lane the player's head is pointing at. */
  readonly lane: Lane;
  readonly items: readonly Item[];
  readonly nextLaunchAt: number;
  readonly nextId: number;
  /** Waves in a row without a football, so a run of decoys can't go on too long. */
  readonly wavesWithoutFootball: number;
  /** The decoys this round throws, picked evenly, so one that's listed more often comes up more. */
  readonly decoys: readonly [Decoy, ...Decoy[]];
  readonly nextHurdleAt: number;
  /** The lanes the next hurdle will cover, settled in advance so the waves around it make room. */
  readonly nextHurdleLanes: readonly Lane[];
  /** Whether the next hurdle is a frisbee skimmed at head height (see skims), settled with it. */
  readonly nextHurdleSkimmed: boolean;
  /** When the player last jumped. */
  readonly jumpedAt: number;
  /** When the player last ducked: at the Colosseum, or where they can duck as well as jump. */
  readonly duckedAt: number;
  /** How many jumps the player has in their legs, up to FITNESS_MAX. They come back slowly. */
  readonly fitness: number;
  /**
   * What a player who only jumps when they have to would have in their legs after the last hurdle
   * across every lane that's been settled, and when. See bookJump.
   */
  readonly spare: Spare;
  /**
   * When everything a perfect player jumps for arrives, in order: every hurdle across every lane
   * that's been settled, and every high ball. See legsFor.
   */
  readonly leaps: readonly number[];
  readonly score: number;
  /** Footballs headed in a row. It's the multiplier, so headers score more the longer it runs. */
  readonly streak: number;
  readonly bestStreak: number;
  readonly headers: number;
  /** Footballs that reached the player, headed or not. */
  readonly footballs: number;
  /** Knocks the player can still take. */
  readonly lives: number;
  /** When the player lost their last life and went down, if they have. */
  readonly downAt?: number;
}

export type RoundEvent =
  | {
      readonly type: "header";
      readonly item: Item;
      readonly points: number;
      readonly streak: number;
    }
  | {
      readonly type: "hit";
      readonly item: Item;
      readonly lostStreak: number;
      /** The lives left after it. */
      readonly lives: number;
    }
  | { readonly type: "missed"; readonly item: Item; readonly lostStreak: number }
  | { readonly type: "dodged"; readonly item: Item }
  | { readonly type: "cleared"; readonly item: Item; readonly points: number }
  | {
      readonly type: "tripped";
      readonly item: Item;
      readonly lostStreak: number;
      /** The lives left after it. */
      readonly lives: number;
    };

/** A random number in [0, 1). Injected so tests can fix it. */
export type Random = () => number;

/** A ball headed off a jump, high, scores double. */
const POINTS = { ball: 10, golden: 30, high: 20, hurdle: 20 } as const;
const FIRST_LAUNCH_MS = 700;
const FIRST_HURDLE_MS = 8000;

/** How long a jump is in the air. */
export const JUMP_MS = 700;
/** How many jumps the player has in their legs when fresh. Each jump costs one. */
export const FITNESS_MAX = 3;
/**
 * How long it takes to get one jump back. Slow enough that a player who jumps at every hurdle runs
 * out of legs most rounds, while one who saves their jumps never does.
 */
export const JUMP_BACK_MS = 8000;
/**
 * How long after landing before the player can jump again, while they get their legs back. Long
 * enough that a jump that wasn't needed can leave them unable to jump the next hurdle.
 */
export const LANDING_MS = 600;
/**
 * A hurdle that can be stepped round is sometimes followed, this long after, by one across every
 * lane. That's too long for one jump to clear both, and too soon to land and jump again, so the
 * first has to be stepped round. A player who jumps everything trips.
 */
const FOLLOW_UP_MS = 650;
/**
 * Things in the air arriving within this long of a hurdle that can be stepped round leave the
 * player a way round it, so avoiding the hurdle never costs them a football or a knock: see
 * clearLanesAt.
 */
export const ROOM_MS = 500;
/** How often a hurdle that can be stepped round has a follow-up: more often as the round goes on. */
const followUpChanceAt = (d: number) => lerp(0.15, 0.5, d);
/** Too near the start or end of a jump, the feet are too low to clear a hurdle. */
const CLEARANCE = 0.12;
/**
 * How far through a jump a high ball can be headed: near the top, from a quarter of the way
 * through to three quarters, while the head is up at least 70% of the jump's height.
 */
export const HIGH_REACH = [0.25, 0.75] as const;
/**
 * The least time between the arrivals of two things a perfect player jumps for. It's enough to
 * land and get their legs back between them, even jumping the first as late as it allows and the
 * next as early, so it doesn't matter how they time each.
 */
const LEAP_GAP_MS = JUMP_MS + LANDING_MS + JUMP_MS * (1 - 2 * CLEARANCE);
/**
 * What a player who heads every high ball has left in their legs after one, at the least. Not
 * much. At the Funfair the next hurdle across every lane is settled without a thought for high
 * balls (see bookJump), so a player who spends every jump on them can be caught short, and it's
 * theirs to decide which to spend them on. Where balls are skied instead, that hurdle waits until
 * the player who's headed every one would have a jump for it (see nextHurdle), so heading every
 * ball can always be done: what's theirs to decide is which to let go.
 */
const HIGH_RESERVE = 0.5;
/**
 * How often a wave's plain ball is skied, at a difficulty: rarely at kick-off, more often as the
 * pace rises. The player's legs keep it in check, as they do the trampolines (see skyIn).
 */
const skiedChanceAt = (d: number) => lerp(0.05, 0.3, d);
const GOLDEN_CHANCE = 0.06;
/** How long a duck lasts, at the Colosseum, and how long after it before the player can duck again. */
export const DUCK_MS = 600;
const DUCK_RECOVERY_MS = 200;
/** Too near the start or end of a duck, the head's still up where a spear can catch it. */
const DUCK_CLEARANCE = 0.1;
/** How often one of Sunny Park's hurdles is a frisbee skimmed at head height instead. */
const SKIM_CHANCE = 0.4;
/**
 * How long either side of a skimmed frisbee's arrival nothing else arrives, so the player can duck
 * it however they time it without letting a ball go over their head.
 */
const SKIM_ROOM_MS = DUCK_MS;
/** How long an item stays in the round after reaching the player, while it flies off. */
const LINGER_MS = 1200;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const pick = <T>(options: readonly [T, ...T[]], random: Random): T =>
  options[Math.floor(random() * options.length)] ?? options[0];

const shuffle = <T>(options: readonly T[], random: Random): T[] => {
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
  }
  return shuffled;
};

/**
 * How hard the round is at a moment: in free play, 0 at kick-off rising to 1 at full time. A level
 * can start further up, or stop short. Everything speeds up and gets busier with it.
 */
export const difficultyAt = (rules: Rules, now: number): number =>
  lerp(rules.pace[0], rules.pace[1], Math.min(Math.max(now / rules.roundMs, 0), 1));

/** How long something launched at a difficulty takes to reach the player. */
export const flightMsAt = (d: number): number => lerp(1700, 1050, d);

const waveGapMsAt = (d: number) => lerp(950, 520, d);

/** Hurdles come along the ground a little slower than things in the air, and less often. */
const hurdleFlightMsAt = (d: number) => flightMsAt(d) * 1.15;
const hurdleGapMsAt = (d: number) => lerp(7000, 3500, d);

const hurdleArrivalAt = (rules: Rules, launch: number) =>
  launch + hurdleFlightMsAt(difficultyAt(rules, launch));

/** Fitness after `ms` of getting jumps back. */
const recovered = (fitness: number, ms: number) =>
  Math.min(FITNESS_MAX, fitness + ms / JUMP_BACK_MS);

/** What a player who only jumps when they have to has in their legs just after a jump, and when. */
export interface Spare {
  readonly fitness: number;
  readonly at: number;
}

/**
 * Books a jump for a hurdle across every lane arriving at `arrival`, against what a player who only
 * jumps when they have to would have in their legs. It's undefined if they'd have no jump ready,
 * and then the hurdle mustn't need one. So a player who saves their jumps always has one when it
 * counts, and one who wastes them can run out. It allows for them jumping the last as late as it
 * arrived, and this one as early as JUMP_MS before, so however they time it they're covered.
 *
 * That player lets every high ball go over their head (see canLeap), which costs them the streak
 * but never a jump, so high balls don't come into it: a jump spent on one is the player's own
 * risk.
 */
const bookJump = (spare: Spare, arrival: number): Spare | undefined => {
  const legs = recovered(spare.fitness, arrival - JUMP_MS - spare.at);
  return legs >= 1 ? { fitness: legs - 1, at: arrival } : undefined;
};

/** `leaps` with one more arrival in it, in order. */
const withLeap = (leaps: readonly number[], arrival: number): number[] =>
  [...leaps, arrival].sort((a, b) => a - b);

/**
 * What a perfect player, who heads every high ball and jumps every hurdle across every lane, has
 * in their legs just after each of those jumps, given when they arrive (see Round.leaps). It's
 * undefined for one they'd find themselves without a jump for, or that comes too soon after the
 * last to land and go again: that one they trip over, or let go over their head, and it costs them
 * nothing in legs. Like bookJump, it allows for them timing each jump however they like.
 */
const legsFor = (leaps: readonly number[]): (number | undefined)[] => {
  let spare: Spare = { fitness: FITNESS_MAX, at: -Infinity };
  return leaps.map((arrival) => {
    const booked = arrival - spare.at >= LEAP_GAP_MS ? bookJump(spare, arrival) : undefined;
    if (booked) spare = booked;
    return booked?.fitness;
  });
};

/**
 * Whether a perfect player could jump for one more thing arriving at `arrival`, given everything
 * they jump for already (see legsFor), and have `reserve` left in their legs after it, without it
 * leaving them unable to jump for anything they already could.
 */
const canLeap = (leaps: readonly number[], arrival: number, reserve: number): boolean => {
  const before = legsFor(leaps);
  const leapt = withLeap(leaps, arrival);
  const after = legsFor(leapt);
  const at = leapt.indexOf(arrival);
  const left = after[at];
  const keepsEvery = before.every(
    (legs, i) => legs === undefined || after[i < at ? i : i + 1] !== undefined,
  );
  return left !== undefined && left >= reserve && keepsEvery;
};

export const arrivalOf = (item: Item): number => item.launchedAt + item.flightMs;

/** How far through its flight an item is: 0 at launch, 1 when it reaches the player. */
export const progressOf = (item: Item, now: number): number =>
  (now - item.launchedAt) / item.flightMs;

/**
 * Whether a round has spears rather than hurdles: the Colosseum's. Spears thrust in from one side,
 * so each covers the lane on that side or the two nearest it, never all three, and is stepped round
 * or ducked under, never jumped.
 */
export const hasSpears = (rules: Rules): boolean => rules.twist?.kind === "verdict";

/**
 * Whether a round's hurdles are ninjas' staffs: Sakura Peak's. Each sweeps in low from one side,
 * across the lane on that side and no further, and is stepped round or jumped, as a hurdle is.
 */
export const hasSweeps = (rules: Rules): boolean => rules.twist?.kind === "gale";

/** The side a ninja's staff sweeps in from: the side of the lane it covers. */
export const sweptFrom = (item: Item): -1 | 1 => ((item.lanes ?? LANES).includes(-1) ? -1 : 1);

/**
 * Whether a round skies balls. Never where there are spears, since the tap ducks there, and never
 * at the Funfair, whose high balls come off its trampolines: two kinds of high ball sharing the
 * player's legs would only take turns, and the trampolines are what the Funfair's for.
 */
export const skies = (rules: Rules): boolean =>
  rules.skied === true && rules.twist?.kind !== "bounce" && !hasSpears(rules);

/**
 * Whether some of a round's hurdles are frisbees, skimmed in at head height across every lane to be
 * ducked: where the player can duck as well as jump.
 */
export const skims = (rules: Rules): boolean => rules.ducks === true && !hasSpears(rules);

/** The first spear: a long one from the right, out of reach on the left. */
const FIRST_SPEAR: readonly Lane[] = [0, 1];

/** Whether a round's hurdles come in from one side, so never across every lane, to be jumped. */
const fromTheSide = (rules: Rules): boolean => hasSpears(rules) || hasSweeps(rules);

export const newRound = (decoys = decoyPool(), rules: Rules = FREE_PLAY): Round => ({
  rules,
  now: 0,
  lane: 0,
  items: [],
  nextLaunchAt: FIRST_LAUNCH_MS,
  nextId: 1,
  wavesWithoutFootball: 0,
  decoys,
  // A round without hurdles never gets to its first.
  nextHurdleAt: rules.hurdles ? FIRST_HURDLE_MS : Infinity,
  // The first covers every lane, so it has to be jumped, which the game says how to do. A first
  // spear can't: it's stepped round or ducked. Nor can a first staff, from the right.
  nextHurdleLanes: hasSpears(rules) ? FIRST_SPEAR : hasSweeps(rules) ? [1] : LANES,
  // Nor is the first ever a frisbee.
  nextHurdleSkimmed: false,
  jumpedAt: -Infinity,
  duckedAt: -Infinity,
  fitness: FITNESS_MAX,
  spare: { fitness: FITNESS_MAX - 1, at: hurdleArrivalAt(rules, FIRST_HURDLE_MS) },
  leaps: rules.hurdles && !fromTheSide(rules) ? [hurdleArrivalAt(rules, FIRST_HURDLE_MS)] : [],
  score: 0,
  streak: 0,
  bestStreak: 0,
  headers: 0,
  footballs: 0,
  lives: rules.lives,
});

export const pointHead = (round: Round, lane: Lane): Round => ({ ...round, lane });

/** When the round ends: at full time, or once the player has gone down and had time to fall. */
const endOf = (round: Round): number =>
  round.downAt === undefined ? round.rules.roundMs : round.downAt + FALL_MS;

export const isOver = (round: Round): boolean => round.now >= endOf(round);

/** How far through a jump the player is at a moment: 0 to 1 while in the air, else undefined. */
export const jumpProgress = (round: Round, at: number = round.now): number | undefined => {
  const p = (at - round.jumpedAt) / JUMP_MS;
  return p >= 0 && p <= 1 ? p : undefined;
};

/** Whether the player is on their feet and ready to jump, if they have the legs for it. */
const isReady = (round: Round) =>
  round.downAt === undefined && round.now - round.jumpedAt >= JUMP_MS + LANDING_MS;

/** Whether the player would jump now but for having no jumps left in their legs. */
export const isTired = (round: Round): boolean => isReady(round) && round.fitness < 1;

/** How far through a duck the player is at a moment: 0 to 1 while ducking, else undefined. */
export const duckProgress = (round: Round, at: number = round.now): number | undefined => {
  const p = (at - round.duckedAt) / DUCK_MS;
  return p >= 0 && p <= 1 ? p : undefined;
};

/** Whether the player's head is down out of the way at a moment: well into a duck. */
export const isDucking = (round: Round, at: number): boolean => {
  const p = duckProgress(round, at);
  return p !== undefined && p >= DUCK_CLEARANCE && p <= 1 - DUCK_CLEARANCE;
};

/** Whether the player can duck: at the Colosseum, where the tap does, or where the rules say. */
export const canDuck = (rules: Rules): boolean => hasSpears(rules) || rules.ducks === true;

/**
 * Ducks, where the player can, unless they're down, in the air, or still coming up from the last
 * duck. It doesn't tire them.
 */
export const duck = (round: Round): Round =>
  canDuck(round.rules) &&
  round.downAt === undefined &&
  jumpProgress(round) === undefined &&
  round.now - round.duckedAt >= DUCK_MS + DUCK_RECOVERY_MS
    ? { ...round, duckedAt: round.now }
    : round;

/**
 * Jumps, unless the player is down, ducking, already in the air, has only just landed, or is
 * tired. At the Colosseum the same tap ducks instead.
 */
export const jump = (round: Round): Round => {
  if (hasSpears(round.rules)) return duck(round);
  return isReady(round) && duckProgress(round) === undefined && round.fitness >= 1
    ? { ...round, jumpedAt: round.now, fitness: round.fitness - 1 }
    : round;
};

/**
 * The kinds in a wave, one per lane it uses. A wave is one or two things arriving together, and
 * never two footballs, because only one can be headed. Later waves are more often pairs, and more
 * often decoys.
 */
export const waveKinds = (
  d: number,
  wavesWithoutFootball: number,
  random: Random,
  decoys: readonly [Decoy, ...Decoy[]] = CLASSIC_DECOYS,
): ItemKind[] => {
  const football = (): ItemKind => (random() < GOLDEN_CHANCE ? "golden" : "ball");
  const decoy = (): Decoy => pick(decoys, random);
  const mustHaveFootball = wavesWithoutFootball >= 2;

  if (random() < lerp(0.15, 0.5, d)) {
    const first = mustHaveFootball || random() < 0.7 ? football() : decoy();
    return [first, decoy()];
  }
  return [mustHaveFootball || random() >= lerp(0.3, 0.45, d) ? football() : decoy()];
};

/**
 * The lanes that stay clear for the player around a moment: those not covered by any hurdle they
 * could step round arriving within ROOM_MS of it. A hurdle across every lane leaves them all, since
 * the player jumps it and can head or dodge in any lane while in the air.
 */
const clearLanesAt = (round: Round, arrival: number): readonly Lane[] => {
  const hurdles = [
    ...round.items
      .filter((i) => i.kind === "hurdle")
      .map((h) => ({ arrival: arrivalOf(h), lanes: h.lanes ?? LANES })),
    {
      arrival: hurdleArrivalAt(round.rules, round.nextHurdleAt),
      lanes: round.nextHurdleLanes,
    },
  ];
  const near = hurdles.filter(
    (h) => Math.abs(h.arrival - arrival) <= ROOM_MS && h.lanes.length < LANES.length,
  );
  return LANES.filter((lane) => near.every((h) => !h.lanes.includes(lane)));
};

/**
 * Whether a wave's lanes leave the player a way round any hurdle arriving with it: anything they
 * can head only in a clear lane, and at least one clear lane with nothing in it they mustn't head.
 * `headable` says which of the wave can be headed: a football, unless aliens have zapped it.
 */
const leavesRoom = (headable: readonly boolean[], lanes: readonly Lane[], clear: readonly Lane[]) =>
  headable.every((ok, i) => !ok || clear.includes(lanes[i] ?? 0)) &&
  clear.some((lane) => !headable.some((ok, i) => !ok && lanes[i] === lane));

/** What a lava bomb is: a lump of the volcano's own rock (see twists/twist.ts). */
export const BOMB: Decoy = "lavaRock";
/** What haunts the castle: a see-through football that isn't one, so heading it is a knock. */
export const GHOST: Decoy = "ghostBall";

/**
 * Which ball in a wave the aliens zap, if any. Never a golden one, and never one the wave needs to
 * keep the rule that three waves in a row always have a ball to head: a zapped ball doesn't count.
 */
const zapIn = (
  kinds: readonly ItemKind[],
  wavesWithoutFootball: number,
  strength: number,
  random: Random,
): number | undefined => {
  const ball = kinds.indexOf("ball");
  return ball >= 0 && wavesWithoutFootball < 2 && random() < TUNING.zap.chance(strength)
    ? ball
    : undefined;
};

/**
 * Which ball in a wave arriving at `arrival` bounces off a trampoline, if any. Never a golden one,
 * and only when a perfect player, who's headed every high ball so far, would have the legs for it
 * (see legsFor), with a little to spare, and taking it wouldn't leave them without a jump for any
 * hurdle across every lane that's already settled. Hurdles settled after it make no such allowance.
 */
const bounceIn = (
  kinds: readonly ItemKind[],
  leaps: readonly number[],
  arrival: number,
  strength: number,
  random: Random,
): number | undefined => {
  const ball = kinds.indexOf("ball");
  if (ball < 0 || random() >= TUNING.bounce.chance(strength)) return undefined;
  return canLeap(leaps, arrival, HIGH_RESERVE) ? ball : undefined;
};

/**
 * Which ball in a wave arriving at `arrival`, at difficulty `d`, is skied, if any. Never a golden
 * one, and like a bounce, only when a perfect player who's headed every high ball so far would
 * have the legs for it, with a little to spare, without going short for a hurdle already settled.
 */
const skyIn = (
  kinds: readonly ItemKind[],
  leaps: readonly number[],
  arrival: number,
  d: number,
  random: Random,
): number | undefined => {
  const ball = kinds.indexOf("ball");
  if (ball < 0 || random() >= skiedChanceAt(d)) return undefined;
  return canLeap(leaps, arrival, HIGH_RESERVE) ? ball : undefined;
};

/**
 * What the venue's twist does to each of a wave once its lanes are settled. A drift or a warp
 * only changes the lane things set off down, never the lane they arrive in, so the room the lanes
 * have made round any hurdle still holds. Things in a wave never set off down the same lane.
 */
const twistWave = (
  rule: TwistRule,
  kinds: readonly ItemKind[],
  lanes: readonly Lane[],
  marked: number | undefined,
  strength: number,
  random: Random,
): readonly (ItemTwist | undefined)[] => {
  const used = lanes.slice(0, kinds.length);
  switch (rule.kind) {
    case "zap":
      return kinds.map((_, i) =>
        i === marked ? { kind: "zap", at: TUNING.zap.at(strength) } : undefined,
      );
    case "bombs":
      return kinds.map((_, i) => (i === marked ? { kind: "bomb" } : undefined));
    case "bounce":
      return kinds.map((_, i) => (i === marked ? { kind: "bounce" } : undefined));
    case "breeze": {
      if (random() >= TUNING.breeze.chance(strength)) return [];
      // The whole wave blows the same way, one lane, if it can without leaving the pitch.
      const way = random() < 0.5 ? -1 : 1;
      const from = [way, -way]
        .map((w) => used.map((lane) => lane - w))
        .find((start) => start.every((lane) => lane >= -1 && lane <= 1));
      const at = TUNING.breeze.at(strength);
      return from ? from.map((lane) => ({ kind: "drift", from: lane as Lane, at })) : [];
    }
    case "gale": {
      if (random() >= TUNING.gale.chance(strength)) return [];
      // As the breeze, but a strong gust blows a lone thing in an edge lane right across the
      // pitch, two lanes, when it's drawn to. Anything else it blows one lane.
      const way = random() < 0.5 ? -1 : 1;
      const far = random() < TUNING.gale.far(strength) ? 2 : 1;
      const from = [far * way, -far * way, way, -way]
        .map((w) => used.map((lane) => lane - w))
        .find((start) => start.every((lane) => lane >= -1 && lane <= 1));
      const at = TUNING.gale.at(strength);
      return from ? from.map((lane) => ({ kind: "drift", from: lane as Lane, at })) : [];
    }
    case "warp": {
      if (random() >= TUNING.warp.chance(strength)) return [];
      const which = Math.floor(random() * kinds.length);
      const free = LANES.filter((lane) => !used.includes(lane));
      const from = free[Math.floor(random() * free.length)];
      const at = TUNING.warp.at(strength);
      return from === undefined
        ? []
        : kinds.map((_, i) => (i === which ? { kind: "warp", from, at } : undefined));
    }
    case "snow":
      return kinds.map(() =>
        random() < TUNING.snow.chance(strength)
          ? { kind: "snowed", until: TUNING.snow.until(strength) }
          : undefined,
      );
    // The currents, the dust, the smoke and the lean only change what's seen, as does the gloom
    // in the castle, whose ghost balls are thrown as they are: see twists/schedule.ts.
    case "sway":
    case "dust":
    case "flare":
    case "haunt":
    case "lean":
      return [];
    // The Colosseum's colours are settled in launchWave, against the verdict when the wave lands.
    case "verdict":
      return [];
  }
};

/**
 * The colours for a wave landing at `arrival`, at the Colosseum: given whether a ball's to be the
 * one to head, the colour that makes it so under the emperor's verdict then. Undefined just after
 * he's turned his thumb over, when there wouldn't be time to see it: the wave's balls come plain.
 */
const colourWave = (
  rule: TwistRule,
  roundMs: number,
  arrival: number,
): ((right: boolean) => BallColour) | undefined => {
  const { thumb, since } = verdictAt(rule, roundMs, arrival);
  if (since < VERDICT_REACT_MS && arrival >= VERDICT_REACT_MS) return undefined;
  const wanted = WANTED[thumb];
  return (right) => (right ? wanted : wanted === "green" ? "red" : "green");
};

/**
 * Which ball in a wave comes in the wrong colour, at the Colosseum, to be let go: sometimes the
 * wave's only ball, and more often one beside a ball in the right colour. Never one the wave needs
 * to keep the rule that three waves in a row always have a ball to head, and never a golden one.
 */
const wrongIn = (
  kinds: ItemKind[],
  wavesWithoutFootball: number,
  strength: number,
  random: Random,
): number | undefined => {
  const ball = kinds.indexOf("ball");
  if (ball < 0) return undefined;
  if (wavesWithoutFootball < 2 && kinds.length === 1 && random() < TUNING.verdict.wrong(strength)) {
    return ball;
  }
  if (kinds.length < LANES.length && random() < TUNING.verdict.pair(strength)) {
    return kinds.push("ball") - 1;
  }
  return undefined;
};

/** When the skimmed frisbees on their way arrive, and the next hurdle, if it's to be one. */
const skimArrivals = (round: Round): number[] => [
  ...round.items.filter(isSkimmed).map(arrivalOf),
  ...(round.nextHurdleSkimmed ? [hurdleArrivalAt(round.rules, round.nextHurdleAt)] : []),
];

const launchWave = (round: Round, at: number, random: Random): Round => {
  const d = difficultyAt(round.rules, at);
  const flightMs = flightMsAt(d);
  const arrival = at + flightMs;
  // Nothing comes while a frisbee's skimming over, so the player can duck it without letting a ball
  // go over their head: the wave waits until it would land clear of it, and draws nothing till then.
  const skim = skimArrivals(round).find((a) => Math.abs(a - arrival) < SKIM_ROOM_MS);
  if (skim !== undefined) {
    return { ...round, nextLaunchAt: at + skim + SKIM_ROOM_MS - arrival + 1 };
  }
  const kinds = waveKinds(d, round.wavesWithoutFootball, random, round.decoys);
  const rule = round.rules.twist;
  const strength = rule ? strengthAt(rule, round.rules.roundMs, at) : 0;
  // The base game skies a ball before the venue's twist has its say, and the twist then leaves its
  // whole wave be. It's never zapped, snowed on, blown across or warped, and never comes with a
  // lava bomb or a ghost ball beside it, so it comes straight down its lane where it was shown to
  // be landing, plainly the real ball. Where balls aren't skied, nothing's drawn for it, so those
  // rounds play as they always have.
  // Nor is a ball skied near a skimmed frisbee, since there'd be no time to jump for one and duck
  // the other.
  const skied =
    skies(round.rules) &&
    skimArrivals(round).every((a) => Math.abs(a - arrival) >= JUMP_MS + DUCK_MS)
      ? skyIn(kinds, round.leaps, arrival, d, random)
      : undefined;
  // A zap, a lava bomb, a bounce or a ghost ball is settled before the lanes, which have to make
  // room for it.
  let marked: number | undefined;
  if (rule?.kind === "zap" && skied === undefined) {
    marked = zapIn(kinds, round.wavesWithoutFootball, strength, random);
  }
  if (rule?.kind === "bombs" && kinds.some(isFootball) && skied === undefined) {
    if (random() < TUNING.bombs.chance(strength)) marked = kinds.push(BOMB) - 1;
  }
  if (rule?.kind === "bounce") marked = bounceIn(kinds, round.leaps, arrival, strength, random);
  if (rule?.kind === "haunt" && kinds.some(isFootball) && skied === undefined) {
    if (random() < TUNING.ghosts.chance(strength)) kinds.push(GHOST);
  }
  // At the Colosseum, `marked` is the ball in the wrong colour, if there is one.
  const verdict =
    rule?.kind === "verdict" ? colourWave(rule, round.rules.roundMs, arrival) : undefined;
  if (verdict) marked = wrongIn(kinds, round.wavesWithoutFootball, strength, random);
  const headable = kinds.map(
    (kind, i) =>
      isFootball(kind) && !(rule?.kind === "zap" && i === marked) && !(verdict && i === marked),
  );
  // Lanes in a random order, turned round until they leave room around any hurdle. One of the
  // three turns always does, for a wave of one or two, or of three with a ball to head in it.
  const order = shuffle(LANES, random);
  const turns = order.map((_, n) => [...order.slice(n), ...order.slice(0, n)]);
  const clear = clearLanesAt(round, arrival);
  const lanes = turns.find((turn) => leavesRoom(headable, turn, clear)) ?? order;
  const twists = verdict
    ? kinds.map((kind, i): ItemTwist | undefined =>
        kind === "ball"
          ? { kind: "colour", colour: verdict(i !== marked), right: i !== marked }
          : undefined,
      )
    : rule && skied === undefined
      ? twistWave(rule, kinds, lanes, marked, strength, random)
      : [];
  const items = kinds.map((kind, i): Item => {
    const twist = twists[i];
    return {
      id: round.nextId + i,
      kind,
      lane: lanes[i] ?? 0,
      launchedAt: at,
      flightMs,
      ...(twist ? { twist } : {}),
      ...(i === skied ? { skied: true } : {}),
    };
  });
  const gap = waveGapMsAt(d) * lerp(0.85, 1.15, random());
  return {
    ...round,
    items: [...round.items, ...items],
    nextId: round.nextId + items.length,
    nextLaunchAt: at + gap,
    wavesWithoutFootball: headable.some(Boolean) ? 0 : round.wavesWithoutFootball + 1,
    leaps:
      skied !== undefined || (rule?.kind === "bounce" && marked !== undefined)
        ? withLeap(round.leaps, arrival)
        : round.leaps,
  };
};

/** One, two or all three lanes, for a hurdle to cover. */
const someLanes = (random: Random): readonly Lane[] => {
  const count = 1 + Math.floor(random() * LANES.length);
  return shuffle(LANES, random)
    .slice(0, count)
    .sort((a, b) => a - b);
};

/**
 * Settles the hurdle after one launched at `at` that covers `lanes`: when it comes, which lanes it
 * covers, whether it's a frisbee skimmed at head height, and the jump booked for it if it's along
 * the ground across every lane. A hurdle across every lane is only sent when a player who's saved
 * their jumps would have one ready; otherwise it leaves a lane free. Where balls are skied, it also
 * waits until a perfect player who's headed every one of them would have a jump ready, so skied
 * balls never cost them a hurdle and heading every ball can always be done. The Funfair's
 * trampolines get no such allowance: there, spending a jump is a risk. A frisbee needs no jump, so
 * it's sent whenever it comes up, and never follows up a hurdle.
 */
const nextHurdle = (
  round: Round,
  at: number,
  lanes: readonly Lane[],
  random: Random,
): Pick<Round, "nextHurdleAt" | "nextHurdleLanes" | "nextHurdleSkimmed" | "spare" | "leaps"> => {
  const { rules } = round;
  const d = difficultyAt(rules, at);
  // A spear or a staff comes from one side, so it never covers every lane: no follow-up across
  // every lane, and no jump to book. A spear's sometimes long enough for the middle lane too.
  if (fromTheSide(rules)) {
    const from: Lane = random() < 0.5 ? -1 : 1;
    const long = hasSpears(rules) && random() < 0.5;
    return {
      nextHurdleAt: at + hurdleGapMsAt(d) * lerp(0.8, 1.25, random()),
      nextHurdleLanes: long ? ([from, 0] as const).slice().sort((a, b) => a - b) : [from],
      nextHurdleSkimmed: false,
      spare: round.spare,
      leaps: round.leaps,
    };
  }
  /** The jump booked for a hurdle across every lane launched at `launch`, if there's one ready. */
  const book = (launch: number) => {
    const arrival = hurdleArrivalAt(rules, launch);
    const spare = bookJump(round.spare, arrival);
    if (skies(rules) && !canLeap(round.leaps, arrival, 0)) return undefined;
    return spare && { spare, leaps: withLeap(round.leaps, arrival) };
  };
  if (lanes.length < LANES.length && random() < followUpChanceAt(d)) {
    const booked = book(at + FOLLOW_UP_MS);
    if (booked) {
      return {
        nextHurdleAt: at + FOLLOW_UP_MS,
        nextHurdleLanes: LANES,
        nextHurdleSkimmed: false,
        ...booked,
      };
    }
  }
  const nextAt = at + hurdleGapMsAt(d) * lerp(0.8, 1.25, random());
  const unbooked = { nextHurdleSkimmed: false, spare: round.spare, leaps: round.leaps };
  // Where there are frisbees, they're only drawn for, so every other round plays as it always has.
  if (skims(rules) && random() < SKIM_CHANCE) {
    return { nextHurdleAt: nextAt, nextHurdleLanes: LANES, ...unbooked, nextHurdleSkimmed: true };
  }
  const nextLanes = someLanes(random);
  if (nextLanes.length < LANES.length) {
    return { nextHurdleAt: nextAt, nextHurdleLanes: nextLanes, ...unbooked };
  }
  const booked = book(nextAt);
  return booked
    ? { nextHurdleAt: nextAt, nextHurdleLanes: nextLanes, nextHurdleSkimmed: false, ...booked }
    : { nextHurdleAt: nextAt, nextHurdleLanes: nextLanes.slice(0, 2), ...unbooked };
};

/** Launches the next hurdle, and settles the one after. */
const launchHurdle = (round: Round, at: number, random: Random): Round => {
  const lanes = round.nextHurdleLanes;
  return {
    ...round,
    items: [
      ...round.items,
      {
        id: round.nextId,
        kind: "hurdle",
        lane: 0,
        lanes,
        launchedAt: at,
        flightMs: hurdleFlightMsAt(difficultyAt(round.rules, at)),
        ...(round.nextHurdleSkimmed ? { skimmed: true } : {}),
      },
    ],
    nextId: round.nextId + 1,
    ...nextHurdle(round, at, lanes, random),
  };
};

/** A knock from a decoy or a hurdle costs the streak and a life. Losing the last puts them down. */
const knock = (round: Round, item: Item): Round => {
  const knocked = { ...round, streak: 0, lives: round.lives - 1 };
  return knocked.lives > 0 ? knocked : { ...knocked, downAt: arrivalOf(item) };
};

/**
 * A hurdle that isn't in the player's lane goes past them. One that is, they clear if they're well
 * up in a jump at the moment it reaches them, and otherwise trip over.
 */
const resolveHurdle = (round: Round, item: Item): { round: Round; event: RoundEvent } => {
  if (!(item.lanes ?? LANES).includes(round.lane))
    return { round, event: { type: "dodged", item } };
  const p = jumpProgress(round, arrivalOf(item));
  // A spear or a skimmed frisbee goes over a head that's ducked; jumping's no help against either.
  const clear =
    hasSpears(round.rules) || isSkimmed(item)
      ? isDucking(round, arrivalOf(item))
      : p !== undefined && p >= CLEARANCE && p <= 1 - CLEARANCE;
  if (clear) {
    return {
      round: { ...round, score: round.score + POINTS.hurdle },
      event: { type: "cleared", item, points: POINTS.hurdle },
    };
  }
  const knocked = knock(round, item);
  return {
    round: knocked,
    event: { type: "tripped", item, lostStreak: round.streak, lives: knocked.lives },
  };
};

/**
 * Whether something can be headed: a football, unless aliens have zapped it, or it's in the
 * colour the emperor doesn't want.
 */
export const isHeadable = (item: Item): boolean =>
  isFootball(item.kind) &&
  item.twist?.kind !== "zap" &&
  !(item.twist?.kind === "colour" && !item.twist.right);

/** Whether a ball's been skied by the base game (see skies). */
export const isSkied = (item: Item): boolean => item.skied === true;

/** Whether a hurdle is a frisbee skimmed at head height, to be ducked (see skims). */
export const isSkimmed = (item: Item): boolean => item.skimmed === true;

/**
 * Whether a ball's high, so it can only be headed near the top of a jump: skied off the throw, or
 * bounced off a trampoline at the Funfair. Both play the same.
 */
export const isHigh = (item: Item): boolean => isSkied(item) || item.twist?.kind === "bounce";

/**
 * Whether a perfect player jumps for something: a hurdle along the ground across every lane, or a
 * high ball.
 */
export const isLeap = (item: Item): boolean =>
  isHigh(item) ||
  (item.kind === "hurdle" && !isSkimmed(item) && (item.lanes ?? LANES).length === LANES.length);

/** Whether the player's up near the top of a jump at a moment, as heading a high ball needs. */
export const isUpHigh = (round: Round, at: number): boolean => {
  const p = jumpProgress(round, at);
  return p !== undefined && p >= HIGH_REACH[0] && p <= HIGH_REACH[1];
};

/**
 * Whether the player can still meet a high ball arriving at `at` near the top of a jump: they're
 * already on their way up to it, or they'll be on their feet with a jump in their legs in time to
 * take off for it. It doesn't change what happens: the scene dims a high ball's marker when not.
 */
export const canReach = (round: Round, at: number): boolean => {
  if (isUpHigh(round, at)) return true;
  const ready = round.jumpedAt + JUMP_MS + LANDING_MS;
  const from = Math.max(round.now, ready, at - JUMP_MS * HIGH_REACH[1]);
  return (
    round.downAt === undefined &&
    !hasSpears(round.rules) &&
    from <= at - JUMP_MS * HIGH_REACH[0] &&
    recovered(round.fitness, from - round.now) >= 1
  );
};

/**
 * Decides what happens to an item reaching the player, given where their head is pointing. A
 * zapped ball explodes as it arrives, so it plays like a decoy: heading it is a knock, and letting
 * it go costs nothing, not even the streak. It isn't counted among the footballs that arrived. A
 * high ball has to be met near the top of a jump: on the ground, the player's under it and it goes
 * over their head, which costs the streak like any ball that gets past, but no life.
 */
const resolve = (round: Round, item: Item): { round: Round; event: RoundEvent } => {
  if (item.kind === "hurdle") return resolveHurdle(round, item);
  // A ducked head is under whatever comes down its lane: nothing's headed, and nothing hits it.
  const onTarget = item.lane === round.lane && !isDucking(round, arrivalOf(item));

  if (!isHeadable(item)) {
    if (!onTarget) return { round, event: { type: "dodged", item } };
    // Heading the ball the emperor didn't want costs the streak, but not a life.
    if (item.twist?.kind === "colour") {
      return {
        round: { ...round, streak: 0 },
        event: { type: "hit", item, lostStreak: round.streak, lives: round.lives },
      };
    }
    const knocked = knock(round, item);
    return {
      round: knocked,
      event: { type: "hit", item, lostStreak: round.streak, lives: knocked.lives },
    };
  }

  const footballs = round.footballs + 1;
  if (onTarget && (!isHigh(item) || isUpHigh(round, arrivalOf(item)))) {
    const streak = round.streak + 1;
    const base = item.kind === "golden" ? POINTS.golden : isHigh(item) ? POINTS.high : POINTS.ball;
    const points = base * streak;
    return {
      round: {
        ...round,
        footballs,
        streak,
        bestStreak: Math.max(round.bestStreak, streak),
        headers: round.headers + 1,
        score: round.score + points,
      },
      event: { type: "header", item, points, streak },
    };
  }
  // A golden ball is a bonus, so letting it go doesn't cost the streak.
  const lostStreak = item.kind === "golden" ? 0 : round.streak;
  return {
    round: { ...round, footballs, streak: round.streak - lostStreak },
    event: { type: "missed", item, lostStreak },
  };
};

/**
 * Moves the round on by `dtMs`: launches the waves and hurdles that are due, settles everything that reaches
 * the player, and drops things that have finished flying off. Returns what happened, in order.
 */
export const step = (
  start: Round,
  dtMs: number,
  random: Random,
): { round: Round; events: RoundEvent[] } => {
  // Never backwards: a browser's first frame can be stamped from before the round began.
  const now = Math.min(start.now + Math.max(dtMs, 0), endOf(start));
  let round: Round = { ...start, now, fitness: recovered(start.fitness, now - start.now) };

  // Whatever's due is launched in the order it was due, waves and hurdles together, so they draw
  // from `random` in the same order however many frames a second there are, and a seed plays the
  // same run on any screen. Nothing is launched that would land after full time, or once the
  // player is down.
  const { rules } = round;
  for (;;) {
    if (round.downAt !== undefined) break;
    const wave = round.nextLaunchAt;
    const hurdle = round.nextHurdleAt;
    const waveDue =
      wave <= now && wave + flightMsAt(difficultyAt(rules, wave)) < rules.roundMs ? wave : Infinity;
    const hurdleDue =
      hurdle <= now && hurdleArrivalAt(rules, hurdle) < rules.roundMs ? hurdle : Infinity;
    if (waveDue === Infinity && hurdleDue === Infinity) break;
    round =
      waveDue <= hurdleDue
        ? launchWave(round, waveDue, random)
        : launchHurdle(round, hurdleDue, random);
  }

  const events: RoundEvent[] = [];
  const arriving = round.items
    .filter((item) => !item.outcome && arrivalOf(item) <= now)
    .sort((a, b) => arrivalOf(a) - arrivalOf(b));
  for (const item of arriving) {
    // Once the player is down, anything still coming goes over them.
    if (round.downAt !== undefined) break;
    const resolved = resolve(round, item);
    round = resolved.round;
    events.push(resolved.event);
    round = {
      ...round,
      items: round.items.map((i) =>
        i.id === item.id ? { ...i, outcome: resolved.event.type } : i,
      ),
    };
  }

  round = { ...round, items: round.items.filter((i) => now - arrivalOf(i) < LINGER_MS) };
  return { round, events };
};

export interface Summary {
  readonly score: number;
  readonly bestStreak: number;
  readonly headers: number;
  /** The footballs that reached the player, headed or not. A zapped ball isn't one. */
  readonly footballs: number;
  /** Footballs headed out of those that reached the player, from 0 to 1. */
  readonly accuracy: number;
  /** Whether the round ended with the player losing their last life, rather than at full time. */
  readonly outOfLives: boolean;
}

export const summarise = (round: Round): Summary => ({
  score: round.score,
  bestStreak: round.bestStreak,
  headers: round.headers,
  footballs: round.footballs,
  accuracy: round.footballs ? round.headers / round.footballs : 0,
  outOfLives: round.downAt !== undefined,
});

/**
 * A repeatable random source (mulberry32): the same seed gives the same numbers, so it gives the
 * same run, which is what a level is.
 */
export const seededRandom = (seed: number): Random => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** How often a perfect run is stepped through: as a phone would, at 60 frames a second. */
const PERFECT_STEP_MS = 1000 / 60;

/**
 * Where a player who never puts a foot wrong points their head for whatever reaches them before
 * `until`: at a ball to head if there is one, and otherwise anywhere nothing will hit them, staying
 * put if they can. A hurdle across every lane they jump, or duck if it's a frisbee, so it doesn't
 * matter where they are.
 */
const perfectLane = (round: Round, until: number): Lane => {
  const arriving = round.items.filter((i) => !i.outcome && arrivalOf(i) <= until);
  const ball = arriving.find(isHeadable);
  if (ball) return ball.lane;
  const blocked = (lane: Lane) =>
    arriving.some((i) => {
      if (i.kind !== "hurdle") return i.lane === lane;
      const lanes = i.lanes ?? LANES;
      return lanes.length < LANES.length && lanes.includes(lane);
    });
  return [round.lane, ...LANES].find((lane) => !blocked(lane)) ?? round.lane;
};

/**
 * Plays a seeded run perfectly: every ball headed, every hurdle across every lane jumped at the
 * top of the jump, every high ball headed at the top of one, every skimmed frisbee ducked at the
 * bottom of a duck, and nothing else touched. The engine
 * promises this can always be done, so it never loses a life, with one exception: at the Funfair,
 * heading every ball off a trampoline can leave a player without a jump for a hurdle settled after
 * them, so a Funfair level's seed is one where it doesn't (see levels.test.ts). Skied balls never
 * do (see nextHurdle). Returns the round at full time.
 */
export const playPerfectly = (
  rules: Rules,
  decoys: readonly [Decoy, ...Decoy[]],
  seed: number,
): Round => {
  const random = seededRandom(seed);
  let round = newRound(decoys, rules);
  while (!isOver(round)) {
    round = pointHead(round, perfectLane(round, round.now + PERFECT_STEP_MS));
    /** Whether something `wanted` arrives halfway through a move `ms` long started now. */
    const due = (wanted: (item: Item) => boolean, ms: number) =>
      round.items.some((i) => {
        if (i.outcome || !wanted(i)) return false;
        const until = arrivalOf(i) - round.now;
        return until <= ms / 2 && until > ms / 2 - PERFECT_STEP_MS;
      });
    if (due(isLeap, JUMP_MS)) round = jump(round);
    if (due(isSkimmed, DUCK_MS)) round = duck(round);
    round = step(round, PERFECT_STEP_MS, random).round;
  }
  return round;
};

/** A level's par: the score of a perfect run of it, every ball headed (see playPerfectly). */
export const parOf = (rules: Rules, decoys: readonly [Decoy, ...Decoy[]], seed: number): number =>
  playPerfectly(rules, decoys, seed).score;

/** The shout that goes with a header. */
export const praise = (kind: ItemKind, streak: number): string => {
  if (kind === "golden") return "GOLDEN!";
  if (streak >= 10) return "ON FIRE!";
  if (streak >= 6) return "UNREAL!";
  if (streak >= 3) return "GREAT!";
  return "NICE!";
};
