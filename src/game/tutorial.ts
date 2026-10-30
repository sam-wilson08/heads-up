import {
  arrivalOf,
  type Decoy,
  type Item,
  JUMP_MS,
  type Lane,
  LANES,
  newRound,
  type Round,
  type RoundEvent,
  type Rules,
} from "./engine";

// How to play, a step at a time, at Sunny Park. First, with the clock stopped, how to hold the
// phone: one thumb to swipe and the other to tap, anywhere; or, with a keyboard, which keys to
// press. Then each step says what to do and throws one thing to do it to: a ball in the player's
// lane, then to either side, a hurdle, a pigeon and a high ball. Last, with the clock stopped
// again, the lives and the jumps in the player's legs, which the tutorial doesn't count.
// The round is the game's own, so it plays and looks just as a real one does, but nothing's thrown
// by itself, and as each thing nears the player the clock stops, the thing hanging in the air,
// until they make the move: then the clock runs on and they see it work. Get one wrong and that
// step comes round again. There's no failing it, and no lives to lose.

/**
 * What the tutorial shows how to do: which way to move, or a jump. By touch, a finger drags one way
 * or taps; with the keys, it's ← or →, or space.
 */
export type Gesture = "swipe-left" | "swipe-right" | "tap" | "none";

/** How the player plays: by touch, or with the keys (see controls.ts). */
export type Input = "touch" | "keys";

/** What a step says, by touch and with the keys. */
type Words = Readonly<Record<Input, string>>;

/** The same either way. */
const both = (text: string): Words => ({ touch: text, keys: text });

/** What the tutorial shows with the clock stopped: how to hold the phone, or lives and legs. */
export type Card = "hold" | "lives";

/** What the tutorial has to say at a moment. */
export interface Lesson {
  /** Which step it's on, from 0, and how many there are. */
  readonly step: number;
  readonly steps: number;
  /** What to do, or how the last try went. */
  readonly say: string;
  /** The move it's waiting for, with the clock stopped, if it is. */
  readonly waiting: Gesture | undefined;
  /** The lane the player's in, for showing a swipe at their feet. */
  readonly lane: Lane;
  /** How the last try went, while that's being said. */
  readonly feedback: "nice" | "again" | undefined;
  /**
   * A card it's showing, with the clock stopped, if it is: how to hold the phone, before the first
   * step, or the lives and the legs, after the last.
   */
  readonly card: Card | undefined;
  /** Whether every step's been done. */
  readonly done: boolean;
}

/**
 * The tutorial's rules: a clock that won't run out, lives that won't, and hurdles and high balls
 * there to be thrown, though only the tutorial throws anything (see tutorialRound).
 */
export const TUTORIAL_RULES: Rules = {
  roundMs: 3_600_000,
  pace: [0, 0],
  lives: 99,
  hurdles: true,
  skied: true,
};

/** A round for the tutorial: the game's own, with nothing to come unless the tutorial throws it. */
export const tutorialRound = (decoys: readonly [Decoy, ...Decoy[]]): Round => ({
  ...newRound(decoys, TUTORIAL_RULES),
  nextLaunchAt: Infinity,
  nextHurdleAt: Infinity,
});

/** How long each thing takes to reach the player: slow, as a round's easiest are. */
const FLIGHT_MS = 1900;
/** How long a step's said before its thing's thrown, and how its result's said after. */
const BEFORE_MS = 1100;
const AFTER_MS = 900;
/**
 * How long before its thing arrives a step waits for the move: in good time to move across, or,
 * for a jump, half a jump, so a jump started then is at its height as it arrives.
 */
const WAIT = { move: 800, jump: JUMP_MS / 2 } as const;

/** What a step throws: its kind and lane, and whether it's skied or a hurdle across every lane. */
type Throw = Pick<Item, "kind" | "lane"> & Partial<Pick<Item, "lanes" | "skied">>;

interface Step {
  readonly say: Words;
  /** What's said when it's to be tried again. */
  readonly again: Words;
  readonly gesture: (round: Round, item: Item) => Gesture;
  readonly throws: (round: Round) => Throw;
  /** How long before it arrives the clock stops for the move, if it does. */
  readonly waitMs?: number;
  /** Whether the player's made the move. */
  readonly made: (round: Round, item: Item) => boolean;
  /** What happens to the thing when the move's right. */
  readonly passes: RoundEvent["type"];
}

const jumped = (round: Round, item: Item) => round.jumpedAt >= item.launchedAt;

