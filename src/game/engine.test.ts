import { describe, expect, it } from "vitest";
import {
  arrivalOf,
  BOMB,
  canDuck,
  canReach,
  CLASSIC_DECOYS,
  decoyPool,
  difficultyAt,
  duck,
  DUCK_MS,
  FALL_MS,
  FITNESS_MAX,
  flightMsAt,
  FREE_PLAY,
  GHOST,
  hasSpears,
  hasSweeps,
  HIGH_REACH,
  isFootball,
  isHeadable,
  isHigh,
  isLeap,
  isOver,
  isSkied,
  isSkimmed,
  isTired,
  type Item,
  type ItemKind,
  jump,
  JUMP_BACK_MS,
  JUMP_MS,
  jumpProgress,
  LANDING_MS,
  type Lane,
  LANES,
  LIVES,
  newRound,
  parOf,
  playPerfectly,
  pointHead,
  praise,
  type Random,
  ROOM_MS,
  type Round,
  ROUND_MS,
  type Rules,
  seededRandom,
  skies,
  skims,
  step,
  summarise,
  sweptFrom,
  waveKinds,
} from "./engine";
import {
  DRIFT_SPAN,
  driftSpanOf,
  TUNING,
  TWIST_KINDS,
  type TwistKind,
  type TwistRule,
  VERDICT_REACT_MS,
  verdictAt,
  WANTED,
} from "./twists/twist";

/** A repeatable random source, so the spawning tests cover lots of waves the same way each run. */
const seeded = (seed: number): Random => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
};

/** A round with one item on its way, and nothing else due to launch. */
const withItem = (kind: ItemKind, lane: Lane, overrides: Partial<Round> = {}): Round => ({
  ...newRound(),
  nextLaunchAt: ROUND_MS,
  items: [{ id: 1, kind, lane, launchedAt: 0, flightMs: 1000 }],
  ...overrides,
});

const arrive = (round: Round) => step(round, 1000, seeded(1));

describe("heading the ball", () => {
  it("scores ten times the streak for a football headed in its lane", () => {
    const { round, events } = arrive(withItem("ball", 0, { streak: 3, score: 60 }));
    expect(events).toEqual([expect.objectContaining({ type: "header", points: 40, streak: 4 })]);
    expect(round).toMatchObject({ score: 100, streak: 4, headers: 1, footballs: 1 });
  });

  it("scores thirty times the streak for a golden ball", () => {
    const { round } = arrive(withItem("golden", 1, { lane: 1, streak: 5 }));
    expect(round).toMatchObject({ score: 180, streak: 6 });
  });

  it("keeps the best streak after the streak is lost", () => {
    let round = arrive(withItem("ball", 0, { streak: 6, bestStreak: 6 })).round;
    expect(round.bestStreak).toBe(7);
    round = arrive({
      ...withItem("panda", 0),
      streak: round.streak,
      bestStreak: round.bestStreak,
    }).round;
    expect(round).toMatchObject({ streak: 0, bestStreak: 7 });
  });

  it("uses the lane the head points at when the item arrives, not when it was launched", () => {
    const halfway = step(withItem("ball", 1), 500, seeded(1)).round;
    const { events } = step(pointHead(halfway, 1), 500, seeded(1));
    expect(events[0]?.type).toBe("header");
  });
});

describe("missing and dodging", () => {
  it("loses the streak when a decoy hits the player", () => {
    const { round, events } = arrive(withItem("stopwatch", -1, { lane: -1, streak: 4 }));
    expect(events).toEqual([expect.objectContaining({ type: "hit", lostStreak: 4 })]);
    expect(round.streak).toBe(0);
  });

  it("keeps the streak when a decoy is dodged", () => {
    const { round, events } = arrive(withItem("hat", -1, { lane: 1, streak: 4 }));
    expect(events[0]?.type).toBe("dodged");
    expect(round.streak).toBe(4);
  });

  it("loses the streak when a football gets past", () => {
    const { round, events } = arrive(withItem("ball", -1, { streak: 4 }));
    expect(events).toEqual([expect.objectContaining({ type: "missed", lostStreak: 4 })]);
    expect(round).toMatchObject({ streak: 0, footballs: 1, headers: 0 });
  });

  it("keeps the streak when a golden ball gets past, since it's a bonus", () => {
    const { round } = arrive(withItem("golden", -1, { streak: 4 }));
    expect(round).toMatchObject({ streak: 4, footballs: 1 });
  });

  it("marks what happened on the item, and drops it once it has flown off", () => {
    const arrived = arrive(withItem("boot", 0)).round;
    expect(arrived.items[0]?.outcome).toBe("hit");
    expect(step(arrived, 1500, seeded(1)).round.items).toEqual([]);
  });
});

describe("lives", () => {
  it("starts with three", () => {
    expect(newRound().lives).toBe(LIVES);
    expect(LIVES).toBe(3);
  });

  it("loses one when a decoy hits the player", () => {
    const { round, events } = arrive(withItem("hat", 0));
    expect(events).toEqual([expect.objectContaining({ type: "hit", lives: 2 })]);
    expect(round.lives).toBe(2);
  });

  it("loses one on a trip over a hurdle", () => {
    const { round, events } = arrive({
      ...withItem("hurdle", 0),
      nextHurdleAt: ROUND_MS,
      lives: 2,
    });
    expect(events).toEqual([expect.objectContaining({ type: "tripped", lives: 1 })]);
    expect(round.lives).toBe(1);
  });

  it("keeps them for a dodged decoy or a missed football", () => {
    expect(arrive(withItem("boot", -1)).round.lives).toBe(LIVES);
    expect(arrive(withItem("ball", -1)).round.lives).toBe(LIVES);
  });

  it("puts the player down when the last one goes, and ends the round once they've fallen", () => {
    const { round, events } = arrive(withItem("panda", 0, { lives: 1 }));
    expect(events).toEqual([expect.objectContaining({ type: "hit", lives: 0 })]);
    expect(round).toMatchObject({ lives: 0, downAt: 1000 });
    expect(isOver(round)).toBe(false);

    const fallen = step(round, FALL_MS, seeded(1)).round;
    expect(fallen.now).toBe(1000 + FALL_MS);
    expect(isOver(fallen)).toBe(true);
    expect(summarise(fallen).outOfLives).toBe(true);
  });

  it("lets the player finish falling even if they go down just before full time", () => {
    const down = { ...newRound(), now: ROUND_MS - 100, lives: 0, downAt: ROUND_MS - 100 };
    const { round } = step(down, 1000, seeded(1));
    expect(round.now).toBe(ROUND_MS + 900);
    expect(isOver(round)).toBe(false);
  });

  it("launches and settles nothing once the player is down", () => {
    const down: Round = {
      ...newRound(),
      now: 5000,
      lives: 0,
      downAt: 5000,
      nextLaunchAt: 5100,
      nextHurdleAt: 5100,
      items: [{ id: 1, kind: "ball", lane: 0, launchedAt: 4000, flightMs: 1200 }],
    };
    const { round, events } = step(down, 500, seeded(1));
    expect(events).toEqual([]);
    expect(round.items.map((i) => i.id)).toEqual([1]);
    expect(round.items[0]?.outcome).toBeUndefined();
    expect(round).toMatchObject({ score: 0, headers: 0 });
  });

  it("doesn't let the player jump once down", () => {
    const down = { ...newRound(), now: 5000, lives: 0, downAt: 4000 };
    expect(jump(down).jumpedAt).toBe(-Infinity);
  });
});

// Plays whole rounds without heading or jumping anything, and collects everything launched. The
// player never runs out of lives, so every round lasts to full time. Free play, unless `rules`
// say otherwise, at a frame every 16 ms, unless `frameMs` does.
const launched = (
  seed: number,
  decoys = decoyPool(),
  rules: Rules = FREE_PLAY,
  frameMs: () => number = () => 16,
): Item[] => {
  const random = seeded(seed);
  const seen = new Map<number, Item>();
  let round: Round = { ...newRound(decoys, rules), lives: Infinity };
  while (!isOver(round)) {
    round = step(round, frameMs(), random).round;
    for (const item of round.items) seen.set(item.id, item);
  }
  return [...seen.values()];
};
const played = [1, 2, 3, 4, 5].map((seed) => launched(seed));

/** The waves of things in the air, in order. Hurdles come on their own. */
const wavesIn = (items: Item[]): Item[][] => {
  const waves = new Map<number, Item[]>();
  for (const item of items.filter((i) => i.kind !== "hurdle")) {
    waves.set(item.launchedAt, [...(waves.get(item.launchedAt) ?? []), item]);
  }
  return [...waves.values()];
};

