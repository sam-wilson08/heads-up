import { leanAt, leans } from "./schedule";
import type { TwistRule } from "./twist";
import { PLAIN, type TwistContext, type TwistView } from "./view";

// The Leaning Tower: every so often the whole screen creaks, jolting towards one side, then leans
// over that way as the tower does, holds there a few seconds and rights itself. It mostly goes the
// other way the next time. Nothing in the air changes lane: it's the player's view that's knocked
// off level, lanes and all, while they keep heading and dodging. The scene turns the camera (see
// ../scene.ts). For a player who's asked for less motion, the screen stays level.

export const pisa = (context: TwistContext, rule: TwistRule): TwistView => {
  const { rules, seed, calm } = context;
  if (rule.kind !== "lean" || calm) return PLAIN;
  const tips = leans(rule, rules.roundMs, seed);
  return {
    dress: () => undefined,
    update: () => undefined,
    lean: (round) => leanAt(tips, round.now),
    warmUp: [],
    dispose: () => undefined,
  };
};
