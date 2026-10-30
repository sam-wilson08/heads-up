import { type Kit, type KitId, KITS } from "./kits";
import { type Venue, type VenueId, VENUES } from "./venues";

// How players earn kits and venues. Every game earns XP, which builds up through levels, and each
// level unlocks a kit or a venue: the venues are stages, opened only by XP (see levels.ts), so
// each is reached in turn. Every game also ends with a pack that reveals a kit at random, so one
// can turn up long before its level does. Packs used to hold venues too; anyone who won one that
// way keeps it.

/** Something to unlock: a kit or a venue. */
export type Reward =
  { readonly kind: "kit"; readonly kit: Kit } | { readonly kind: "venue"; readonly venue: Venue };

/** How a reward is saved in a profile, like "kit:viola" or "venue:moon". */
export type RewardKey = `kit:${KitId}` | `venue:${VenueId}`;

export const keyOf = (reward: Reward): RewardKey =>
  reward.kind === "kit" ? `kit:${reward.kit.id}` : `venue:${reward.venue.id}`;

export const levelOf = (reward: Reward): number =>
  reward.kind === "kit" ? reward.kit.unlockLevel : reward.venue.unlockLevel;

export const nameOf = (reward: Reward): string =>
  reward.kind === "kit" ? reward.kit.name : reward.venue.name;

export const REWARDS: readonly Reward[] = [
  ...KITS.map((kit): Reward => ({ kind: "kit", kit })),
  ...VENUES.map((venue): Reward => ({ kind: "venue", venue })),
];

/** What a pack can hold: the kits. Venues are stages, opened by XP alone. */
export const PACK_REWARDS: readonly Reward[] = REWARDS.filter((reward) => reward.kind === "kit");

export const rewardByKey = (key: string): Reward | undefined =>
  REWARDS.find((reward) => keyOf(reward) === key);

/**
 * The XP it takes to reach a level from nothing: 50 for level 2, 150 for 3, 300 for 4… Each takes
 * 50 more than the last. That's low, for the testers to unlock everything in a few games; the game
 * as designed took five times as much, 125 * (level - 1) * level.
 */
export const xpForLevel = (level: number): number => 25 * (level - 1) * level;

export const levelFor = (xp: number): number => {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
};

/** How far through their current level a player is, from 0 to 1, for an XP bar. */
export const levelProgress = (xp: number): number => {
  const level = levelFor(xp);
  const from = xpForLevel(level);
  return (xp - from) / (xpForLevel(level + 1) - from);
};

/** What a player has earned: their XP, and what their packs have unlocked. */
export interface Progress {
  readonly xp: number;
  readonly packed: readonly RewardKey[];
}

export const isOwned = (reward: Reward, progress: Progress): boolean =>
  levelOf(reward) <= levelFor(progress.xp) || progress.packed.includes(keyOf(reward));

/** How a pack shows off a reward: the higher the level it unlocks at, the rarer it is. */
export type Rarity = "common" | "rare" | "legendary";

export const rarityOf = (reward: Reward): Rarity => {
  const level = levelOf(reward);
  return level >= 14 ? "legendary" : level >= 8 ? "rare" : "common";
};

/** XP for a game: its score, and a little for playing at all. */
export const xpForGame = (score: number): number => score + 100;

/** A pack gives this much XP instead once there's no kit left to unlock. */
export const PACK_BONUS_XP = 500;

/**
 * Opens a pack: a kit the player doesn't have yet, at random. Each kit's chance goes with one over
 * its level, so the rarer ones turn up less often. Undefined if they have every kit.
 */
export const openPack = (progress: Progress, random: () => number): Reward | undefined => {
  const locked = PACK_REWARDS.filter((reward) => !isOwned(reward, progress));
  const weights = locked.map((reward) => 1 / levelOf(reward));
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [i, reward] of locked.entries()) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return reward;
  }
  return locked.at(-1);
};

export interface GameRewards {
  readonly progress: Progress;
  readonly xp: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  /** What the levels gained unlocked. */
  readonly levelled: readonly Reward[];
  /** What the pack revealed, or undefined if the player had everything and got bonus XP. */
  readonly pack: Reward | undefined;
}

/**
 * Banks a game's XP, with any `bonus` it earned (like a level's medals), then opens its pack. The
 * XP goes in first, so the pack never reveals something the new level has just unlocked anyway.
 */
export const rewardGame = (
  before: Progress,
  score: number,
  random: () => number,
  bonus = 0,
): GameRewards => {
  const xp = xpForGame(score) + bonus;
  const levelled = { ...before, xp: before.xp + xp };
  const pack = openPack(levelled, random);
  const progress = pack
    ? { ...levelled, packed: [...levelled.packed, keyOf(pack)] }
    : { ...levelled, xp: levelled.xp + PACK_BONUS_XP };
  return {
    progress,
    xp,
    levelBefore: levelFor(before.xp),
    levelAfter: levelFor(progress.xp),
    levelled: REWARDS.filter(
      (reward) =>
        !isOwned(reward, before) && isOwned(reward, { ...progress, packed: before.packed }),
    ),
    pack,
  };
};