describe("waves", () => {
  const rounds = played.map(wavesIn);
  const waves = rounds.flat();
  const items = waves.flat();

  it("puts each item in a wave in its own lane, with at most one football", () => {
    for (const wave of waves) {
      expect(new Set(wave.map((i) => i.lane)).size).toBe(wave.length);
      expect(wave.filter((i) => isFootball(i.kind)).length).toBeLessThanOrEqual(1);
    }
  });

  it("never goes three waves without a football", () => {
    for (const round of rounds) {
      let without = 0;
      for (const wave of round) {
        without = wave.some((i) => isFootball(i.kind)) ? 0 : without + 1;
        expect(without).toBeLessThan(3);
      }
    }
  });

  it("lands everything before full time", () => {
    expect(Math.max(...items.map(arrivalOf))).toBeLessThan(ROUND_MS);
  });

  it("has decoys, footballs and the odd golden ball", () => {
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds).toContain("ball");
    expect(kinds).toContain("golden");
    expect(kinds).toContain("panda");
    expect(items.length).toBeGreaterThan(5 * 90);
  });

  it("speeds up as the round goes on", () => {
    const at = (now: number) => flightMsAt(difficultyAt(FREE_PLAY, now));
    expect(at(0)).toBeGreaterThan(at(ROUND_MS / 2));
    expect(at(ROUND_MS / 2)).toBeGreaterThan(at(ROUND_MS));
  });

  it("always includes a football after two waves without one", () => {
    // Asks for a lone decoy (a wave of one, then a decoy), which isn't allowed after two decoy waves.
    const loneDecoy = (): Random => {
      const draws = [0.99, 0];
      return () => draws.shift() ?? 0;
    };
    expect(waveKinds(0, 1, loneDecoy()).some(isFootball)).toBe(false);
    expect(waveKinds(0, 2, loneDecoy()).some(isFootball)).toBe(true);
  });
});

describe("a venue's own decoys", () => {
  const isDecoy = (item: Item) => !isFootball(item.kind) && item.kind !== "hurdle";
  const onTheMoon = [1, 2, 3]
    .flatMap((seed) => launched(seed, decoyPool(["helmet"])))
    .filter(isDecoy);
  const count = (kind: ItemKind) => onTheMoon.filter((i) => i.kind === kind).length;

  it("come up more often than any one of the classic decoys", () => {
    for (const classic of CLASSIC_DECOYS)
      expect(count("helmet")).toBeGreaterThan(count(classic) * 2);
  });

  it("join the classic decoys, and nothing else does", () => {
    expect(new Set(onTheMoon.map((i) => i.kind))).toEqual(new Set([...CLASSIC_DECOYS, "helmet"]));
  });

  it("stay at their own venue: anywhere else throws only the classic decoys", () => {
    const kinds = new Set(
      played
        .flat()
        .filter(isDecoy)
        .map((i) => i.kind),
    );
    expect(kinds).toEqual(new Set(CLASSIC_DECOYS));
  });
});

describe("jumping hurdles", () => {
  /** A hurdle across every lane, arriving at one second. */
  const hurdleItem: Item = { id: 1, kind: "hurdle", lane: 0, launchedAt: 0, flightMs: 1000 };
  /** A round with a hurdle on the way, and nothing else. */
  const withHurdle = (overrides: Partial<Round> = {}): Round => ({
    ...newRound(),
    nextLaunchAt: ROUND_MS,
    nextHurdleAt: ROUND_MS,
    items: [hurdleItem],
    ...overrides,
  });

  it("clears a hurdle in mid-jump, scoring 20 and keeping the streak", () => {
    const { round, events } = arrive(withHurdle({ jumpedAt: 1000 - JUMP_MS / 2, streak: 3 }));
    expect(events).toEqual([expect.objectContaining({ type: "cleared", points: 20 })]);
    expect(round).toMatchObject({ score: 20, streak: 3, footballs: 0 });
  });

  it("trips with feet on the ground, losing the streak", () => {
    const { round, events } = arrive(withHurdle({ streak: 5 }));
    expect(events).toEqual([expect.objectContaining({ type: "tripped", lostStreak: 5 })]);
    expect(round.streak).toBe(0);
  });

  it("goes past a player who has stepped out of its lanes, costing nothing", () => {
    const sideLanes = { items: [{ ...hurdleItem, lanes: [-1, 1] as const }], streak: 4 };
    const { round, events } = arrive(withHurdle(sideLanes));
    expect(events).toEqual([expect.objectContaining({ type: "dodged" })]);
    expect(round).toMatchObject({ score: 0, streak: 4, lives: LIVES });
  });

  it("trips a player in its lane, even when it covers only that one", () => {
    const left = withHurdle({ items: [{ ...hurdleItem, lanes: [-1] }] });
    expect(arrive(pointHead(left, -1)).events[0]?.type).toBe("tripped");
    expect(arrive(left).events[0]?.type).toBe("dodged");
  });

  it("covers every lane with the round's first hurdle, then one, two or all three", () => {
    const hurdles = played.flat().filter((i) => i.kind === "hurdle");
    const firsts = hurdles.filter((h) => h.launchedAt === 8000);
    expect(firsts.length).toBe(played.length);
    for (const first of firsts) expect(first.lanes).toEqual([-1, 0, 1]);
    const later = hurdles.filter((h) => h.launchedAt > 8000);
    for (const hurdle of later) {
      const lanes = hurdle.lanes ?? [];
      expect(lanes.length).toBeGreaterThan(0);
      expect(lanes).toEqual([...new Set(lanes)].sort((a, b) => a - b));
    }
    expect(new Set(later.map((h) => h.lanes?.length))).toEqual(new Set([1, 2, 3]));
  });

  it("trips when the jump has barely left the ground, or is landing", () => {
    expect(arrive(withHurdle({ jumpedAt: 1000 - 30 })).events[0]?.type).toBe("tripped");
    expect(arrive(withHurdle({ jumpedAt: 1000 - JUMP_MS + 30 })).events[0]?.type).toBe("tripped");
  });

  it("doesn't jump again while in the air, or until they've got their legs back after landing", () => {
    const up = jump({ ...newRound(), now: 5000 });
    expect(up.jumpedAt).toBe(5000);
    expect(jumpProgress(up)).toBe(0);
    expect(jump({ ...up, now: 5400 }).jumpedAt).toBe(5000);
    const back = 5000 + JUMP_MS + LANDING_MS;
    expect(jump({ ...up, now: back - 50 }).jumpedAt).toBe(5000);
    expect(jump({ ...up, now: back }).jumpedAt).toBe(back);
  });

  it("is on the ground before and after a jump", () => {
    const up = jump({ ...newRound(), now: 5000 });
    expect(jumpProgress(up, 4999)).toBeUndefined();
    expect(jumpProgress(up, 5000 + JUMP_MS / 2)).toBe(0.5);
    expect(jumpProgress(up, 5001 + JUMP_MS)).toBeUndefined();
    expect(jumpProgress(newRound())).toBeUndefined();
  });

  it("sends hurdles from eight seconds in, more often as the round goes on", () => {
    for (const items of played) {
      const hurdles = items.filter((i) => i.kind === "hurdle");
      const starts = hurdles.map((h) => h.launchedAt);
      expect(Math.min(...starts)).toBe(8000);
      expect(Math.max(...hurdles.map(arrivalOf))).toBeLessThan(ROUND_MS);
      expect(hurdles.length).toBeGreaterThanOrEqual(10);
      const gaps = starts.slice(1).map((s, i) => s - (starts[i] ?? 0));
      expect(gaps.at(-1)).toBeLessThan(gaps[0] ?? 0);
    }
  });
});

