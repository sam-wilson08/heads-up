// Wipes what this device has saved, once, since the leaderboard was wiped: the profile, the levels'
// records, and the names it's signed in to, whose players no longer exist. Changing WIPED wipes
// every device again, the next time each opens the game.

const WIPED = "2026-10-27";
/** When this device was last wiped. It's kept through the wipe, or every load would wipe again. */
const KEY = "heads-up:wiped";

/** Wipes what's saved, if this device hasn't been since WIPED. Call it before anything reads it. */
export const wipeSaved = (): void => {
  try {
    if (localStorage.getItem(KEY) === WIPED) return;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("heads-up:") && key !== KEY) localStorage.removeItem(key);
    }
    localStorage.setItem(KEY, WIPED);
  } catch {
    // Storage is blocked, so there's nothing saved to wipe.
  }
};
