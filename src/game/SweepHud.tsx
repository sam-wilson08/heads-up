import { arrivalOf, hasSweeps, type Round, sweptFrom } from "./engine";
import { Flash, sameWarning, type Warning } from "./VerdictHud";

// On Sakura Peak, a flash along the bottom of the screen on the side a ninja's staff is about to
// sweep in from, as the Colosseum warns of its spears (see VerdictHud.tsx). It only reaches the
// lane on that side.

/**
 * How long before a staff arrives its flash quickens: the moment to jump it, so the player's in the
 * air when it comes, however quickly they react.
 */
const NEAR_MS = 550;

export interface Sweeps {
  readonly left: Warning | undefined;
  readonly right: Warning | undefined;
}

/** What's on the screen on Sakura Peak as a round stands, or undefined anywhere else. */
export const sweepsOf = (round: Round): Sweeps | undefined => {
  if (!hasSweeps(round.rules)) return undefined;
  const staffs = round.items
    .filter((i) => i.kind === "hurdle" && !i.outcome)
    .sort((a, b) => arrivalOf(a) - arrivalOf(b));
  const from = (side: -1 | 1): Warning | undefined => {
    const staff = staffs.find((s) => sweptFrom(s) === side);
    return (
      staff && {
        reach: staff.lanes?.length ?? 3,
        near: arrivalOf(staff) - round.now <= NEAR_MS,
      }
    );
  };
  return { left: from(-1), right: from(1) };
};

/** Whether two moments look the same on the screen, so it needn't be drawn again. */
export const sameSweeps = (a: Sweeps | undefined, b: Sweeps | undefined): boolean =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    sameWarning(a.left, b.left) &&
    sameWarning(a.right, b.right));

export const SweepHud = ({ sweeps }: { sweeps: Sweeps }) => (
  <>
    <Flash side="left" warning={sweeps.left} staff />
    <Flash side="right" warning={sweeps.right} staff />
  </>
);