describe("jumping when there's no need", () => {
  /** An item as it was launched, before anything happened to it. */
  const unplayed = ({ outcome: _, ...item }: Item): Item => item;

  /** Hurdles the rounds sent hard on the heels of another, with the one before each. */
  const pairs = played.flatMap((items) => {
    const hurdles = items.filter((i) => i.kind === "hurdle").map(unplayed);
    return hurdles.flatMap((next, i) => {
      const first = hurdles[i - 1];
      return first && arrivalOf(next) - arrivalOf(first) < 1000 ? [[first, next] as const] : [];
    });
  });

  /** Plays a pair through with the player standing in `lane`, pressing jump at each of `presses`. */
  const playPair = (
    [first, next]: readonly [Item, Item],
    lane: Lane,
    presses: readonly number[],
  ): string[] => {
    let round: Round = {
      ...newRound(),
      now: first.launchedAt,
      lane,
      nextLaunchAt: ROUND_MS,
      nextHurdleAt: ROUND_MS,
      items: [first, next],
    };
    const random = seeded(1);
    const waiting = [...presses].sort((a, b) => a - b);
    const outcomes: string[] = [];
    while (round.now <= arrivalOf(next)) {
      while ((waiting[0] ?? Infinity) <= round.now) {
        waiting.shift();
        round = jump(round);
      }
      const result = step(round, 5, random);
      round = result.round;
      outcomes.push(...result.events.map((e) => e.type));
    }
    return outcomes;
  };

  it("sometimes sends one across every lane hard on the heels of one that can be stepped round", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(3);
    for (const [first, next] of pairs) {
      expect(first.lanes?.length).toBeLessThan(3);
      expect(next.lanes).toEqual([-1, 0, 1]);
    }
  });

  it("lets a player who steps round the first jump the next", () => {
    for (const pair of pairs) {
      const [first, next] = pair;
      const clear = [-1, 0, 1].find((l) => !first.lanes?.includes(l as Lane)) as Lane;
      expect(playPair(pair, clear, [arrivalOf(next) - JUMP_MS / 2])).toEqual(["dodged", "cleared"]);
    }
  });

  it("trips a player who jumps the first instead, however they time it or keep pressing", () => {
    let jumpedFirst = 0;
    for (const pair of pairs) {
      const [first, next] = pair;
      const lane = first.lanes?.[0] ?? 0;
      for (let at = arrivalOf(first) - JUMP_MS; at < arrivalOf(first); at += 25) {
        // A first press at `at`, then presses every 20 ms until the next arrives.
        const presses = [at];
        for (let again = at + 20; again < arrivalOf(next); again += 20) presses.push(again);
        const outcomes = playPair(pair, lane, presses);
        if (outcomes[0] !== "cleared") continue;
        jumpedFirst++;
        expect(outcomes[1]).toBe("tripped");
      }
    }
    expect(jumpedFirst).toBeGreaterThan(pairs.length * 10);
  });
});

describe("making room round hurdles", () => {
  /** Each hurdle that can be stepped round, with the lanes it leaves free and the waves around it. */
  const around = played.flatMap((items) =>
    items
      .filter((h) => h.kind === "hurdle" && (h.lanes?.length ?? 3) < 3)
      .map((hurdle) => ({
        free: LANES.filter((lane) => !hurdle.lanes?.includes(lane)),
        waves: wavesIn(items.filter((i) => Math.abs(arrivalOf(i) - arrivalOf(hurdle)) <= ROOM_MS)),
      })),
  );

  it("brings footballs down only in lanes the hurdle leaves free, so stepping round costs none", () => {
    let footballs = 0;
    for (const { free, waves } of around) {
      for (const item of waves.flat().filter((i) => isFootball(i.kind))) {
        footballs++;
        expect(free).toContain(item.lane);
      }
    }
    expect(footballs).toBeGreaterThan(20);
  });

  it("keeps a lane the hurdle leaves free clear of decoys, so there's always somewhere safe", () => {
    for (const { free, waves } of around) {
      for (const wave of waves) {
        const decoyLanes = wave.filter((i) => !isFootball(i.kind)).map((i) => i.lane);
        expect(free.some((lane) => !decoyLanes.includes(lane))).toBe(true);
      }
    }
  });
});

describe("fitness", () => {
  it("costs a jump to jump, and won't jump with none left in the legs", () => {
    const fresh = { ...newRound(), now: 5000 };
    expect(fresh.fitness).toBe(FITNESS_MAX);
    expect(jump(fresh).fitness).toBe(FITNESS_MAX - 1);
    expect(isTired(fresh)).toBe(false);
    const spent = { ...fresh, fitness: 0.9 };
    expect(isTired(spent)).toBe(true);
    expect(jump(spent)).toBe(spent);
  });

  it("gets jumps back slowly, up to the most the legs hold", () => {
    const quiet = { ...newRound(), nextLaunchAt: ROUND_MS, nextHurdleAt: ROUND_MS, fitness: 0 };
    expect(step(quiet, JUMP_BACK_MS / 2, seeded(1)).round.fitness).toBeCloseTo(0.5);
    expect(step(quiet, JUMP_BACK_MS * 10, seeded(1)).round.fitness).toBe(FITNESS_MAX);
  });

  it("doesn't go back in time, or lose legs, on a frame stamped before the last", () => {
    const { round } = step({ ...newRound(), now: 5000 }, -2000, seeded(1));
    expect(round).toMatchObject({ now: 5000, fitness: FITNESS_MAX });
  });

  /**
   * Plays a whole round as a player who steps out of the way of any hurdle that can be stepped
   * round, and presses jump in good time for each hurdle `jumps` picks. Returns what happened at
   * each hurdle, and how many of the presses found them too tired to jump. Free play, unless
   * `rules` say otherwise.
   */
  const playRound = (seed: number, jumps: (hurdle: Item) => boolean, rules: Rules = FREE_PLAY) => {
    const random = seeded(seed);
    let round: Round = { ...newRound(decoyPool(), rules), lives: Infinity };
    const outcomes: string[] = [];
    let tired = 0;
    while (!isOver(round)) {
      for (const hurdle of round.items.filter((i) => i.kind === "hurdle" && !i.outcome)) {
        const until = arrivalOf(hurdle) - round.now;
        const lanes = hurdle.lanes ?? LANES;
        if (lanes.length < LANES.length && lanes.includes(round.lane) && until < 300) {
          round = pointHead(round, LANES.find((lane) => !lanes.includes(lane)) ?? 0);
        }
        if (jumps(hurdle) && until <= JUMP_MS / 2 && until > JUMP_MS / 2 - 16) {
          if (isTired(round)) tired++;
          round = jump(round);
        }
      }
      const result = step(round, 16, random);
      round = result.round;
      outcomes.push(...result.events.filter((e) => e.item.kind === "hurdle").map((e) => e.type));
    }
    return { outcomes, tired };
  };
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const acrossEveryLane = (hurdle: Item) => (hurdle.lanes ?? LANES).length === LANES.length;

  it("always leaves a player who only jumps when they have to a jump for every hurdle that needs one", () => {
    for (const seed of seeds) {
      const { outcomes, tired } = playRound(seed, acrossEveryLane);
      expect(tired).toBe(0);
      expect(outcomes).not.toContain("tripped");
      expect(outcomes).toContain("cleared");
    }
  });

  it("lets a player who jumps at everything run out of legs", () => {
    const tired = seeds.reduce((sum, seed) => sum + playRound(seed, () => true).tired, 0);
    expect(tired).toBeGreaterThan(seeds.length);
  });

  it("never takes a jump from a player who lets every high ball go over their head", () => {
    for (const seed of seeds) {
      const { outcomes, tired } = playRound(seed, acrossEveryLane, twisted("bounce"));
      expect(tired).toBe(0);
      expect(outcomes).not.toContain("tripped");
      expect(outcomes).toContain("cleared");
    }
  });
});

describe("full time", () => {
  it("ends the round at 75 seconds", () => {
    const { round } = step({ ...newRound(), now: ROUND_MS - 10 }, 50, seeded(1));
    expect(round.now).toBe(ROUND_MS);
    expect(isOver(round)).toBe(true);
  });

  it("sums up accuracy as footballs headed out of those that arrived", () => {
    const round = { ...newRound(), score: 3130, bestStreak: 13, headers: 43, footballs: 45 };
    expect(summarise(round)).toEqual({
      score: 3130,
      bestStreak: 13,
      headers: 43,
      footballs: 45,
      accuracy: 43 / 45,
      outOfLives: false,
    });
    expect(summarise(newRound()).accuracy).toBe(0);
  });
});

describe("praise", () => {
  it("shouts louder as the streak grows, and always for a golden ball", () => {
    expect(praise("ball", 1)).toBe("NICE!");
    expect(praise("ball", 3)).toBe("GREAT!");
    expect(praise("ball", 7)).toBe("UNREAL!");
    expect(praise("ball", 12)).toBe("ON FIRE!");
    expect(praise("golden", 1)).toBe("GOLDEN!");
  });
});

describe("rules", () => {
  it("are free play's unless a round is given its own", () => {
    expect(newRound().rules).toEqual(FREE_PLAY);
    expect(FREE_PLAY).toEqual({
      roundMs: ROUND_MS,
      pace: [0, 1],
      lives: LIVES,
      hurdles: true,
      skied: true,
    });
  });

  it("set how long the round lasts, and how many lives the player has", () => {
    const short: Rules = { ...FREE_PLAY, roundMs: 40_000, lives: 1 };
    const round = newRound(decoyPool(), short);
    expect(round.lives).toBe(1);
    const end = step({ ...round, now: 39_990 }, 50, seeded(1)).round;
    expect(end.now).toBe(40_000);
    expect(isOver(end)).toBe(true);
    expect(Math.max(...launched(1, decoyPool(), short).map(arrivalOf))).toBeLessThan(40_000);
  });

  it("send no hurdles when they're off", () => {
    const flat = launched(2, decoyPool(), { ...FREE_PLAY, hurdles: false });
    expect(flat.some((i) => i.kind === "hurdle")).toBe(false);
    expect(flat.length).toBeGreaterThan(80);
  });

  it("set the pace: a level that starts further up starts faster, and one that stops short stays slower", () => {
    const first = (rules: Rules) => launched(3, decoyPool(), rules)[0];
    const fast = { ...FREE_PLAY, pace: [0.5, 1] } as const;
    const kickOff = first(fast);
    expect(kickOff?.flightMs).toBe(flightMsAt(difficultyAt(fast, kickOff?.launchedAt ?? 0)));
    expect(kickOff?.flightMs).toBeLessThan(first(FREE_PLAY)?.flightMs ?? 0);
    const gentle = launched(3, decoyPool(), { ...FREE_PLAY, pace: [0, 0.3] });
    for (const item of gentle) expect(item.flightMs).toBeGreaterThanOrEqual(flightMsAt(0.3));
  });
});

