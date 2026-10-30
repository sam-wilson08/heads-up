import { describe, expect, it } from "vitest";
import {
  arrivalOf,
  duck,
  DUCK_MS,
  isHeadable,
  isHigh,
  isLeap,
  isOver,
  isSkied,
  isSkimmed,
  isTired,
  type Item,
  jump,
  JUMP_MS,
  type Lane,
  LANES,
  newRound,
  playPerfectly,
  pointHead,
  ROOM_MS,
  type Round,
  seededRandom,
  skies,
  step,
  summarise,
  type Summary,
} from "./game/engine";
import {
  decoysAt,
  freePlayAt,
  isPerfect,
  type Level,
  LEVELS,
  levelsAt,
  MEDAL_XP,
  medalFor,
  medalsBetween,
  nextTarget,
  parFor,
  STAGES,
  targetsOf,
} from "./levels";
import { venueById, VENUES } from "./venues";

const STEP_MS = 1000 / 60;
const decoysOf = (level: Level) => decoysAt(venueById(level.venue));

/**
 * Plays a level as a careful player would: heading every ball but those numbered in `slips` (from
 * 1, in the order they arrive), stepping round what can be stepped round and jumping only hurdles
 * across every lane, and high balls, and ducking frisbees skimmed at head height. A slip lets a
 * plain ball go by into an empty lane, which
 * breaks the streak. Letting a golden ball go doesn't, so a slip due on one, or when no lane's free
 * just then, is made on the next plain ball instead. Returns the round at full time, how often the
 * player found themselves too tired to jump, the jumps they had in their legs as each hurdle across
 * every lane came, and every item launched.
 */
const play = (level: Level, slips: ReadonlySet<number> = new Set()) => {
  const random = seededRandom(level.seed);
  let round: Round = newRound(decoysOf(level), level.rules);
  const seen = new Map<number, Item>();
  const counted = new Set<number>();
  let balls = 0;
  let owed = 0;
  let tired = 0;
  const legs: number[] = [];
  while (!isOver(round)) {
    const arriving = round.items.filter((i) => !i.outcome && arrivalOf(i) <= round.now + STEP_MS);
    const blocked = (lane: Lane) =>
      arriving.some((i) => {
        if (i.kind !== "hurdle") return i.lane === lane;
        const lanes = i.lanes ?? LANES;
        return lanes.length < LANES.length && lanes.includes(lane);
      });
    const ball = arriving.find(isHeadable);
    if (ball && !counted.has(ball.id)) {
      counted.add(ball.id);
      if (slips.has(++balls)) owed++;
    }
    const empty = LANES.find((lane) => !blocked(lane));
    let lane = ball?.lane ?? (blocked(round.lane) ? (empty ?? round.lane) : round.lane);
    if (ball?.kind === "ball" && owed > 0 && empty !== undefined) {
      lane = empty;
      owed--;
    }
    round = pointHead(round, lane);
    const due = round.items.find((i) => {
      if (i.outcome || !isLeap(i)) return false;
      const until = arrivalOf(i) - round.now;
      return until <= JUMP_MS / 2 && until > JUMP_MS / 2 - STEP_MS;
    });
    if (due) {
      if (isTired(round)) tired++;
      if (due.kind === "hurdle") legs.push(round.fitness);
      round = jump(round);
    }
    const skimming = round.items.some((i) => {
      if (i.outcome || !isSkimmed(i)) return false;
      const until = arrivalOf(i) - round.now;
      return until <= DUCK_MS / 2 && until > DUCK_MS / 2 - STEP_MS;
    });
    if (skimming) round = duck(round);
    round = step(round, STEP_MS, random).round;
    for (const item of round.items) seen.set(item.id, item);
  }
  return { round, tired, legs, items: [...seen.values()] };
};

/** Things in the air, by the wave they were launched in. */
const byWave = (items: readonly Item[]): Item[][] => {
  const waves = new Map<number, Item[]>();
  for (const item of items)
    waves.set(item.launchedAt, [...(waves.get(item.launchedAt) ?? []), item]);
  return [...waves.values()];
};

