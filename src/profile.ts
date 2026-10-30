import { kitById, type KitId } from "./kits";
import type { Level } from "./levels";
import {
  isOwned,
  keyOf,
  type Progress,
  type Reward,
  rewardByKey,
  type RewardKey,
} from "./progression";
import { isLevelOpen, type Records } from "./records";
import { type Team, teamById, type TeamId } from "./teams";
import { venueById, type VenueId } from "./venues";

// What a player has set up and earned, kept in this browser only. Storage can be missing or
// blocked (a private window, cleared site data), so every read and write is guarded and the game
// still works without it, just without remembering anything.

export interface Profile extends Progress {
  readonly name: string;
  readonly number: number;
  readonly kit: KitId;
  readonly venue: VenueId;
  readonly best: number;
  /** Whether they've been through how to play, or skipped it (see game/tutorial.ts). */
  readonly tutored: boolean;
  /** The Serie A club they support, once they've picked one (see teams.ts). */
  readonly team: TeamId | undefined;
}

const KEY = "heads-up:profile";

export const NAME_LENGTH = 14;

export const DEFAULT_PROFILE: Profile = {
  name: "SAM THE MAN",
  number: 8,
  kit: "gold",
  venue: "park",
  xp: 0,
  packed: [],
  best: 0,
  tutored: false,
  team: undefined,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const whole = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value), min), max)
    : fallback;

export const loadProfile = (): Profile => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!isRecord(saved)) return DEFAULT_PROFILE;
    const packed = Array.isArray(saved.packed)
      ? saved.packed.flatMap((key) => {
          const reward = typeof key === "string" ? rewardByKey(key) : undefined;
          return reward ? [keyOf(reward)] : [];
        })
      : [];
    const profile: Profile = {
      name:
        typeof saved.name === "string" ? saved.name.slice(0, NAME_LENGTH) : DEFAULT_PROFILE.name,
      number: whole(saved.number, 1, 99, DEFAULT_PROFILE.number),
      kit: kitById(typeof saved.kit === "string" ? saved.kit : "").id,
      venue: venueById(typeof saved.venue === "string" ? saved.venue : "").id,
      // Profiles from before XP counted stars, which were points in the same way.
      xp: whole(saved.xp ?? saved.stars, 0, Number.MAX_SAFE_INTEGER, 0),
      packed,
      best: whole(saved.best, 0, Number.MAX_SAFE_INTEGER, 0),
      tutored: false,
      team: teamById(saved.team)?.id,
    };
    // Whatever someone was already wearing and playing at stays theirs, even if it's beyond their
    // level now, as it is for players whose kits were all free before.
    const keep = [`kit:${profile.kit}`, `venue:${profile.venue}`] as const satisfies RewardKey[];
    return {
      ...profile,
      // Anyone who's played already knows how, from before there was a tutorial.
      tutored: saved.tutored === true || profile.xp > 0,
      packed: [
        ...profile.packed,
        ...keep.filter((key) => {
          const reward = rewardByKey(key);
          return reward && !isOwned(reward, profile);
        }),
      ],
    };
  } catch {
    return DEFAULT_PROFILE;
  }
};

export const saveProfile = (profile: Profile): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Not remembered this time; the game carries on.
  }
};

/** `?unlocked` in the address opens every kit, venue and level, for demos. */
const unlockAll = (() => {
  try {
    return new URLSearchParams(window.location.search).has("unlocked");
  } catch {
    return false;
  }
})();

/** Whether the player can use a kit or venue: by level, from a pack, or in a demo. */
export const owns = (profile: Profile, reward: Reward): boolean =>
  unlockAll || isOwned(reward, profile);

/** Whether the player can play a level: in order, once the one before has a medal, or in a demo. */
export const canPlay = (records: Records, level: Level): boolean =>
  unlockAll || isLevelOpen(records, level);

/** Supporting a club: its kit on, and theirs to keep from now on, whatever their level. */
export const supports = (profile: Profile, team: Team): Profile => {
  const kit: RewardKey = `kit:${team.kit}`;
  return {
    ...profile,
    team: team.id,
    kit: team.kit,
    packed: profile.packed.includes(kit) ? profile.packed : [...profile.packed, kit],
  };
};