/** Free play at a venue with a twist, biting as hard as `strength` says. */
const twisted = (kind: TwistKind, strength: readonly [number, number] = [1, 1]): Rules => ({
  ...FREE_PLAY,
  twist: { kind, strength },
});
const EVERY_RULES: readonly Rules[] = [FREE_PLAY, ...TWIST_KINDS.map((kind) => twisted(kind))];

/** What was launched, as it was launched, before anything happened to it. */
const asLaunched = (items: readonly Item[]) => items.map(({ outcome: _, ...item }) => item);

describe("a seeded run", () => {
  it("launches the same things at any frame rate, steady or not, with or without a twist", () => {
    for (const rules of EVERY_RULES) {
      for (let seed = 1; seed <= 12; seed++) {
        const at60 = asLaunched(launched(seed, decoyPool(), rules, () => 1000 / 60));
        expect(asLaunched(launched(seed, decoyPool(), rules, () => 1000 / 30))).toEqual(at60);
        expect(asLaunched(launched(seed, decoyPool(), rules, () => 1000 / 120))).toEqual(at60);
        // A browser's frames come at uneven times, and sometimes not for a while.
        const jitter = seededRandom(seed);
        const uneven = () => 4 + jitter() * 46;
        expect(asLaunched(launched(seed, decoyPool(), rules, uneven))).toEqual(at60);
      }
    }
    // Hundreds of whole rounds, so it takes a while, and longer on a busy machine.
  }, 60_000);

  it("launches the same things whatever the player does", () => {
    for (const rules of EVERY_RULES) {
      const idle = asLaunched(launched(4, decoyPool(), rules)).map(({ id, kind, lane, twist }) => ({
        id,
        kind,
        lane,
        twist,
      }));
      const random = seeded(4);
      const seen = new Map<number, Item>();
      let round = newRound(decoyPool(), rules);
      let n = 0;
      while (!isOver(round)) {
        // Darts about and jumps whenever it can, and so goes down early. What it saw launched
        // before then is the same as in the idle run.
        round = pointHead(round, LANES[n++ % 3] ?? 0);
        round = step(jump(round), 16, random).round;
        for (const item of round.items) seen.set(item.id, item);
      }
      const busy = [...seen.values()].map(({ id, kind, lane, twist }) => ({
        id,
        kind,
        lane,
        twist,
      }));
      expect(busy.length).toBeGreaterThan(5);
      expect(busy).toEqual(idle.slice(0, busy.length));
    }
  });

  it("gives the same numbers for the same seed, and different ones for another", () => {
    const draw = (seed: number) => Array.from({ length: 5 }, seededRandom(seed));
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
    for (const n of draw(9)) expect(n >= 0 && n < 1).toBe(true);
  });
});

describe("a perfect run", () => {
  // Except at the Funfair, where heading every high ball can leave a player without a jump for a
  // hurdle settled after them: see "the Funfair's high balls".
  const promised = EVERY_RULES.filter((rules) => rules.twist?.kind !== "bounce");

  it("heads every ball and loses no lives, under any rules and any twist, for its par", () => {
    for (const rules of [...promised, { ...twisted("bombs"), pace: [0.6, 1] as const }]) {
      for (const seed of [1, 2, 3]) {
        const round = playPerfectly(rules, decoyPool(), seed);
        expect(round.lives).toBe(rules.lives);
        expect(round.footballs).toBeGreaterThan(30);
        expect(round.headers).toBe(round.footballs);
        expect(parOf(rules, decoyPool(), seed)).toBe(round.score);
      }
    }
  });

  it("scores a par that rises with the length and the pace", () => {
    const par = (rules: Rules) => parOf(rules, decoyPool(), 5);
    expect(par({ ...FREE_PLAY, roundMs: 40_000 })).toBeLessThan(par(FREE_PLAY));
    expect(par({ ...FREE_PLAY, pace: [0.5, 1] })).toBeGreaterThan(par(FREE_PLAY));
  });
});

/** The waves of things in the air in every run, under some rules. */
const wavesUnder = (rules: Rules, seeds = [1, 2, 3, 4, 5, 6]) =>
  seeds.map((seed) => wavesIn(launched(seed, decoyPool(), rules)));

describe("every twist", () => {
  it("still leaves a way round every hurdle that can be stepped round", () => {
    for (const rules of EVERY_RULES) {
      for (const seed of [1, 2, 3, 4]) {
        const items = launched(seed, decoyPool(), rules);
        const hurdles = items.filter((h) => h.kind === "hurdle" && (h.lanes?.length ?? 3) < 3);
        expect(hurdles.length).toBeGreaterThan(3);
        for (const hurdle of hurdles) {
          const free = LANES.filter((lane) => !hurdle.lanes?.includes(lane));
          const near = items.filter(
            (i) => i.kind !== "hurdle" && Math.abs(arrivalOf(i) - arrivalOf(hurdle)) <= ROOM_MS,
          );
          for (const item of near.filter(isHeadable)) expect(free).toContain(item.lane);
          for (const wave of wavesIn(near)) {
            const unsafe = wave.filter((i) => !isHeadable(i)).map((i) => i.lane);
            expect(free.some((lane) => !unsafe.includes(lane))).toBe(true);
          }
        }
      }
    }
  });

  it("never goes three waves without a ball that can be headed", () => {
    for (const rules of EVERY_RULES) {
      for (const waves of wavesUnder(rules)) {
        let without = 0;
        for (const wave of waves) {
          without = wave.some(isHeadable) ? 0 : without + 1;
          expect(without).toBeLessThan(3);
        }
      }
    }
  });

  it("keeps every wave to its own lanes, with somewhere safe to stand", () => {
    for (const rules of EVERY_RULES) {
      for (const wave of wavesUnder(rules).flat()) {
        expect(new Set(wave.map((i) => i.lane)).size).toBe(wave.length);
        const unsafe = wave.filter((i) => !isHeadable(i)).map((i) => i.lane);
        expect(LANES.some((lane) => !unsafe.includes(lane))).toBe(true);
      }
    }
  });

  it("changes nothing where there's no twist, or one that only changes what's seen", () => {
    for (const kind of ["sway", "dust", "flare"] as const) {
      expect(asLaunched(launched(6, decoyPool(), twisted(kind)))).toEqual(
        asLaunched(launched(6, decoyPool(), FREE_PLAY)),
      );
    }
  });

  it("bites more as it gets stronger", () => {
    const count = (kind: TwistKind, s: number) =>
      [1, 2, 3, 4]
        .flatMap((seed) => launched(seed, decoyPool(), twisted(kind, [s, s])))
        .filter((i) => i.twist).length;
    for (const kind of ["zap", "breeze", "gale", "warp", "snow", "bombs"] as const) {
      expect(count(kind, 0)).toBeGreaterThan(0);
      expect(count(kind, 1)).toBeGreaterThan(count(kind, 0) * 1.8);
    }
  });
});

describe("the Moon's aliens", () => {
  const zapped = (lane: Lane, overrides: Partial<Round> = {}) => ({
    ...withItem("ball", 1, overrides),
    items: [
      {
        id: 1,
        kind: "ball",
        lane: 1,
        launchedAt: 0,
        flightMs: 1000,
        twist: { kind: "zap", at: 0.3 },
      },
    ] as Item[],
    lane,
  });

  it("explode a zapped ball on the head: a knock, costing a life and the streak", () => {
    const { round, events } = arrive(zapped(1, { streak: 4, score: 100 }));
    expect(events).toEqual([expect.objectContaining({ type: "hit", lostStreak: 4, lives: 2 })]);
    expect(round).toMatchObject({ streak: 0, lives: 2, score: 100, headers: 0, footballs: 0 });
  });

  it("let a zapped ball go without costing anything, not even the streak", () => {
    const { round, events } = arrive(zapped(0, { streak: 4 }));
    expect(events[0]?.type).toBe("dodged");
    expect(round).toMatchObject({ streak: 4, lives: LIVES, footballs: 0 });
  });

  it("zap only plain balls, and in good time to get out of the way", () => {
    const items = [1, 2, 3, 4].flatMap((seed) => launched(seed, decoyPool(), twisted("zap")));
    const zaps = items.filter((i) => i.twist?.kind === "zap");
    expect(zaps.length).toBeGreaterThan(20);
    for (const item of zaps) {
      expect(item.kind).toBe("ball");
      const at = item.twist?.kind === "zap" ? item.twist.at : 1;
      expect((1 - at) * item.flightMs).toBeGreaterThanOrEqual(600);
    }
  });
});