/** `count` slips spread evenly through a run with `balls` balls in it: the costliest way. */
const evenly = (count: number, balls: number) =>
  new Set(Array.from({ length: count }, (_, i) => Math.round(((i + 1) * balls) / (count + 1))));

const perfect = LEVELS.map((level) => ({ level, ...play(level) }));

describe("the levels", () => {
  it("give every stage four, the last its final, each with its own id and seed", () => {
    for (const stage of STAGES) {
      const levels = levelsAt(stage.venue);
      expect(levels.map((l) => l.number)).toEqual([1, 2, 3, 4]);
      expect(levels.map((l) => l.final)).toEqual([false, false, false, true]);
    }
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.seed)).size).toBe(LEVELS.length);
    expect(LEVELS).toHaveLength(VENUES.length * 4);
  });

  it("play their stage's twist, and only the park has none", () => {
    for (const level of LEVELS) {
      const twist = STAGES.find((s) => s.venue === level.venue)?.twist;
      expect(level.rules.twist?.kind).toBe(twist);
    }
    expect(STAGES.filter((s) => !s.twist).map((s) => s.venue)).toEqual(["park"]);
    expect(new Set(STAGES.map((s) => s.twist)).size).toBe(STAGES.length);
  });

  it("teach a stage gently first, without hurdles, then get longer, faster and fiercer", () => {
    for (const stage of STAGES) {
      const levels = levelsAt(stage.venue);
      const first = levels[0];
      expect(first?.rules.hurdles).toBe(false);
      expect(first?.rules.lives).toBe(3);
      expect(first?.rules.twist?.strength[0] ?? 0).toBe(0);
      for (const [i, level] of levels.entries()) {
        const before = levels[i - 1];
        if (!before) continue;
        expect(level.rules.roundMs).toBeGreaterThan(before.rules.roundMs);
        expect(level.rules.pace[1]).toBeGreaterThanOrEqual(before.rules.pace[1]);
        expect(level.rules.pace[0]).toBeGreaterThan(before.rules.pace[0]);
        expect(level.rules.lives).toBeLessThanOrEqual(before.rules.lives);
        expect(level.rules.twist?.strength[1] ?? 0).toBeGreaterThanOrEqual(
          before.rules.twist?.strength[1] ?? 0,
        );
        expect(level.rules.hurdles).toBe(true);
      }
    }
  });

  it("keep their pace and twists on the scale they're set on", () => {
    for (const { rules } of LEVELS) {
      for (const n of [...rules.pace, ...(rules.twist?.strength ?? [])]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1);
      }
      expect(rules.lives).toBeGreaterThanOrEqual(1);
    }
  });

  it("each have the par in the table, so a change to the engine that reshuffles them shows", () => {
    for (const level of LEVELS) expect([level.id, parFor(level)]).toEqual([level.id, level.par]);
    // Every level played through, so it takes a while, and longer on a busy machine.
  }, 60_000);
});

