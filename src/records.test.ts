import { afterEach, describe, expect, it, vi } from "vitest";
import { type Item, newRound, type Round, type RoundEvent, type Summary } from "./game/engine";
import { type Trace, tracer } from "./game/trace";
import { type Level, levelsAt, targetsOf } from "./levels";
import {
  isLevelOpen,
  loadRecords,
  medalsAt,
  recordRun,
  type Records,
  saveRecords,
} from "./records";

const level = levelsAt("moon")[1] as Level;
const targets = targetsOf(level);
const trace = (overrides: Partial<Trace> = {}): Trace => ({
  splits: [10, 20, 30],
  breaks: [],
  livesLeft: 2,
  ...overrides,
});
const summary = (score: number, overrides: Partial<Summary> = {}): Summary => ({
  score,
  bestStreak: 5,
  headers: 9,
  footballs: 10,
  accuracy: 0.9,
  outOfLives: false,
  ...overrides,
});

describe("a level's record", () => {
  it("earns each medal's XP the first time it's reached, and never again", () => {
    const first = recordRun({}, level, summary(targets.silver), trace());
    expect(first.run).toMatchObject({
      medal: "silver",
      earned: ["bronze", "silver"],
      bonusXp: 350,
    });
    const again = recordRun(first.records, level, summary(targets.silver + 10), trace());
    expect(again.run).toMatchObject({ medal: "silver", earned: [], bonusXp: 0, newBest: true });
    const gold = recordRun(again.records, level, summary(targets.gold), trace());
    expect(gold.run).toMatchObject({ earned: ["gold"], bonusXp: 500 });
  });

  it("keeps the best score, its splits and the best medal through a worse run", () => {
    const good = recordRun({}, level, summary(targets.gold), trace({ splits: [5, 50] })).records;
    const { records, run } = recordRun(good, level, summary(10, { outOfLives: true }), trace());
    expect(run).toMatchObject({ medal: undefined, newBest: false, earned: [] });
    expect(records[level.id]).toEqual({
      best: targets.gold,
      splits: [5, 50],
      par: level.par,
      medal: "gold",
      perfect: false,
      plays: 2,
    });
  });

  it("marks a Perfect run, and remembers it", () => {
    const perfect = summary(level.par, { headers: 10 });
    const first = recordRun({}, level, perfect, trace({ livesLeft: level.rules.lives }));
    expect(first.run).toMatchObject({ perfect: true, firstPerfect: true });
    const next = recordRun(first.records, level, summary(5), trace());
    expect(next.records[level.id]?.perfect).toBe(true);
  });

  it("opens a stage's first level, and each after once the one before has a medal", () => {
    const [one, two, three] = levelsAt("beach") as Level[];
    if (!one || !two || !three) throw new Error("No beach levels");
    expect(isLevelOpen({}, one)).toBe(true);
    expect(isLevelOpen({}, two)).toBe(false);
    const records: Records = {
      [one.id]: { best: 1, splits: [], medal: "bronze", perfect: false, plays: 1 },
    };
    expect(isLevelOpen(records, two)).toBe(true);
    expect(isLevelOpen(records, three)).toBe(false);
    expect(medalsAt(records, "beach")).toEqual({ won: 1, of: 12 });
  });
});

describe("saving records", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads back what it saved, and skips anything it can't read", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    const { records } = recordRun({}, level, summary(targets.gold), trace());
    saveRecords(records);
    expect(loadRecords()).toEqual(records);
    store.set("heads-up:levels", JSON.stringify({ a: { best: "x", medal: "platinum" }, b: 7 }));
    expect(loadRecords()).toEqual({ a: { best: 0, splits: [], perfect: false, plays: 0 } });
    store.set("heads-up:levels", "{");
    expect(loadRecords()).toEqual({});
  });

  it("keeps medals, Perfect and plays when a level's run changes, but lets its best go", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    const [first, , third] = levelsAt("park") as Level[];
    if (!first || !third) throw new Error("No park levels");
    const old = { best: 9000, splits: [10, 20], medal: "gold", perfect: true, plays: 4 };
    store.set(
      "heads-up:levels",
      JSON.stringify({
        // Saved before records kept their par, on a level that's skied balls since.
        [level.id]: old,
        // And on one that hasn't, so it still plays the same run.
        [first.id]: old,
        // Saved on a run with another par.
        [third.id]: { ...old, par: third.par + 10 },
      }),
    );
    const { medal, perfect, plays } = old;
    const loaded = loadRecords();
    expect(loaded[level.id]).toEqual({
      best: 0,
      splits: [],
      par: level.par,
      medal,
      perfect,
      plays,
    });
    expect(loaded[first.id]).toEqual({ ...old, par: first.par });
    expect(loaded[third.id]).toEqual({
      best: 0,
      splits: [],
      par: third.par,
      medal,
      perfect,
      plays,
    });
    expect(isLevelOpen(loaded, levelsAt("moon")[2] as Level)).toBe(true);
  });

  it("gets by without storage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadRecords()).toEqual({});
    expect(() => saveRecords({})).not.toThrow();
  });
});

describe("a run's trace", () => {
  const ball: Item = { id: 1, kind: "ball", lane: 0, launchedAt: 0, flightMs: 1000 };
  const at = (now: number, score: number): Round => ({ ...newRound(), now, score });

  it("notes the score at each whole second, even over a long frame", () => {
    const trace = tracer();
    trace.follow(at(500, 10), []);
    expect(trace.latest()).toBeUndefined();
    trace.follow(at(1000, 20), []);
    trace.follow(at(3100, 50), []);
    expect(trace.latest()).toEqual({ second: 3, score: 50 });
    expect(trace.finish(at(3100, 50)).splits).toEqual([20, 50, 50]);
  });

  it("notes where the streak broke, and why, but not a miss with no streak to lose", () => {
    const trace = tracer();
    const events: RoundEvent[] = [
      { type: "missed", item: ball, lostStreak: 0 },
      { type: "missed", item: ball, lostStreak: 4 },
      { type: "hit", item: { ...ball, twist: { kind: "zap", at: 0.3 } }, lostStreak: 2, lives: 2 },
      { type: "tripped", item: { ...ball, kind: "hurdle" }, lostStreak: 0, lives: 1 },
    ];
    trace.follow(at(2000, 0), events);
    expect(trace.finish({ ...at(2000, 0), lives: 1 }).breaks).toEqual([
      { at: 2000, cause: "missed", streak: 4 },
      { at: 2000, cause: "zapped", streak: 2 },
      { at: 2000, cause: "tripped", streak: 0 },
    ]);
  });
});