const STEPS: readonly Step[] = [
  {
    say: both("Stay under the ball to head it"),
    again: both("Stay in its lane to head it"),
    gesture: () => "none",
    throws: (round) => ({ kind: "ball", lane: round.lane }),
    made: () => true,
    passes: "header",
  },
  {
    say: { touch: "Swipe left to move across", keys: "Press ← to move across" },
    again: { touch: "Swipe left, under the ball", keys: "Press ←, under the ball" },
    gesture: () => "swipe-left",
    throws: () => ({ kind: "ball", lane: -1 }),
    waitMs: WAIT.move,
    made: (round, item) => round.lane === item.lane,
    passes: "header",
  },
  {
    say: { touch: "Swipe right to move back", keys: "Press → to move back" },
    again: { touch: "Swipe right, under the ball", keys: "Press →, under the ball" },
    gesture: () => "swipe-right",
    throws: () => ({ kind: "ball", lane: 0 }),
    waitMs: WAIT.move,
    made: (round, item) => round.lane === item.lane,
    passes: "header",
  },
  {
    say: { touch: "Tap anywhere to jump the hurdle", keys: "Press space to jump the hurdle" },
    again: {
      touch: "Wait for it, then tap anywhere to jump",
      keys: "Wait for it, then press space to jump",
    },
    gesture: () => "tap",
    throws: () => ({ kind: "hurdle", lane: 0, lanes: LANES }),
    waitMs: WAIT.jump,
    made: jumped,
    passes: "cleared",
  },
  {
    say: both("Don't head the pigeon! Move out of its way"),
    again: {
      touch: "Only head footballs: swipe away from it",
      keys: "Only head footballs: press ← or → to get away from it",
    },
    // Towards the middle, or out of it to the right.
    gesture: (_, item) => (item.lane === 1 ? "swipe-left" : "swipe-right"),
    throws: (round) => ({ kind: "pigeon", lane: round.lane }),
    waitMs: WAIT.move,
    made: (round, item) => round.lane !== item.lane,
    passes: "dodged",
  },
  {
    say: {
      touch: "A high ball! Tap anywhere to jump and head it",
      keys: "A high ball! Press space to jump and head it",
    },
    again: {
      touch: "Wait for it, then tap anywhere to jump up to it",
      keys: "Wait for it, then press space to jump up to it",
    },
    gesture: () => "tap",
    throws: (round) => ({ kind: "ball", lane: round.lane, skied: true }),
    waitMs: WAIT.jump,
    made: jumped,
    passes: "header",
  },
];

/** Where a lesson's got to. */
type Phase =
  | { readonly at: "card"; readonly card: Card }
  | { readonly at: "saying"; readonly since: number }
  | { readonly at: "flying"; readonly item: Item }
  | { readonly at: "said"; readonly since: number; readonly well: boolean }
  | { readonly at: "done" };

export interface Tutor {
  /**
   * Throws the step's thing, if it's time, and says how far the clock may run this frame: not
   * past where the step's waiting for the move.
   */
  before(round: Round, dtMs: number): { round: Round; dtMs: number };
  /** Moves the lesson on by what happened this frame. */
  after(round: Round, events: readonly RoundEvent[]): void;
  lesson(round: Round): Lesson;
  /** Goes on from a card: from how to hold the phone to the first step, or from lives and legs to
   * the end. */
  goOn(round: Round): void;
}

/** A lesson, from how to hold the phone, or which keys to press, in words for how they play. */
export const tutor = (input: Input = "touch"): Tutor => {
  let index = 0;
  let phase: Phase = { at: "card", card: "hold" };
  const current = () => STEPS[index];

  /** When the step stops the clock for the move, if it does and it's not been made. */
  const waitsAt = (round: Round, step: Step, item: Item) =>
    step.waitMs !== undefined && !step.made(round, item) ? arrivalOf(item) - step.waitMs : Infinity;

  return {
    before: (round, dtMs) => {
      if (phase.at === "card") return { round, dtMs: 0 };
      const step = current();
      if (!step) return { round, dtMs };
      if (phase.at === "saying" && round.now - phase.since >= BEFORE_MS) {
        const thrown: Throw = step.throws(round);
        const item: Item = {
          ...thrown,
          id: round.nextId,
          launchedAt: round.now,
          flightMs: thrown.kind === "hurdle" ? FLIGHT_MS * 1.15 : FLIGHT_MS,
        };
        phase = { at: "flying", item };
        return {
          round: { ...round, items: [...round.items, item], nextId: round.nextId + 1 },
          dtMs,
        };
      }
      if (phase.at === "flying") {
        const stop = waitsAt(round, step, phase.item);
        return { round, dtMs: Math.min(dtMs, Math.max(0, stop - round.now)) };
      }
      return { round, dtMs };
    },

    after: (round, events) => {
      const step = current();
      if (!step) return;
      if (phase.at === "flying") {
        const { item } = phase;
        const event = events.find((e) => e.item.id === item.id);
        if (event) phase = { at: "said", since: round.now, well: event.type === step.passes };
      } else if (phase.at === "said" && round.now - phase.since >= AFTER_MS) {
        if (phase.well) index++;
        phase =
          index < STEPS.length ? { at: "saying", since: round.now } : { at: "card", card: "lives" };
      }
    },

    lesson: (round) => {
      const step = current();
      const base = {
        step: Math.min(index, STEPS.length - 1),
        steps: STEPS.length,
        lane: round.lane,
        card: undefined,
        done: false,
      };
      if (phase.at === "card") {
        return { ...base, say: "", waiting: undefined, feedback: undefined, card: phase.card };
      }
      if (!step || phase.at === "done") {
        return { ...base, say: "", waiting: undefined, feedback: undefined, done: true };
      }
      if (phase.at === "said") {
        return {
          ...base,
          say: phase.well ? "Nice!" : step.again[input],
          waiting: undefined,
          feedback: phase.well ? "nice" : "again",
        };
      }
      const waiting =
        phase.at === "flying" && round.now >= waitsAt(round, step, phase.item)
          ? step.gesture(round, phase.item)
          : undefined;
      return { ...base, say: step.say[input], waiting, feedback: undefined };
    },

    goOn: (round) => {
      if (phase.at !== "card") return;
      phase = phase.card === "hold" ? { at: "saying", since: round.now } : { at: "done" };
    },
  };
};
