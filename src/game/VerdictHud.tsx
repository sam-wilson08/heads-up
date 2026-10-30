import { arrivalOf, type Item, type Lane, type Round } from "./engine";
import { type Thumb, verdictAt, WANTED } from "./twists/twist";
import "./verdict.css";

// At the Colosseum, what's on the screen over the play: the emperor's verdict, which says which
// colour of ball to head, and a flash down the side of the screen a spear's coming from, as wide
// as the lanes it reaches. The emperor gives his verdict in the arena too (see twists/colosseum.ts),
// but he's a long way off, on a phone.

/** How long before the emperor turns his thumb over the badge starts to shake, as a warning. */
const TURNING_MS = 900;
/** How long before a spear arrives its flash quickens: the last moment to step aside or duck. */
const NEAR_MS = 700;

/**
 * The next spear from one side, or on Sakura Peak a ninja's staff (see SweepHud.tsx): how many lanes
 * it reaches, and whether it's nearly there.
 */
export interface Warning {
  readonly reach: number;
  readonly near: boolean;
}

export interface Verdict {
  readonly thumb: Thumb;
  /** Whether he's about to turn his thumb over. */
  readonly turning: boolean;
  readonly left: Warning | undefined;
  readonly right: Warning | undefined;
}

/** What's on the screen at the Colosseum as a round stands, or undefined anywhere else. */
export const verdictOf = (round: Round): Verdict | undefined => {
  const rule = round.rules.twist;
  if (rule?.kind !== "verdict") return undefined;
  const { thumb, next } = verdictAt(rule, round.rules.roundMs, round.now);
  const spears = round.items
    .filter((i) => i.kind === "hurdle" && !i.outcome)
    .sort((a, b) => arrivalOf(a) - arrivalOf(b));
  const from = (edge: Lane): Warning | undefined => {
    const spear: Item | undefined = spears.find((s) => s.lanes?.includes(edge));
    return (
      spear && {
        reach: spear.lanes?.length ?? 1,
        near: arrivalOf(spear) - round.now <= NEAR_MS,
      }
    );
  };
  return {
    thumb,
    turning: next - round.now <= TURNING_MS,
    left: from(-1),
    right: from(1),
  };
};

export const sameWarning = (a: Warning | undefined, b: Warning | undefined) =>
  a?.reach === b?.reach && a?.near === b?.near;

/** Whether two moments look the same on the screen, so it needn't be drawn again. */
export const sameVerdict = (a: Verdict | undefined, b: Verdict | undefined): boolean =>
  a === b ||
  (a !== undefined &&
    a.thumb === b?.thumb &&
    a.turning === b.turning &&
    sameWarning(a.left, b.left) &&
    sameWarning(a.right, b.right));

/**
 * The side of the screen flashing, with what's coming at its edge: a spear, or a staff, which
 * sweeps in low, so its flash is along the bottom.
 */
export const Flash = ({
  side,
  warning,
  staff = false,
}: {
  side: "left" | "right";
  warning: Warning | undefined;
  staff?: boolean;
}) =>
  warning ? (
    <div
      className={`spear-flash ${side} reach-${warning.reach} ${staff ? "low" : ""} ${warning.near ? "near" : ""}`}
      aria-hidden="true"
    >
      {staff ? (
        // A staff at the edge, bound at each end.
        <svg viewBox="0 0 40 16" className="spear-icon">
          <path d="M0 6.5h40v3H0z M3 5h4v6H3z M33 5h4v6h-4z" />
        </svg>
      ) : (
        // A spearhead at the edge, pointing in.
        <svg viewBox="0 0 40 16" className="spear-icon">
          <path d="M0 6.5h22v3H0z M22 2l18 6-18 6z" />
        </svg>
      )}
    </div>
  ) : null;

export const VerdictHud = ({ verdict }: { verdict: Verdict }) => {
  const wanted = WANTED[verdict.thumb];
  return (
    <>
      <Flash side="left" warning={verdict.left} />
      <Flash side="right" warning={verdict.right} />
      {/* Keyed by the thumb, so it pops in afresh each time he turns it over. */}
      <div
        key={verdict.thumb}
        className={`verdict verdict-${wanted} ${verdict.turning ? "turning" : ""}`}
        role="status"
      >
        <span className="verdict-thumb" aria-hidden="true">
          {verdict.thumb === "up" ? "👍" : "👎"}
        </span>
        <span className="verdict-label">Head {wanted}</span>
      </div>
    </>
  );
};
