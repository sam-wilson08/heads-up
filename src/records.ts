import { skies, type Summary } from "./game/engine";
import type { Trace } from "./game/trace";
import {
  isPerfect,
  type Level,
  levelById,
  levelsAt,
  type Medal,
  MEDAL_XP,
  medalFor,
  MEDALS,
  medalsBetween,
} from "./levels";
import type { VenueId } from "./venues";

// What a player has done on each level: their best score and its splits, and the best medal.
// Kept in this browser, apart from the profile, under a key of its own, and guarded the same way:
// without storage the levels still play, they just aren't remembered.
//
// A level's run can change, as every level that skies balls did when skied balls came in. Medals,
// Perfect and plays are kept, since they were won fair and square and the medals open the levels
// after. But the best score and its splits are let go, since they're for a run that's no longer
// played: the split would be against the wrong balls, and the best could be out of reach.

export interface LevelRecord {
  readonly best: number;
  /** The best run's score at the end of each second, for the split against it. */
  readonly splits: readonly number[];
  /** The level's par when the record was kept, which says which run the best was set on. */
  readonly par?: number;
  readonly medal?: Medal;
  readonly perfect: boolean;
  readonly plays: number;
}

export type Records = Readonly<Partial<Record<string, LevelRecord>>>;

const KEY = "heads-up:levels";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

/**
 * A saved record, if it reads as one, for `level` as it now plays: without its best and splits if
 * they were set on a run the level no longer plays. One saved without a par was saved before balls
 * were skied, so it's from the same run only where the level skies none.
 */
const recordFrom = (saved: unknown, level: Level | undefined): LevelRecord | undefined => {
  if (!isRecord(saved)) return undefined;
  const medal = MEDALS.find((m) => m === saved.medal);
  const par = typeof saved.par === "number" ? saved.par : level && !skies(level.rules) && level.par;
  const same = !level || par === level.par;
  return {
    best: same ? count(saved.best) : 0,
    splits: same && Array.isArray(saved.splits) ? saved.splits.map(count) : [],
    ...(level ? { par: level.par } : {}),
    ...(medal ? { medal } : {}),
    perfect: saved.perfect === true,
    plays: count(saved.plays),
  };
};

export const loadRecords = (): Records => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!isRecord(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).flatMap(([id, value]) => {
        const record = recordFrom(value, levelById(id));
        return record ? [[id, record]] : [];
      }),
    );
  } catch {
    return {};
  }
};

export const saveRecords = (records: Records): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Not remembered this time; the game carries on.
  }
};

/** What a level run earned, besides the XP every game does. */
export interface LevelRun {
  readonly level: Level;
  readonly medal: Medal | undefined;
  /** Medals reached on this level for the first time, each worth its XP. */
  readonly earned: readonly Medal[];
  readonly perfect: boolean;
  /** Whether it's the first Perfect on this level. */
  readonly firstPerfect: boolean;
  readonly bonusXp: number;
  /** The record before this run, if the level had been played. */
  readonly before: LevelRecord | undefined;
  readonly newBest: boolean;
  readonly trace: Trace;
}

/** Notes a finished level run in the records, and works out what it earned. */
export const recordRun = (
  records: Records,
  level: Level,
  summary: Summary,
  trace: Trace,
): { readonly records: Records; readonly run: LevelRun } => {
  const before = records[level.id];
  const medal = medalFor(level, summary);
  const earned = medalsBetween(before?.medal, medal);
  const perfect = isPerfect(level, summary, trace.livesLeft);
  const newBest = !before || summary.score > before.best;
  const best = before && !newBest ? before : { best: summary.score, splits: trace.splits };
  const kept = before?.medal && (!medal || MEDALS.indexOf(before.medal) > MEDALS.indexOf(medal));
  const top = kept ? before.medal : medal;
  const record: LevelRecord = {
    best: best.best,
    splits: best.splits,
    par: level.par,
    ...(top ? { medal: top } : {}),
    perfect: perfect || (before?.perfect ?? false),
    plays: (before?.plays ?? 0) + 1,
  };
  return {
    records: { ...records, [level.id]: record },
    run: {
      level,
      medal,
      earned,
      perfect,
      firstPerfect: perfect && !before?.perfect,
      bonusXp: earned.reduce((sum, m) => sum + MEDAL_XP[m], 0),
      before,
      newBest: newBest && summary.score > 0,
      trace,
    },
  };
};

/** Whether a level can be played: the first of a stage always, the rest once the one before has a medal. */
export const isLevelOpen = (records: Records, level: Level): boolean => {
  if (level.number === 1) return true;
  const before = levelsAt(level.venue)[level.number - 2];
  return Boolean(before && records[before.id]?.medal);
};

/** How many medals a stage's levels have, out of how many there are to win. */
export const medalsAt = (records: Records, venue: VenueId): { won: number; of: number } => {
  const levels = levelsAt(venue);
  const won = levels.reduce((sum, level) => {
    const medal = records[level.id]?.medal;
    return sum + (medal ? MEDALS.indexOf(medal) + 1 : 0);
  }, 0);
  return { won, of: levels.length * MEDALS.length };
};