describe("every level is fair", () => {
  it("can be played perfectly, every ball headed without a knock, for its par", () => {
    for (const { level, round } of perfect) {
      expect([level.id, round.lives]).toEqual([level.id, level.rules.lives]);
      expect(round.headers).toBe(round.footballs);
      expect(round.score).toBe(level.par);
      // The engine's own perfect player agrees.
      expect(playPerfectly(level.rules, decoysOf(level), level.seed).score).toBe(level.par);
    }
  }, 60_000);

  it("always has a jump ready for a hurdle across every lane, if none were wasted", () => {
    for (const { level, tired, items } of perfect) {
      expect([level.id, tired]).toEqual([level.id, 0]);
      expect(items.some((i) => i.kind === "hurdle")).toBe(level.rules.hurdles);
      expect(items.filter((i) => i.outcome === "tripped")).toEqual([]);
    }
  });

  it("leaves a way round every hurdle that can be stepped round", () => {
    for (const { items } of perfect) {
      for (const hurdle of items.filter((h) => h.kind === "hurdle" && (h.lanes?.length ?? 3) < 3)) {
        const free = LANES.filter((lane) => !hurdle.lanes?.includes(lane));
        const near = items.filter(
          (i) => i.kind !== "hurdle" && Math.abs(arrivalOf(i) - arrivalOf(hurdle)) <= ROOM_MS,
        );
        for (const item of near.filter(isHeadable)) expect(free).toContain(item.lane);
        for (const wave of byWave(near)) {
          const unsafe = wave.filter((i) => !isHeadable(i)).map((i) => i.lane);
          expect(free.some((lane) => !unsafe.includes(lane))).toBe(true);
        }
      }
    }
  });

  it("makes the Funfair's high balls cost jumps a player can't spare for a hurdle", () => {
    for (const { level, legs, items } of perfect.filter((p) => p.level.venue === "funfair")) {
      expect([level.id, items.filter(isHigh).length >= 3]).toEqual([level.id, true]);
      if (!level.rules.hurdles) continue;
      // A player who's headed every high ball comes to a hurdle across every lane down to their
      // last jump, so one more spent before it would have tripped them.
      expect([level.id, Math.min(...legs) < 2]).toEqual([level.id, true]);
    }
  });

  it("skies balls from the park's second level on, but never at the Funfair or the Colosseum", () => {
    for (const { level, items } of perfect) {
      const off = level.id === "park-1" || level.venue === "funfair" || level.venue === "colosseum";
      expect([level.id, skies(level.rules)]).toEqual([level.id, !off]);
      // A ball or two on a short level, and a few on a long one.
      const least = off ? 0 : level.rules.roundMs >= 60_000 ? 2 : 1;
      const skied = items.filter(isSkied).length;
      expect([level.id, skied >= least, off ? skied : 0]).toEqual([level.id, true, 0]);
    }
  });

  it("never goes three waves without a ball that can be headed", () => {
    for (const { items } of perfect) {
      let without = 0;
      for (const wave of byWave(items.filter((i) => i.kind !== "hurdle"))) {
        without = wave.some(isHeadable) ? 0 : without + 1;
        expect(without).toBeLessThan(3);
      }
    }
  });
});