describe("the Volcano's lava bombs", () => {
  const waves = wavesUnder(twisted("bombs")).flat();
  const bombed = waves.filter((wave) => wave.some((i) => i.twist?.kind === "bomb"));

  it("drop beside a ball, never on it, and leave its lane safe", () => {
    expect(bombed.length).toBeGreaterThan(30);
    for (const wave of bombed) {
      const bomb = wave.find((i) => i.twist?.kind === "bomb");
      const ball = wave.find(isHeadable);
      expect(bomb?.kind).toBe(BOMB);
      expect(ball).toBeDefined();
      expect(bomb?.lane).not.toBe(ball?.lane);
    }
    expect(bombed.some((wave) => wave.length === 3)).toBe(true);
  });

  it("knock the player like any decoy", () => {
    const bomb = withItem(BOMB, 0, { streak: 3 });
    expect(arrive(bomb).round).toMatchObject({ lives: LIVES - 1, streak: 0 });
  });
});

describe("the Beach's breeze and Space's warps", () => {
  it("blow a whole wave one lane across, the same way, without leaving the pitch", () => {
    const blown = wavesUnder(twisted("breeze"))
      .flat()
      .filter((wave) => wave.some((i) => i.twist));
    expect(blown.length).toBeGreaterThan(30);
    for (const wave of blown) {
      const ways = wave.map((i) => (i.twist?.kind === "drift" ? i.lane - i.twist.from : 0));
      expect(new Set(ways).size).toBe(1);
      expect(Math.abs(ways[0] ?? 0)).toBe(1);
      for (const item of wave) {
        if (item.twist?.kind !== "drift") throw new Error("Blown waves blow every item");
        // Settled in its own lane with time to spare.
        expect((1 - item.twist.at - DRIFT_SPAN) * item.flightMs).toBeGreaterThanOrEqual(400);
      }
    }
  });

  it("warp one thing at most per wave, in from a lane none of the wave arrives in", () => {
    const warped = wavesUnder(twisted("warp"))
      .flat()
      .filter((wave) => wave.some((i) => i.twist));
    expect(warped.length).toBeGreaterThan(30);
    for (const wave of warped) {
      const warps = wave.filter((i) => i.twist?.kind === "warp");
      expect(warps).toHaveLength(1);
      const from = warps[0]?.twist?.kind === "warp" ? warps[0].twist.from : undefined;
      expect(wave.map((i) => i.lane)).not.toContain(from);
      const at = warps[0]?.twist?.kind === "warp" ? warps[0].twist.at : 1;
      expect((1 - at) * (warps[0]?.flightMs ?? 0)).toBeGreaterThanOrEqual(500);
    }
  });
});

describe("Sakura Peak's gusts", () => {
  const blown = wavesUnder(twisted("gale"))
    .flat()
    .filter((wave) => wave.some((i) => i.twist));
  const lanesBlown = (item: Item | undefined) =>
    item?.twist?.kind === "drift" ? Math.abs(item.lane - item.twist.from) : 0;

  it("blow a whole wave across the same way, in time to get there, without leaving the pitch", () => {
    expect(blown.length).toBeGreaterThan(30);
    for (const wave of blown) {
      const ways = wave.map((i) => (i.twist?.kind === "drift" ? i.lane - i.twist.from : 0));
      expect(new Set(ways).size).toBe(1);
      expect([1, 2]).toContain(Math.abs(ways[0] ?? 0));
      for (const item of wave) {
        if (item.twist?.kind !== "drift") throw new Error("Blown waves blow every item");
        expect(LANES).toContain(item.twist.from);
        // Settled in its own lane with time to spare, however far it's blown.
        const span = driftSpanOf(lanesBlown(item));
        expect((1 - item.twist.at - span) * item.flightMs).toBeGreaterThanOrEqual(400);
      }
    }
  });

  it("blow a lone thing right across the pitch in a strong gust", () => {
    const across = blown.filter((wave) => lanesBlown(wave[0]) === 2);
    expect(across.length).toBeGreaterThan(5);
    for (const wave of across) expect(wave).toHaveLength(1);
  });
});

describe("the snow", () => {
  it("cakes balls and decoys alike, and shakes off in good time", () => {
    const items = [1, 2, 3].flatMap((seed) => launched(seed, decoyPool(), twisted("snow")));
    const snowed = items.filter((i) => i.twist?.kind === "snowed");
    expect(snowed.some((i) => isFootball(i.kind))).toBe(true);
    expect(snowed.some((i) => !isFootball(i.kind))).toBe(true);
    for (const item of snowed) {
      const until = item.twist?.kind === "snowed" ? item.twist.until : 1;
      expect((1 - until) * item.flightMs).toBeGreaterThanOrEqual(450);
    }
  });
});

describe("the Funfair's high balls", () => {
  /** A ball bounced high in the middle lane, arriving at one second. */
  const high: Item = {
    id: 1,
    kind: "ball",
    lane: 0,
    launchedAt: 0,
    flightMs: 1000,
    twist: { kind: "bounce" },
  };
  const withHigh = (overrides: Partial<Round> = {}): Round => ({
    ...newRound(),
    nextLaunchAt: ROUND_MS,
    nextHurdleAt: ROUND_MS,
    items: [high],
    ...overrides,
  });
  /** Jumped so the ball arrives `p` of the way through the jump. */
  const upAt = (p: number) => 1000 - JUMP_MS * p;

  it("are headed at the top of a jump, for double a header's points", () => {
    const { round, events } = arrive(withHigh({ jumpedAt: upAt(0.5), streak: 3, score: 60 }));
    expect(events).toEqual([expect.objectContaining({ type: "header", points: 80, streak: 4 })]);
    expect(round).toMatchObject({ score: 140, streak: 4, headers: 1, footballs: 1 });
  });

  it("can be headed only near the top, not as the jump takes off or lands", () => {
    const outcome = (p: number) => arrive(withHigh({ jumpedAt: upAt(p) })).events[0]?.type;
    for (const p of [HIGH_REACH[0], 0.4, 0.6, HIGH_REACH[1]]) expect(outcome(p)).toBe("header");
    for (const p of [0.05, HIGH_REACH[0] - 0.02, HIGH_REACH[1] + 0.02, 0.95]) {
      expect(outcome(p)).toBe("missed");
    }
  });

  it("go over the head of a player on the ground, costing the streak but never a life", () => {
    const { round, events } = arrive(withHigh({ streak: 5, lives: 1 }));
    expect(events).toEqual([expect.objectContaining({ type: "missed", lostStreak: 5 })]);
    expect(round).toMatchObject({ streak: 0, lives: 1, footballs: 1, headers: 0 });
    expect(round.downAt).toBeUndefined();
    // Nor in another lane, in the air or not.
    const elsewhere = arrive(withHigh({ lane: 1, jumpedAt: upAt(0.5), lives: 1 })).round;
    expect(elsewhere).toMatchObject({ lives: 1, streak: 0 });
  });

  const rounds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
    launched(seed, decoyPool(), twisted("bounce")),
  );
  const highs = rounds.flat().filter(isHigh);

  it("bounce only plain balls, never a golden one, and a few each round", () => {
    for (const items of rounds) expect(items.filter(isHigh).length).toBeGreaterThanOrEqual(2);
    for (const item of highs) expect(item.kind).toBe("ball");
  });

  it("come down in a lane a nearby hurdle that can be stepped round leaves free", () => {
    let near = 0;
    for (const items of rounds) {
      for (const hurdle of items.filter((h) => h.kind === "hurdle" && (h.lanes?.length ?? 3) < 3)) {
        const free = LANES.filter((lane) => !hurdle.lanes?.includes(lane));
        for (const item of items.filter(isHigh)) {
          if (Math.abs(arrivalOf(item) - arrivalOf(hurdle)) > ROOM_MS) continue;
          near++;
          expect(free).toContain(item.lane);
        }
      }
    }
    expect(near).toBeGreaterThan(0);
  });

  it("bounce more often the stronger the twist", () => {
    const count = (s: number) =>
      [1, 2, 3, 4, 5, 6]
        .flatMap((seed) => launched(seed, decoyPool(), twisted("bounce", [s, s])))
        .filter(isHigh).length;
    expect(count(1)).toBeGreaterThan(count(0));
    expect(count(0)).toBeGreaterThan(0);
  });

  /**
   * Plays a round heading every high ball and jumping every hurdle across every lane, as a perfect
   * player does, and says when each high ball and hurdle arrived, when each hurdle was settled (as
   * the one before was launched), and which the player tripped over.
   */
  const takeEverything = (seed: number, rules: Rules) => {
    const random = seededRandom(seed);
    let round = newRound(decoyPool(), rules);
    const seen = new Map<number, Item>();
    while (!isOver(round)) {
      const arriving = round.items.filter((i) => !i.outcome && arrivalOf(i) <= round.now + 16);
      const ball = arriving.find(isHeadable);
      if (ball) round = pointHead(round, ball.lane);
      else {
        const blocked = (lane: Lane) =>
          arriving.some((i) =>
            i.kind === "hurdle"
              ? (i.lanes ?? LANES).length < 3 && (i.lanes ?? LANES).includes(lane)
              : i.lane === lane,
          );
        round = pointHead(round, [round.lane, ...LANES].find((l) => !blocked(l)) ?? round.lane);
      }
      const due = round.items.some((i) => {
        const until = arrivalOf(i) - round.now;
        return !i.outcome && isLeap(i) && until <= JUMP_MS / 2 && until > JUMP_MS / 2 - 16;
      });
      if (due) round = jump(round);
      round = step(round, 16, random).round;
      for (const item of round.items) seen.set(item.id, item);
    }
    const items = [...seen.values()];
    const hurdles = items.filter((i) => i.kind === "hurdle");
    return {
      round,
      highs: items.filter(isHigh),
      hurdles: hurdles.map((hurdle, i) => ({
        hurdle,
        settledAt: hurdles[i - 1]?.launchedAt ?? 0,
      })),
    };
  };

  it("leave a player who heads them all a jump for any hurdle already settled when they bounced", () => {
    let caught = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { highs: taken, hurdles } = takeEverything(seed, { ...twisted("bounce"), lives: 99 });
      // The first trip: after that, they're no longer a perfect player.
      const first = hurdles.find(({ hurdle }) => hurdle.outcome === "tripped");
      if (!first) continue;
      caught++;
      expect(first.hurdle.lanes).toEqual(LANES);
      // It was settled after the last ball that bounced before it, which had no say.
      const before = taken.filter((b) => arrivalOf(b) < arrivalOf(first.hurdle));
      const last = Math.max(...before.map((b) => b.launchedAt));
      expect(first.settledAt).toBeGreaterThanOrEqual(last);
    }
    // But hurdles settled after can catch them out: taking every high ball is a risk.
    expect(caught).toBeGreaterThan(0);
  });

  it("count as footballs, so a run that heads them all heads every ball", () => {
    const rules: Rules = { ...twisted("bounce", [0.3, 0.3]), hurdles: false, roundMs: 40_000 };
    const { round, highs: taken } = takeEverything(3, rules);
    expect(taken.length).toBeGreaterThan(0);
    expect(round.headers).toBe(round.footballs);
    expect(playPerfectly(rules, decoyPool(), 3).score).toBe(round.score);
  });
});

