import { describe, expect, it } from "vitest";
import { KITS } from "./kits";
import { LEVELS, STAGES } from "./levels";
import {
  isOwned,
  keyOf,
  levelFor,
  levelOf,
  levelProgress,
  openPack,
  PACK_BONUS_XP,
  PACK_REWARDS,
  type Progress,
  rarityOf,
  type Reward,
  rewardByKey,
  rewardGame,
  REWARDS,
  xpForGame,
  xpForLevel,
} from "./progression";
import { HIDDEN_VENUES, VENUES } from "./venues";

/** A repeatable random source. */
const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
};

const fresh: Progress = { xp: 0, packed: [] };
const everything: Progress = { xp: 0, packed: REWARDS.map(keyOf) };

describe("levels", () => {
  it("starts at level 1, and each level takes 50 XP more than the last", () => {
    expect(levelFor(0)).toBe(1);
    expect([2, 3, 4, 5].map(xpForLevel)).toEqual([50, 150, 300, 500]);
    expect(levelFor(49)).toBe(1);
    expect(levelFor(50)).toBe(2);
    expect(levelFor(499)).toBe(4);
    expect(levelFor(500)).toBe(5);
  });

  it("shows how far through the level a player is", () => {
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress(100)).toBe(0.5);
  });

  it("gives every level from 2 to 20 something to unlock, and nothing at all to start", () => {
    const levels = new Set(REWARDS.map(levelOf));
    for (let level = 2; level <= 20; level++) expect(levels).toContain(level);
    const owned = REWARDS.filter((reward) => isOwned(reward, fresh)).map(keyOf);
    expect(owned).toEqual(["kit:gold", "venue:park"]);
  });

  it("opens the later stages in turn, the Colosseum at 18, each within reach on the XP curve", () => {
    const at = (id: string) => VENUES.find((venue) => venue.id === id)?.unlockLevel;
    expect([at("volcano"), at("mars"), at("colosseum")]).toEqual([13, 15, 18]);
    for (const venue of VENUES) {
      const xp = xpForLevel(venue.unlockLevel);
      expect(Number.isFinite(xp)).toBe(true);
      expect(levelFor(xp)).toBe(venue.unlockLevel);
      expect(isOwned({ kind: "venue", venue }, { xp, packed: [] })).toBe(true);
      // Not a point sooner, but for the park, which is open from the start.
      expect(isOwned({ kind: "venue", venue }, { xp: xp - 1, packed: [] })).toBe(
        venue.unlockLevel === 1,
      );
    }
    // For the testers, the Colosseum's 7,650 XP is a good game or two on from Mars's 5,250.
    expect(xpForLevel(18)).toBe(7_650);
  });

  it("keeps the hidden venues out of the stages, the levels and the unlocks", () => {
    expect([...HIDDEN_VENUES]).toEqual(["space", "funfair", "castle", "final"]);
    for (const id of HIDDEN_VENUES) {
      expect(VENUES.some((venue) => venue.id === id)).toBe(false);
      expect(STAGES.some((stage) => stage.venue === id)).toBe(false);
      expect(LEVELS.some((level) => level.venue === id)).toBe(false);
      expect(REWARDS.some((reward) => reward.kind === "venue" && reward.venue.id === id)).toBe(
        false,
      );
    }
  });

  it("starts with the gold kit and Sunny Park, the defaults", () => {
    expect(KITS[0]?.unlockLevel).toBe(1);
    expect(VENUES[0]?.unlockLevel).toBe(1);
  });

  it("makes the things unlocked later the rarer ones", () => {
    const byLevel = (level: number) => REWARDS.find((reward) => levelOf(reward) === level);
    const rarity = (level: number) => {
      const reward = byLevel(level);
      return reward && rarityOf(reward);
    };
    expect(rarity(2)).toBe("common");
    expect(rarity(9)).toBe("rare");
    expect(rarity(18)).toBe("legendary");
  });
});

