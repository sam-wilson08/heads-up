import type { CSSProperties, PointerEvent } from "react";
import { HeartIcon } from "../ui/icons";
import { FITNESS_MAX, JUMP_BACK_MS, LIVES } from "./engine";
import type { Gesture, Input, Lesson } from "./tutorial";
import "./tutorial.css";

// The tutorial over the play (see tutorial.ts). First, a card on how to hold the phone: a thumb to
// tap, anywhere, and the other to swipe; or, with a keyboard, which keys to press. Then what to do,
// near the top, under dots counting the steps; the move while the play waits for it, by touch a
// finger, a tap down in the bottom left, for the left thumb, and a swipe across the player's legs,
// wherever they are, or with the keys the key, pressed over and over; and a way to skip it, unless
// it has to be done. After the last step, a card on the lives and the jumps in the player's legs,
// drawn as the play's own strip draws them; then a card to say they're ready, and the way into a
// real game. With the keys, each card's button has the focus, so Enter presses it: space jumps.

/** So a press on a button isn't also a tap on the pitch, which jumps. */
const own = (event: PointerEvent) => event.stopPropagation();

/** The key for each move. */
const KEYS: Record<Exclude<Gesture, "none">, string> = {
  "swipe-left": "←",
  "swipe-right": "→",
  tap: "Space",
};

export const TutorialHud = ({
  lesson,
  input,
  onGoOn,
  onSkip,
  onPlay,
}: {
  lesson: Lesson;
  input: Input;
  /** Goes on from a card. */
  onGoOn: () => void;
  /** Skips it, if it can be skipped. */
  onSkip: (() => void) | undefined;
  onPlay: () => void;
}) => {
  const keys = input === "keys";
  if (lesson.card === "lives") {
    return (
      <div className="lesson-cover" onPointerDown={own}>
        <div className="lesson-card">
          <h2>Lives and stamina</h2>
          <div className="lesson-rule">
            <span className="lesson-hearts" aria-hidden="true">
              {Array.from({ length: LIVES }, (_, i) => (
                <span key={i} className="life">
                  <HeartIcon />
                </span>
              ))}
            </span>
            <p>
              <strong>{LIVES} lives.</strong> Heading anything but a football, or tripping over a
              hurdle, costs one. Lose them all and the game's over.
            </p>
          </div>
          <div className="lesson-rule">
            <span className="lesson-legs" aria-hidden="true">
              {Array.from({ length: FITNESS_MAX }, (_, i) => (
                <span key={i} className="leg ready">
                  <span style={{ width: "100%" }} />
                </span>
              ))}
            </span>
            <p>
              <strong>{FITNESS_MAX} jumps of stamina.</strong> Each jump uses one, and one comes
              back every {JUMP_BACK_MS / 1000} seconds, so save them for hurdles and high balls.
            </p>
          </div>
          <p>You'll see both at the top, under the score.</p>
          <button type="button" className="button play-button" autoFocus={keys} onClick={onGoOn}>
            Got it ▶
          </button>
        </div>
      </div>
    );
  }
  if (lesson.card === "hold") {
    return (
      <div className="lesson-cover" onPointerDown={own}>
        <div className="lesson-card">
          {keys ? (
            <>
              <h2>Use the keyboard</h2>
              <div className="lesson-keys" aria-hidden="true">
                <span className="lesson-keys-move">
                  <kbd className="keycap">←</kbd>
                  <kbd className="keycap">→</kbd>
                  <small>Move</small>
                </span>
                <span>
                  <kbd className="keycap wide">Space</kbd>
                  <small>Jump</small>
                </span>
              </div>
              <p>Press ← and → to move across, and space to jump.</p>
            </>
          ) : (
            <>
              <h2>Use both thumbs</h2>
              <div className="lesson-phone" aria-hidden="true">
                <span className="lesson-thumb tap" />
                <span className="lesson-thumb swipe" />
                <small className="lesson-thumb-label tap">Jump</small>
                <small className="lesson-thumb-label swipe">Move</small>
              </div>
              <p>
                Tap with one thumb to jump: anywhere on the screen, it doesn't matter where. Swipe
                with the other to move.
              </p>
            </>
          )}
          <button type="button" className="button play-button" autoFocus={keys} onClick={onGoOn}>
            Got it ▶
          </button>
        </div>
      </div>
    );
  }
  if (lesson.done) {
    return (
      <div className="lesson-cover" onPointerDown={own}>
        <div className="lesson-card">
          <h2>You're ready!</h2>
          <p>Head balls in a row to build a streak: each header in it scores more than the last.</p>
          <button type="button" className="button play-button" autoFocus={keys} onClick={onPlay}>
            Play ▶
          </button>
        </div>
      </div>
    );
  }
  const move = lesson.waiting !== "none" ? lesson.waiting : undefined;
  return (
    <>
      <div className="lesson" aria-live="polite">
        <ol className="lesson-steps" aria-label={`Step ${lesson.step + 1} of ${lesson.steps}`}>
          {Array.from({ length: lesson.steps }, (_, i) => (
            <li key={i} className={i < lesson.step ? "done" : i === lesson.step ? "now" : ""} />
          ))}
        </ol>
        <p key={lesson.say} className={`lesson-say ${lesson.feedback ?? ""}`}>
          {lesson.say}
        </p>
      </div>
      {move && keys && (
        <kbd className={`keycap lesson-key ${move === "tap" ? "wide" : ""}`} aria-hidden="true">
          {KEYS[move]}
        </kbd>
      )}
      {move && !keys && (
        <span
          className={`lesson-finger ${move}`}
          style={{ "--lane": lesson.lane } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {onSkip && (
        <button type="button" className="lesson-skip" onPointerDown={own} onClick={onSkip}>
          Skip
        </button>
      )}
    </>
  );
};
