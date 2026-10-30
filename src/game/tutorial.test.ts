import { describe, expect, it } from "vitest";
import { decoyPool, jump, type Lane, pointHead, type Round, step } from "./engine";
import { type Input, type Lesson, tutor, tutorialRound } from "./tutorial";

/** A player who does what they're shown, or nothing at all. */
type Player = (round: Round, lesson: Lesson) => Round;

const follows: Player = (round, lesson) => {
  if (lesson.waiting === "tap") return jump(round);
  if (lesson.waiting === "swipe-left")
    return pointHead(round, Math.max(-1, round.lane - 1) as Lane);
  if (lesson.waiting === "swipe-right")
    return pointHead(round, Math.min(1, round.lane + 1) as Lane);
  return round;
};

const idle: Player = (round) => round;

/** Plays the tutorial at 60 frames a second, for up to `ms` of real time, from its first step. */
const play = (
  player: Player,
  ms: number,
  from = tutorialRound(decoyPool(["pigeon"])),
  input: Input = "touch",
) => {
  const lesson = tutor(input);
  let round = from;
  const said: string[] = [];
  for (let t = 0; t < ms; t += 16) {
    const before = lesson.before(round, 16);
    const result = step(before.round, before.dtMs, () => 0.5);
    lesson.after(result.round, result.events);
    // Reads each card, and goes on.
    if (lesson.lesson(result.round).card) lesson.goOn(result.round);
    round = player(result.round, lesson.lesson(result.round));
    const now = lesson.lesson(round);
    if (said.at(-1) !== now.say) said.push(now.say);
    if (now.done) break;
  }
  return { round, lesson: lesson.lesson(round), said };
};

describe("the tutorial", () => {
  it("takes a player who does as they're shown through every step, without a knock", () => {
    const { round, lesson, said } = play(follows, 60_000);
    expect(lesson.done).toBe(true);
    expect(round.lives).toBe(99);
    // Three headers, a hurdle cleared, a pigeon dodged and a high ball headed.
    expect(round.headers).toBe(4);
    expect(said.filter((s) => s === "Nice!")).toHaveLength(6);
    expect(said).not.toContain("Wait for it, then tap anywhere to jump");
  });

  it("says which keys to press, for someone with a keyboard", () => {
    const { lesson, said } = play(follows, 60_000, undefined, "keys");
    expect(lesson.done).toBe(true);
    expect(said).toContain("Press ← to move across");
    expect(said).toContain("Press → to move back");
    expect(said).toContain("Press space to jump the hurdle");
    expect(said.join(" ")).not.toMatch(/swipe|tap/i);
  });

  it("shows how to hold the phone first, with the clock stopped, until the player's ready", () => {
    const lesson = tutor();
    let round = tutorialRound(decoyPool(["pigeon"]));
    for (let t = 0; t < 5_000; t += 16) {
      const before = lesson.before(round, 16);
      round = step(before.round, before.dtMs, () => 0.5).round;
    }
    expect(lesson.lesson(round).card).toBe("hold");
    expect(round.now).toBe(0);
    expect(round.items).toEqual([]);
    lesson.goOn(round);
    expect(lesson.lesson(round)).toMatchObject({ card: undefined, step: 0 });
  });

  it("explains lives and legs after the last step, with the clock stopped, before it's done", () => {
    const lesson = tutor();
    let round = tutorialRound(decoyPool(["pigeon"]));
    const cards: string[] = [];
    for (let t = 0; t < 60_000; t += 16) {
      const before = lesson.before(round, 16);
      const result = step(before.round, before.dtMs, () => 0.5);
      lesson.after(result.round, result.events);
      round = follows(result.round, lesson.lesson(result.round));
      const card = lesson.lesson(round).card;
      if (card === "hold") lesson.goOn(round);
      if (card === "lives") {
        cards.push(card);
        if (cards.length === 1) {
          const stopped = round.now;
          const later = step(
            lesson.before(round, 16).round,
            lesson.before(round, 16).dtMs,
            () => 0.5,
          );
          expect(later.round.now).toBe(stopped);
          expect(lesson.lesson(round).done).toBe(false);
        }
        lesson.goOn(round);
      }
      if (lesson.lesson(round).done) break;
    }
    expect(cards).toEqual(["lives"]);
    expect(lesson.lesson(round).done).toBe(true);
  });

  it("throws nothing by itself", () => {
    const { round } = play(idle, 900);
    expect(round.items).toEqual([]);
  });

  it("stops the clock with the ball in the air until the player moves", () => {
    const first = play(idle, 8_000);
    expect(first.lesson.step).toBe(1);
    expect(first.lesson.waiting).toBe("swipe-left");
    const later = play(idle, 20_000);
    expect(later.round.now).toBe(first.round.now);
    expect(later.round.items.filter((i) => !i.outcome)).toHaveLength(1);
  });

  it("has a player who gets a step wrong try it again", () => {
    let moved = false;
    // Steps out of the first ball's lane before it lands, then does as they're shown.
    const wanders: Player = (round, lesson) => {
      if (!moved && round.items.length > 0) {
        moved = true;
        return pointHead(round, 1);
      }
      return follows(round, lesson);
    };
    const { lesson, said } = play(wanders, 60_000);
    expect(said).toContain("Stay in its lane to head it");
    expect(lesson.done).toBe(true);
  });
});