describe("medals", () => {
  const summary = (overrides: Partial<Summary>): Summary => ({
    score: 0,
    bestStreak: 0,
    headers: 10,
    footballs: 10,
    accuracy: 1,
    outOfLives: false,
    ...overrides,
  });
  const level = LEVELS[0] as Level;
  const targets = targetsOf(level);

  it("sets silver and gold from par, rounded down to a ten", () => {
    for (const each of LEVELS) {
      const { silver, gold } = targetsOf(each);
      expect(silver % 10).toBe(0);
      expect(gold % 10).toBe(0);
      expect(each.par * 0.2 - silver).toBeGreaterThanOrEqual(0);
      expect(each.par * 0.2 - silver).toBeLessThan(10);
      expect(each.par * 0.4 - gold).toBeGreaterThanOrEqual(0);
      expect(each.par * 0.4 - gold).toBeLessThan(10);
    }
  });

  it("gives bronze for finishing, and silver and gold for the score as well", () => {
    expect(medalFor(level, summary({ score: 0 }))).toBe("bronze");
    expect(medalFor(level, summary({ score: targets.silver }))).toBe("silver");
    expect(medalFor(level, summary({ score: targets.gold }))).toBe("gold");
    expect(medalFor(level, summary({ score: targets.gold, outOfLives: true }))).toBeUndefined();
  });

  it("gives Perfect for every ball headed without a knock", () => {
    expect(isPerfect(level, summary({}), 3)).toBe(true);
    expect(isPerfect(level, summary({ headers: 9 }), 3)).toBe(false);
    expect(isPerfect(level, summary({}), 2)).toBe(false);
  });

  it("lists the medals a run earns that the player hadn't got, for their XP", () => {
    expect(medalsBetween(undefined, "gold")).toEqual(["bronze", "silver", "gold"]);
    expect(medalsBetween("silver", "gold")).toEqual(["gold"]);
    expect(medalsBetween("gold", "silver")).toEqual([]);
    expect(medalsBetween("bronze", undefined)).toEqual([]);
    expect(MEDAL_XP).toEqual({ bronze: 100, silver: 250, gold: 500 });
  });

  it("points the player at the next one to go for", () => {
    expect(nextTarget(level, 0)).toEqual({ medal: "silver", score: targets.silver });
    expect(nextTarget(level, targets.silver)).toEqual({ medal: "gold", score: targets.gold });
    expect(nextTarget(level, targets.gold)).toBeUndefined();
  });

  // A header scores ten times the streak, so a run's score goes with the square of its streaks,
  // and the slips that cost most are spread evenly. These pin down what each medal asks.
  it("gives gold for one slip, wherever it falls, but not for two spread out", () => {
    for (const { level: each, round } of perfect) {
      const balls = round.footballs;
      const { gold } = targetsOf(each);
      for (const at of [0.25, 0.5, 0.75]) {
        const slipped = play(each, new Set([Math.round(balls * at)])).round;
        expect([each.id, at, slipped.score >= gold]).toEqual([each.id, at, true]);
      }
      expect([each.id, play(each, evenly(2, balls)).round.score < gold]).toEqual([each.id, true]);
    }
  }, 60_000);

  it("gives silver for three slips however they're spread, but not for five", () => {
    for (const { level: each, round } of perfect) {
      const balls = round.footballs;
      const { silver } = targetsOf(each);
      expect([each.id, play(each, evenly(3, balls)).round.score >= silver]).toEqual([
        each.id,
        true,
      ]);
      expect([each.id, play(each, evenly(5, balls)).round.score < silver]).toEqual([each.id, true]);
    }
  }, 60_000);

  it("can only be had by finishing with a life left, so a slip that's a miss costs no life", () => {
    const slipped = play(LEVELS[3] as Level, new Set([5, 10, 15])).round;
    expect(slipped.lives).toBe(LEVELS[3]?.rules.lives);
    expect(medalFor(LEVELS[3] as Level, summarise(slipped))).toBeDefined();
  });
});

describe("free play", () => {
  it("is 75 seconds of three lives with hurdles, and the venue's twist, at a firm strength", () => {
    expect(freePlayAt("park").twist).toBeUndefined();
    const moon = freePlayAt("moon");
    expect(moon).toMatchObject({ roundMs: 75_000, lives: 3, hurdles: true, pace: [0, 1] });
    expect(moon.twist).toEqual({ kind: "zap", strength: [0.25, 0.75] });
  });

  it("lets a player who heads every skied ball keep a jump for every hurdle, at every venue", () => {
    let skied = 0;
    for (const venue of VENUES.filter((v) => skies(freePlayAt(v.id)))) {
      for (let seed = 1; seed <= 12; seed++) {
        const rules = freePlayAt(venue.id);
        const free: Level = { ...(levelsAt(venue.id)[0] as Level), rules, seed };
        const { round, tired, items } = play(free);
        expect([venue.id, seed, tired, round.lives]).toEqual([venue.id, seed, 0, rules.lives]);
        expect(round.headers).toBe(round.footballs);
        skied += items.filter(isSkied).length;
      }
    }
    expect(skied).toBeGreaterThan(VENUES.length * 12);
    // Over a hundred whole rounds, so it takes a while, and longer on a busy machine.
  }, 60_000);

  it("lets the player jump but not duck, anywhere, for now: not even at Sunny Park", () => {
    expect(freePlayAt("park").ducks).toBeUndefined();
    expect(freePlayAt("moon").ducks).toBeUndefined();
    for (const level of LEVELS)
      expect([level.id, level.rules.ducks]).toEqual([level.id, undefined]);
  });
});