describe("skied balls", () => {
  /** A ball skied in the middle lane, arriving at one second. */
  const skied: Item = { id: 1, kind: "ball", lane: 0, launchedAt: 0, flightMs: 1000, skied: true };
  const withSkied = (overrides: Partial<Round> = {}): Round => ({
    ...newRound(),
    nextLaunchAt: ROUND_MS,
    nextHurdleAt: ROUND_MS,
    items: [skied],
    ...overrides,
  });
  /** Jumped so the ball arrives `p` of the way through the jump. */
  const upAt = (p: number) => 1000 - JUMP_MS * p;
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  /** The rules of every venue that skies balls: free play's, and with each twist but two. */
  const SKYING = EVERY_RULES.filter(skies);

  it("play like the trampolines' high balls: headed at the top of a jump, for double", () => {
    expect(isHigh(skied)).toBe(true);
    expect(isLeap(skied)).toBe(true);
    const { round, events } = arrive(withSkied({ jumpedAt: upAt(0.5), streak: 3, score: 60 }));
    expect(events).toEqual([expect.objectContaining({ type: "header", points: 80, streak: 4 })]);
    expect(round).toMatchObject({ score: 140, streak: 4, headers: 1, footballs: 1 });
    for (const p of [0.05, HIGH_REACH[0] - 0.02, HIGH_REACH[1] + 0.02]) {
      expect(arrive(withSkied({ jumpedAt: upAt(p) })).events[0]?.type).toBe("missed");
    }
  });

  it("go over the head of a player on the ground, costing the streak but never a life", () => {
    const { round, events } = arrive(withSkied({ streak: 5, lives: 1 }));
    expect(events).toEqual([expect.objectContaining({ type: "missed", lostStreak: 5 })]);
    expect(round).toMatchObject({ streak: 0, lives: 1, footballs: 1 });
    expect(round.downAt).toBeUndefined();
  });

  it("come in every venue's free play but the Funfair's and the Colosseum's", () => {
    expect(skies(FREE_PLAY)).toBe(true);
    expect(TWIST_KINDS.filter((kind) => !skies(twisted(kind)))).toEqual(["bounce", "verdict"]);
    expect(skies({ ...FREE_PLAY, skied: false })).toBe(false);
    expect(skies({ roundMs: ROUND_MS, pace: [0, 1], lives: LIVES, hurdles: true })).toBe(false);
  });

  it("change nothing where balls aren't skied, so those rounds play as they always have", () => {
    for (const rules of [twisted("bounce"), twisted("verdict"), FREE_PLAY]) {
      const off = { ...rules, skied: false };
      for (const seed of [1, 2, 3]) {
        const items = launched(seed, decoyPool(), rules);
        if (!skies(rules))
          expect(asLaunched(items)).toEqual(asLaunched(launched(seed, decoyPool(), off)));
        expect(launched(seed, decoyPool(), off).some(isSkied)).toBe(false);
      }
    }
  });

  const rounds = SEEDS.map((seed) => launched(seed));

  it("sky only plain balls, never a golden one, a few each round", () => {
    for (const items of rounds) {
      expect(items.filter(isSkied).length).toBeGreaterThanOrEqual(1);
      for (const item of items.filter(isSkied)) expect(item.kind).toBe("ball");
    }
    const each = rounds.flat().filter(isSkied).length / rounds.length;
    expect(each).toBeGreaterThanOrEqual(2);
    expect(each).toBeLessThanOrEqual(6);
  });

  it("come more often the higher the pace", () => {
    // Without hurdles, so the player's legs hold it back the same at either pace.
    const count = (pace: number) =>
      SEEDS.flatMap((seed) =>
        launched(seed, decoyPool(), { ...FREE_PLAY, hurdles: false, pace: [pace, pace] }),
      ).filter(isSkied).length;
    expect(count(1)).toBeGreaterThan(count(0) * 1.5);
  });

  it("are left alone by every twist: never zapped, snowed on, blown, warped or joined by a bomb or a ghost", () => {
    for (const rules of SKYING) {
      for (const seed of [1, 2, 3, 4]) {
        for (const wave of wavesIn(launched(seed, decoyPool(), rules))) {
          if (!wave.some(isSkied)) continue;
          for (const item of wave) {
            expect(item.twist).toBeUndefined();
            expect([BOMB, GHOST]).not.toContain(item.kind);
          }
        }
      }
    }
  });

  it("come down in a lane a nearby hurdle that can be stepped round leaves free", () => {
    let near = 0;
    for (const items of rounds) {
      for (const hurdle of items.filter((h) => h.kind === "hurdle" && (h.lanes?.length ?? 3) < 3)) {
        const free = LANES.filter((lane) => !hurdle.lanes?.includes(lane));
        for (const item of items.filter(isSkied)) {
          if (Math.abs(arrivalOf(item) - arrivalOf(hurdle)) > ROOM_MS) continue;
          near++;
          expect(free).toContain(item.lane);
        }
      }
    }
    expect(near).toBeGreaterThan(0);
  });

  /**
   * Plays a round as a perfect player: heading every ball, the high ones in a jump, and jumping
   * every hurdle across every lane. Counts the jumps they were too tired for, and their trips.
   */
  const takeEverything = (seed: number, rules: Rules) => {
    const random = seeded(seed);
    let round: Round = { ...newRound(decoyPool(), rules), lives: 99 };
    let tired = 0;
    let trips = 0;
    let highs = 0;
    while (!isOver(round)) {
      const arriving = round.items.filter((i) => !i.outcome && arrivalOf(i) <= round.now + 16);
      const ball = arriving.find(isHeadable);
      const blocked = (lane: Lane) =>
        arriving.some((i) =>
          i.kind === "hurdle"
            ? (i.lanes ?? LANES).length < 3 && (i.lanes ?? LANES).includes(lane)
            : i.lane === lane,
        );
      round = pointHead(
        round,
        ball?.lane ?? [round.lane, ...LANES].find((l) => !blocked(l)) ?? round.lane,
      );
      const due = round.items.some((i) => {
        const until = arrivalOf(i) - round.now;
        return !i.outcome && isLeap(i) && until <= JUMP_MS / 2 && until > JUMP_MS / 2 - 16;
      });
      if (due && isTired(round)) tired++;
      if (due) round = jump(round);
      const result = step(round, 16, random);
      round = result.round;
      trips += result.events.filter((e) => e.type === "tripped").length;
      highs += result.events.filter((e) => e.type === "header" && isSkied(e.item)).length;
    }
    return { round, tired, trips, highs };
  };

  it("never leave a player who heads every one too tired for a hurdle, at any venue", () => {
    for (const rules of SKYING) {
      let highs = 0;
      for (const seed of SEEDS) {
        const taken = takeEverything(seed, rules);
        expect([rules.twist?.kind, seed, taken.tired, taken.trips]).toEqual([
          rules.twist?.kind,
          seed,
          0,
          0,
        ]);
        expect(taken.round.headers).toBe(taken.round.footballs);
        highs += taken.highs;
      }
      expect(highs).toBeGreaterThan(SEEDS.length);
    }
    // Hundreds of whole rounds, so it takes a while, and longer on a busy machine.
  }, 60_000);

  it("say whether the player can still get up to one: in the air for it, or with legs to jump", () => {
    const at = 5000;
    const fresh = { ...newRound(), now: 4000 };
    expect(canReach(fresh, at)).toBe(true);
    // Too tired, and not getting a jump back in time.
    expect(canReach({ ...fresh, fitness: 0.5 }, at)).toBe(false);
    // But a jump comes back by the time it's needed.
    expect(canReach({ ...fresh, fitness: 0.95 }, at)).toBe(true);
    // Already on the way up to meet it.
    const leapt = { ...fresh, now: at - 100, fitness: 0, jumpedAt: at - JUMP_MS / 2 };
    expect(canReach(leapt, at)).toBe(true);
    // Just jumped for something else, and won't have landed and got their legs back in time.
    expect(canReach({ ...fresh, jumpedAt: 4000 }, at)).toBe(false);
    expect(canReach({ ...fresh, downAt: 3000 }, at)).toBe(false);
  });
});