describe("packs", () => {
  it("only ever reveals a kit the player doesn't have", () => {
    const random = seeded(4);
    let progress = fresh;
    const revealed: Reward[] = [];
    for (;;) {
      const reward = openPack(progress, random);
      if (!reward) break;
      expect(isOwned(reward, progress)).toBe(false);
      expect(reward.kind).toBe("kit");
      revealed.push(reward);
      progress = { ...progress, packed: [...progress.packed, keyOf(reward)] };
    }
    expect(revealed).toHaveLength(KITS.length - 1);
    expect(new Set(revealed.map(keyOf)).size).toBe(revealed.length);
  });

  it("has nothing left to reveal once the player has everything", () => {
    expect(openPack(everything, seeded(1))).toBeUndefined();
  });

  it("never holds a venue: they're stages, opened by XP alone", () => {
    expect(PACK_REWARDS.map(keyOf)).toEqual(KITS.map((kit) => `kit:${kit.id}`));
    const random = seeded(3);
    for (let i = 0; i < 500; i++) expect(openPack(fresh, random)?.kind).toBe("kit");
  });

  it("has nothing left once every kit is owned, even with stages still to open", () => {
    const kits: Progress = { xp: 0, packed: KITS.map((kit) => `kit:${kit.id}` as const) };
    expect(openPack(kits, seeded(1))).toBeUndefined();
    const rewards = rewardGame(kits, 100, seeded(1));
    expect(rewards.pack).toBeUndefined();
    expect(rewards.progress.xp).toBe(xpForGame(100) + PACK_BONUS_XP);
  });

  it("lets a player keep a venue an old pack gave them", () => {
    const moon = rewardByKey("venue:moon");
    if (!moon) throw new Error("No Moon");
    expect(isOwned(moon, { xp: 0, packed: ["venue:moon"] })).toBe(true);
    expect(isOwned(moon, fresh)).toBe(false);
  });

  it("reveals the rarer things less often", () => {
    const random = seeded(9);
    const counts = new Map<number, number>();
    for (let i = 0; i < 4000; i++) {
      const reward = openPack(fresh, random);
      if (reward) counts.set(levelOf(reward), (counts.get(levelOf(reward)) ?? 0) + 1);
    }
    expect(counts.get(2) ?? 0).toBeGreaterThan((counts.get(19) ?? 0) * 4);
    expect(counts.get(19) ?? 0).toBeGreaterThan(0);
  });

  it("finds saved rewards by their keys, and nothing for an unknown one", () => {
    const moon = rewardByKey("venue:moon");
    expect(moon?.kind === "venue" && moon.venue.name).toBe("The Moon");
    expect(rewardByKey("kit:nonsense")).toBeUndefined();
  });
});

describe("after a game", () => {
  it("banks the score and a little for playing as XP", () => {
    expect(xpForGame(1240)).toBe(1340);
    const rewards = rewardGame(fresh, 1240, seeded(2));
    expect(rewards.xp).toBe(1340);
    expect(rewards.progress.xp).toBe(1340);
  });

  it("lists what the new levels unlocked, separately from the pack", () => {
    const rewards = rewardGame(fresh, 200, seeded(2));
    expect(rewards.levelBefore).toBe(1);
    expect(rewards.levelAfter).toBe(4);
    expect(rewards.levelled.map(levelOf).sort((a, b) => a - b)).toEqual([2, 3, 4]);
    expect(rewards.pack && rewards.levelled.map(keyOf)).not.toContain(
      rewards.pack && keyOf(rewards.pack),
    );
  });

  it("opens a pack after the XP is in, so it never reveals what the level just unlocked", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rewards = rewardGame(fresh, 200, seeded(seed));
      expect(rewards.pack && levelOf(rewards.pack)).toBeGreaterThan(4);
      expect(rewards.progress.packed).toEqual(rewards.pack ? [keyOf(rewards.pack)] : []);
    }
  });

  it("banks a level's medal XP with the game's", () => {
    const rewards = rewardGame(fresh, 1000, seeded(2), 350);
    expect(rewards.xp).toBe(xpForGame(1000) + 350);
    expect(rewards.progress.xp).toBe(xpForGame(1000) + 350);
  });

  it("gives bonus XP instead of a pack once the player has everything", () => {
    const rewards = rewardGame(everything, 0, seeded(1));
    expect(rewards.pack).toBeUndefined();
    expect(rewards.progress.xp).toBe(xpForGame(0) + PACK_BONUS_XP);
  });
});
