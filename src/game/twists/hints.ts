import { GHOST, isSkied, type Round, type Rules, skies } from "../engine";
import { dims, dragons, flares, leans } from "./schedule";
import type { TwistKind } from "./twist";

// What the game shouts the first time a round's twist turns up, so it teaches itself.

export const HINTS: Readonly<Record<TwistKind, string>> = {
  zap: "Green ball? Don't head it!",
  breeze: "Watch the wind!",
  snow: "Ball or snowball? Wait and see!",
  sway: "Follow the shadows!",
  bombs: "Stay off the glowing ring!",
  dust: "Dust devils hide the ball!",
  warp: "Blue portal shows where it lands!",
  bounce: "Jump for it!",
  haunt: "Who turned off the lights?",
  flare: "Flare!",
  verdict: "👍 head green · 👎 head red!",
  lean: "Hold on, it's leaning!",
  gale: "Watch the blossom blow!",
};

/** The castle's ghost balls get a shout of their own, the first time one comes. */
export const GHOST_HINT = "No shadow? It's a ghost!";

/** Sakura Peak's dragon gets one too, the first time it flies across. */
export const DRAGON_HINT = "Dragon! Watch for balls behind it!";

/** So does the first skied ball, at any venue that skies them, since they're the base game's. */
export const SKIED_HINT = "High ball! Jump!";

/** Whether a twist turns up from kick-off, rather than on something thrown. */
export const fromKickOff = (kind: TwistKind): boolean =>
  kind === "sway" || kind === "dust" || kind === "verdict";

/** A shout, and whether it's due yet in a round as it stands. */
export interface Hint {
  readonly text: string;
  due(round: Round): boolean;
}

/**
 * The shouts a round's twist teaches itself with, each the first time it's due: when it first
 * turns up on something thrown, from kick-off, or with the first warning of something that comes
 * and goes, like an invader running on with a flare, the candles guttering, the screen creaking
 * before it leans or the wizard winding up a spell. The castle's ghost
 * balls have one too, as does Sakura Peak's dragon, and so do skied balls, wherever balls are skied.
 */
export const hintsFor = (rules: Rules, seed: number): readonly Hint[] => [
  ...twistHintsFor(rules, seed),
  ...(skies(rules) ? [{ text: SKIED_HINT, due: (round: Round) => round.items.some(isSkied) }] : []),
];

const twistHintsFor = (rules: Rules, seed: number): readonly Hint[] => {
  const rule = rules.twist;
  if (!rule) return [];
  const text = HINTS[rule.kind];
  const from = (warnings: readonly { readonly warnFrom: number }[]): Hint => ({
    text,
    due: (round) => warnings[0] !== undefined && round.now >= warnings[0].warnFrom,
  });
  switch (rule.kind) {
    case "flare":
      return [from(flares(rule, rules.roundMs, seed))];
    case "lean":
      return [from(leans(rule, rules.roundMs, seed))];
    case "gale": {
      const first = dragons(rule, rules.roundMs, seed)[0];
      return [
        {
          text,
          due: (round) => round.items.some((i) => i.twist !== undefined),
        },
        {
          text: DRAGON_HINT,
          due: (round) => first !== undefined && round.now >= first.warnFrom + 1500,
        },
      ];
    }
    case "haunt":
      return [
        from(dims(rule, rules.roundMs, seed)),
        { text: GHOST_HINT, due: (round) => round.items.some((i) => i.kind === GHOST) },
      ];
    default:
      return [
        {
          text,
          due: (round) =>
            round.items.some(
              (i) => i.twist !== undefined || (fromKickOff(rule.kind) && i.kind !== "hurdle"),
            ),
        },
      ];
  }
};