describe("the Haunted Castle's ghost balls", () => {
  const waves = wavesUnder(twisted("haunt")).flat();
  const haunted = waves.filter((wave) => wave.some((i) => i.kind === GHOST));

  it("come beside a real ball, never in its lane, and leave somewhere safe to stand", () => {
    expect(haunted.length).toBeGreaterThan(30);
    for (const wave of haunted) {
      const ghost = wave.find((i) => i.kind === GHOST);
      const ball = wave.find(isHeadable);
      expect(ball).toBeDefined();
      expect(ghost?.lane).not.toBe(ball?.lane);
      expect(isHeadable(ghost as Item)).toBe(false);
      expect(isFootball(GHOST)).toBe(false);
    }
    expect(haunted.some((wave) => wave.length === 3)).toBe(true);
  });

  it("knock a player who heads one, like any decoy, and cost nothing let go", () => {
    const headed = arrive(withItem(GHOST, 0, { streak: 3 }));
    expect(headed.events).toEqual([expect.objectContaining({ type: "hit", lostStreak: 3 })]);
    expect(headed.round).toMatchObject({ lives: LIVES - 1, streak: 0, footballs: 0 });
    const passed = arrive(withItem(GHOST, 1, { streak: 3 }));
    expect(passed.events[0]?.type).toBe("dodged");
    expect(passed.round).toMatchObject({ lives: LIVES, streak: 3, footballs: 0 });
  });

  it("come more often the stronger the twist, and only in the castle", () => {
    const count = (s: number) =>
      [1, 2, 3, 4]
        .flatMap((seed) => launched(seed, decoyPool(), twisted("haunt", [s, s])))
        .filter((i) => i.kind === GHOST).length;
    expect(count(0)).toBeGreaterThan(0);
    expect(count(1)).toBeGreaterThan(count(0) * 1.8);
    expect(TUNING.ghosts.chance(1)).toBeGreaterThan(TUNING.ghosts.chance(0));
    expect(played.flat().some((i) => i.kind === GHOST)).toBe(false);
  });
});

describe("the Colosseum's verdict", () => {
  const rules = twisted("verdict");
  const rule = rules.twist as TwistRule;
  const items = [1, 2, 3, 4, 5, 6].flatMap((seed) => launched(seed, decoyPool(), rules));
  const coloured = items.filter((i) => i.twist?.kind === "colour");

  it("starts thumbs up, turns over and back, and turns sooner the harder it bites", () => {
    const gentle: TwistRule = { kind: "verdict", strength: [0, 0] };
    expect(verdictAt(gentle, ROUND_MS, 0)).toMatchObject({ thumb: "up", since: 0 });
    const first = verdictAt(gentle, ROUND_MS, 0).next;
    expect(verdictAt(gentle, ROUND_MS, first).thumb).toBe("down");
    expect(verdictAt(gentle, ROUND_MS, verdictAt(gentle, ROUND_MS, first).next).thumb).toBe("up");
    const fierce: TwistRule = { kind: "verdict", strength: [1, 1] };
    expect(verdictAt(fierce, ROUND_MS, 0).next).toBeLessThan(first);
  });

  it("colours each ball for the verdict it lands under: the wanted colour to head, the other not", () => {
    expect(coloured.length).toBeGreaterThan(100);
    for (const item of coloured) {
      if (item.twist?.kind !== "colour") continue;
      const { thumb } = verdictAt(rule, ROUND_MS, arrivalOf(item));
      expect(item.twist.colour === WANTED[thumb]).toBe(item.twist.right);
      expect(isHeadable(item)).toBe(item.twist.right);
    }
    expect(coloured.some((i) => i.twist?.kind === "colour" && !i.twist.right)).toBe(true);
  });

  it("never lands a ball in his colours just after he turns his thumb over", () => {
    for (const item of coloured) {
      const { since } = verdictAt(rule, ROUND_MS, arrivalOf(item));
      expect(since >= VERDICT_REACT_MS || arrivalOf(item) < VERDICT_REACT_MS).toBe(true);
    }
  });

  it("brings at most one ball to head in a wave, and sometimes one in each colour", () => {
    const waves = wavesUnder(rules).flat();
    for (const wave of waves) expect(wave.filter(isHeadable).length).toBeLessThanOrEqual(1);
    const pairs = waves.filter((w) => w.filter((i) => i.twist?.kind === "colour").length === 2);
    expect(pairs.length).toBeGreaterThan(20);
  });

  it("costs the streak, but not a life, to head the wrong colour, and nothing to let it go", () => {
    const wrong = (lane: Lane): Round => ({
      ...withItem("ball", lane, { streak: 4 }),
      items: [
        {
          id: 1,
          kind: "ball",
          lane,
          launchedAt: 0,
          flightMs: 1000,
          twist: { kind: "colour", colour: "red", right: false },
        },
      ],
    });
    const headed = arrive(wrong(0));
    expect(headed.events).toEqual([
      expect.objectContaining({ type: "hit", lostStreak: 4, lives: LIVES }),
    ]);
    expect(headed.round).toMatchObject({ streak: 0, lives: LIVES, footballs: 0 });
    const passed = arrive(wrong(1));
    expect(passed.events[0]?.type).toBe("dodged");
    expect(passed.round).toMatchObject({ streak: 4, lives: LIVES });
  });
});

