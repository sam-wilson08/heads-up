import { GHOST, isHigh, isSkimmed, type Round, type RoundEvent } from "./engine";

// What a run left behind besides its score: the score at each second, for the split against a
// best run, and each time the streak broke, for practising the moments that cost most.

/**
 * Why the streak broke. A high ball let go over the head, a ghost ball headed, or a frisbee that
 * wasn't ducked, are their own.
 */
export type Slip = "missed" | "hit" | "tripped" | "zapped" | "overhead" | "ghosted" | "frisbee";

export interface StreakBreak {
  /** Milliseconds into the run. */
  readonly at: number;
  readonly cause: Slip;
  /** The streak it ended. */
  readonly streak: number;
}

export interface Trace {
  /** The score at the end of each whole second: the first after one second, and so on. */
  readonly splits: readonly number[];
  readonly breaks: readonly StreakBreak[];
  /** The lives the player still had at the end. */
  readonly livesLeft: number;
}

/** Why an event broke the streak or cost a life, if it did. */
const slipOf = (event: RoundEvent): { cause: Slip; streak: number } | undefined => {
  switch (event.type) {
    case "missed":
      return event.lostStreak > 0
        ? { cause: isHigh(event.item) ? "overhead" : "missed", streak: event.lostStreak }
        : undefined;
    case "hit":
      return {
        cause:
          event.item.twist?.kind === "zap"
            ? "zapped"
            : event.item.kind === GHOST
              ? "ghosted"
              : "hit",
        streak: event.lostStreak,
      };
    case "tripped":
      return { cause: isSkimmed(event.item) ? "frisbee" : "tripped", streak: event.lostStreak };
    default:
      return undefined;
  }
};

/** Follows a run frame by frame, and says what it left behind at the end. */
export const tracer = () => {
  const splits: number[] = [];
  const breaks: StreakBreak[] = [];
  return {
    /** Notes the round after a frame, and what happened in it. */
    follow: (round: Round, events: readonly RoundEvent[]): void => {
      for (const event of events) {
        const slip = slipOf(event);
        if (slip) breaks.push({ at: round.now, ...slip });
      }
      while (round.now >= (splits.length + 1) * 1000) splits.push(round.score);
    },
    /** The score at the last whole second the run has reached, if it's reached one. */
    latest: (): { second: number; score: number } | undefined => {
      const score = splits.at(-1);
      return score === undefined ? undefined : { second: splits.length, score };
    },
    finish: (round: Round): Trace => ({
      splits: [...splits],
      breaks: [...breaks],
      livesLeft: round.lives,
    }),
  };
};
