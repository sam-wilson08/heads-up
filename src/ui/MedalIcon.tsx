import type { Medal } from "../levels";
import "./ui.css";

// A medal on its ribbon, drawn like the other small icons (see ./icons.tsx): 1em square, in a
// line of text or on a button. An empty one shows a medal still to win.

const COLOURS: Record<Medal, { face: string; rim: string }> = {
  bronze: { face: "#e0915a", rim: "#9a5528" },
  silver: { face: "#e6ecf2", rim: "#8b98a8" },
  gold: { face: "#ffd54a", rim: "#c98a1a" },
};

export const MedalIcon = ({
  medal,
  empty = false,
  label,
}: {
  medal: Medal;
  /** Not won yet: just its outline. */
  empty?: boolean;
  label?: string;
}) => {
  const { face, rim } = COLOURS[medal];
  return (
    <svg
      className={`icon medal-icon${empty ? " empty" : ""}`}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d="M7 1.5h4l2.2 7.5h-4zM17 1.5h-4l-2.2 7.5h4z"
        fill={empty ? "none" : "#3f6fd8"}
        stroke={empty ? "currentColor" : "#24459c"}
        strokeWidth="1"
        opacity={empty ? 0.5 : 1}
      />
      <circle
        cx="12"
        cy="15"
        r="7.4"
        fill={empty ? "none" : face}
        stroke={empty ? "currentColor" : rim}
        strokeWidth="1.6"
        opacity={empty ? 0.5 : 1}
      />
      {!empty && (
        <path
          d="M12 10.8l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"
          fill={rim}
          opacity="0.75"
        />
      )}
    </svg>
  );
};

/** The Perfect badge: a star, for heading every ball without a knock. */
export const PerfectIcon = ({ empty = false, label }: { empty?: boolean; label?: string }) => (
  <svg
    className={`icon perfect-icon${empty ? " empty" : ""}`}
    viewBox="0 0 24 24"
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    <path
      d="M12 1.8l3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.2l-6.2 3.5 1.4-6.9L2 9l7-.8z"
      fill={empty ? "none" : "#7ef9ff"}
      stroke={empty ? "currentColor" : "#1b8fb0"}
      strokeWidth="1.4"
      strokeLinejoin="round"
      opacity={empty ? 0.5 : 1}
    />
  </svg>
);