describe("the Colosseum's spears", () => {
  const rules = twisted("verdict");
  const spears = [1, 2, 3, 4, 5, 6]
    .flatMap((seed) => launched(seed, decoyPool(), rules))
    .filter((i) => i.kind === "hurdle");
  /** A round at the Colosseum with one spear on its way, covering `lanes`, and nothing else. */
  const withSpear = (lanes: readonly Lane[], overrides: Partial<Round> = {}): Round => ({
    ...newRound(decoyPool(), rules),
    nextLaunchAt: ROUND_MS,
    nextHurdleAt: Infinity,
    items: [{ id: 1, kind: "hurdle", lane: 0, lanes, launchedAt: 0, flightMs: 1000 }],
    ...overrides,
  });
  /** Halfway down in a duck when the spear arrives. */
  const ducked = 1000 - DUCK_MS / 2;

  it("come from one side, reaching one lane or two, never all three", () => {
    expect(spears.length).toBeGreaterThan(20);
    for (const spear of spears) expect([[-1], [-1, 0], [0, 1], [1]]).toContainEqual(spear.lanes);
  });

  it("never need a jump, so none is booked", () => {
    expect(spears.some(isLeap)).toBe(false);
    expect(newRound(decoyPool(), rules).leaps).toEqual([]);
  });

  it("are stepped round out of reach", () => {
    expect(arrive(withSpear([-1, 0], { lane: 1 })).events[0]?.type).toBe("dodged");
  });

  it("knock a player standing in reach, unless they duck under", () => {
    const standing = arrive(withSpear([1], { lane: 1, streak: 2 }));
    expect(standing.events[0]).toMatchObject({ type: "tripped", lostStreak: 2 });
    expect(standing.round.lives).toBe(LIVES - 1);
    const under = arrive(withSpear([1], { lane: 1, duckedAt: ducked }));
    expect(under.events[0]).toMatchObject({ type: "cleared", points: 20 });
    expect(under.round.lives).toBe(LIVES);
    // Jumping's no help.
    const jumped = arrive(withSpear([1], { lane: 1, jumpedAt: 1000 - JUMP_MS / 2 }));
    expect(jumped.events[0]?.type).toBe("tripped");
  });

  it("make the tap a duck, which doesn't tire the player", () => {
    expect(hasSpears(rules)).toBe(true);
    expect(hasSpears(FREE_PLAY)).toBe(false);
    const tapped = jump({ ...newRound(decoyPool(), rules), now: 5000 });
    expect(tapped).toMatchObject({ duckedAt: 5000, jumpedAt: -Infinity, fitness: FITNESS_MAX });
    expect(jump({ ...tapped, now: 5300 }).duckedAt).toBe(5000);
    expect(jump({ ...tapped, now: 5000 + DUCK_MS + 200 }).duckedAt).toBe(5000 + DUCK_MS + 200);
  });

  it("let what comes down the lane go over a ducked head", () => {
    const ball = arrive({ ...withItem("ball", 0, { streak: 3 }), duckedAt: ducked });
    expect(ball.events[0]).toMatchObject({ type: "missed", lostStreak: 3 });
    const decoy = arrive({ ...withItem("panda", 0), duckedAt: ducked });
    expect(decoy.events[0]?.type).toBe("dodged");
    expect(decoy.round.lives).toBe(LIVES);
  });
});

describe("Sakura Peak's ninjas' staffs", () => {
  const rules = twisted("gale");
  const staffs = [1, 2, 3, 4, 5, 6]
    .flatMap((seed) => launched(seed, decoyPool(), rules))
    .filter((i) => i.kind === "hurdle");
  /** A round on Sakura Peak with one staff on its way, covering `lanes`, and nothing else. */
  const withStaff = (lanes: readonly Lane[], overrides: Partial<Round> = {}): Round => ({
    ...newRound(decoyPool(), rules),
    nextLaunchAt: ROUND_MS,
    nextHurdleAt: Infinity,
    items: [{ id: 1, kind: "hurdle", lane: 0, lanes, launchedAt: 0, flightMs: 1000 }],
    ...overrides,
  });
  const staff = (lanes: readonly Lane[]): Item => ({
    id: 1,
    kind: "hurdle",
    lane: 0,
    lanes,
    launchedAt: 0,
    flightMs: 1000,
  });

  it("sweep in from one side, across the lane on that side and no further", () => {
    expect(hasSweeps(rules)).toBe(true);
    expect(hasSweeps(FREE_PLAY)).toBe(false);
    expect(staffs.length).toBeGreaterThan(20);
    for (const each of staffs) expect([[-1], [1]]).toContainEqual(each.lanes);
    expect(staffs.map((s) => s.lanes)).toContainEqual([-1]);
    expect(staffs.map((s) => s.lanes)).toContainEqual([1]);
  });

  it("come from the side of the lane they reach", () => {
    expect(sweptFrom(staff([-1]))).toBe(-1);
    expect(sweptFrom(staff([1]))).toBe(1);
  });

  it("are stepped round out of reach, or jumped, but trip a player standing in reach", () => {
    expect(arrive(withStaff([-1], { lane: 0 })).events[0]?.type).toBe("dodged");
    const standing = arrive(withStaff([1], { lane: 1, streak: 2 }));
    expect(standing.events[0]).toMatchObject({ type: "tripped", lostStreak: 2 });
    expect(standing.round.lives).toBe(LIVES - 1);
    const jumped = arrive(withStaff([1], { lane: 1, jumpedAt: 1000 - JUMP_MS / 2 }));
    expect(jumped.events[0]).toMatchObject({ type: "cleared", points: 20 });
  });

  it("never have to be jumped, so book no jumps", () => {
    expect(staffs.some(isLeap)).toBe(false);
    expect(newRound(decoyPool(), rules).leaps).toHaveLength(0);
  });
});

describe("ducking as well as jumping", () => {
  const rules: Rules = { ...FREE_PLAY, ducks: true };
  /** Halfway down in a duck when whatever's on its way arrives, at one second. */
  const ducked = 1000 - DUCK_MS / 2;

  it("is only where the rules say, besides the Colosseum", () => {
    expect(canDuck(rules)).toBe(true);
    expect(canDuck(twisted("verdict"))).toBe(true);
    expect(canDuck(FREE_PLAY)).toBe(false);
    expect(duck({ ...newRound(), now: 5000 }).duckedAt).toBe(-Infinity);
  });

  it("lets whatever comes down the lane go over the head, ball or decoy", () => {
    const decoy = arrive(withItem("panda", 0, { rules, duckedAt: ducked }));
    expect(decoy.events[0]?.type).toBe("dodged");
    expect(decoy.round.lives).toBe(LIVES);
    const ball = arrive(withItem("ball", 0, { rules, streak: 3, duckedAt: ducked }));
    expect(ball.events[0]).toMatchObject({ type: "missed", lostStreak: 3 });
  });

  it("is no help against a hurdle, which still has to be jumped", () => {
    expect(arrive(withItem("hurdle", 0, { rules, duckedAt: ducked })).events[0]?.type).toBe(
      "tripped",
    );
  });

  it("doesn't tire the player, and can't be done in the air, nor a jump while ducking", () => {
    const down = duck({ ...newRound(decoyPool(), rules), now: 5000 });
    expect(down).toMatchObject({ duckedAt: 5000, fitness: FITNESS_MAX });
    expect(jump({ ...down, now: 5000 + DUCK_MS / 2 }).jumpedAt).toBe(-Infinity);
    expect(jump({ ...down, now: 5001 + DUCK_MS }).jumpedAt).toBe(5001 + DUCK_MS);
    const up = jump({ ...newRound(decoyPool(), rules), now: 5000 });
    expect(up.jumpedAt).toBe(5000);
    expect(duck({ ...up, now: 5000 + JUMP_MS / 2 }).duckedAt).toBe(-Infinity);
  });
});

describe("Sunny Park's skimmed frisbees", () => {
  const rules: Rules = { ...FREE_PLAY, ducks: true };
  const runs = [1, 2, 3, 4, 5, 6].map((seed) => launched(seed, decoyPool(), rules));
  const frisbees = runs.flatMap((items) => items.filter(isSkimmed));
  /** A round with a frisbee on its way, arriving at one second, and nothing else. */
  const withFrisbee = (overrides: Partial<Round> = {}): Round => ({
    ...newRound(decoyPool(), rules),
    nextLaunchAt: ROUND_MS,
    nextHurdleAt: Infinity,
    items: [{ id: 1, kind: "hurdle", lane: 0, launchedAt: 0, flightMs: 1000, skimmed: true }],
    ...overrides,
  });

  it("come only where the player can duck as well, across every lane, and never first", () => {
    expect(skims(rules)).toBe(true);
    expect(skims(FREE_PLAY)).toBe(false);
    expect(skims(twisted("verdict"))).toBe(false);
    expect(played.flat().some(isSkimmed)).toBe(false);
    expect(frisbees.length).toBeGreaterThan(12);
    for (const frisbee of frisbees) expect(frisbee.lanes).toEqual(LANES);
    for (const items of runs) {
      expect(items.find((i) => i.kind === "hurdle")?.skimmed).toBeUndefined();
    }
  });

  it("are ducked, never jumped", () => {
    expect(frisbees.some(isLeap)).toBe(false);
    const under = arrive(withFrisbee({ lane: 1, duckedAt: 1000 - DUCK_MS / 2 }));
    expect(under.events[0]).toMatchObject({ type: "cleared", points: 20 });
    const standing = arrive(withFrisbee({ streak: 2 }));
    expect(standing.events[0]).toMatchObject({ type: "tripped", lostStreak: 2 });
    expect(standing.round.lives).toBe(LIVES - 1);
    const jumped = arrive(withFrisbee({ jumpedAt: 1000 - JUMP_MS / 2 }));
    expect(jumped.events[0]?.type).toBe("tripped");
  });

  it("come alone, with nothing landing near and no ball skied near enough to need a jump", () => {
    for (const items of runs) {
      for (const frisbee of items.filter(isSkimmed)) {
        const apart = (i: Item) => Math.abs(arrivalOf(i) - arrivalOf(frisbee));
        expect(items.filter((i) => i.kind !== "hurdle" && apart(i) < DUCK_MS)).toEqual([]);
        expect(items.filter((i) => isSkied(i) && apart(i) < JUMP_MS + DUCK_MS)).toEqual([]);
      }
    }
  });
});
