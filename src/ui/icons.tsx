import { useId } from "react";
import "./ui.css";

// Small pictures that sit in a line of text or on a button: drawn as SVG rather than rendered in
// 3D, since at this size the shading is lost, while a drawing stays sharp at any size, shows
// before three.js has loaded and takes no WebGL. Each is 1em square, so it's sized by the text
// round it, and sits on its baseline. The bigger pictures (the title's ball, the pack, kits and
// venues) are rendered in 3D; see ./three.

interface IconProps {
  readonly className?: string;
  /** What it means, when it isn't said by the text beside it. */
  readonly label?: string;
}

const svg = (label: string | undefined, className: string | undefined) => ({
  className: className ? `icon ${className}` : "icon",
  viewBox: "0 0 24 24",
  role: label ? "img" : undefined,
  "aria-label": label,
  "aria-hidden": label ? undefined : true,
});

/** The panels round the ball's middle, along the seams from its centre. */
const OUTER = [
  "M12 4.6L8.8 2.3L10 -1.6L14 -1.6L15.2 2.3Z",
  "M19 9.7L20.3 5.9L24.3 5.9L25.5 9.7L22.3 12.1Z",
  "M16.3 18L20.3 18L21.6 21.8L18.3 24.1L15.1 21.8Z",
  "M7.7 18L8.9 21.8L5.7 24.1L2.4 21.8L3.7 18Z",
  "M5 9.7L1.7 12.1L-1.5 9.7L-0.3 5.9L3.7 5.9Z",
];
const SEAMS = "M12 8.1V4.6M15.7 10.8L19 9.7M14.3 15.2L16.3 18M9.7 15.2L7.7 18M8.3 10.8L5 9.7";

/** A classic football: a black pentagon in the middle, seams out to the next ones round the edge. */
export const BallIcon = ({ className, label }: IconProps) => {
  const id = useId();
  return (
    <svg {...svg(label, className)}>
      <defs>
        <radialGradient id={`${id}-shade`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#eef1f4" />
          <stop offset="1" stopColor="#b9c2cc" />
        </radialGradient>
        <clipPath id={`${id}-ball`}>
          <circle cx="12" cy="12" r="10.6" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="10.6" fill={`url(#${id}-shade)`} />
      <g clipPath={`url(#${id}-ball)`} fill="#1d2430">
        <path d="M12 8.1L15.7 10.8L14.3 15.2L9.7 15.2L8.3 10.8Z" />
        {OUTER.map((d) => (
          <path key={d} d={d} />
        ))}
        <path d={SEAMS} fill="none" stroke="#1d2430" strokeWidth="0.9" />
      </g>
      <circle cx="12" cy="12" r="10.6" fill="none" stroke="#1d2430" strokeWidth="1.1" />
    </svg>
  );
};

/** A heart, glossy, in the text's colour: a life. */
export const HeartIcon = ({ className, label }: IconProps) => (
  <svg {...svg(label, className)}>
    <path
      d="M12 21.2s-7.6-4.6-9.7-9.3C.8 8.5 2.9 4.4 6.8 4.4c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.9 0 6 4.1 4.5 7.5-2.1 4.7-9.7 9.3-9.7 9.3z"
      fill="currentColor"
      stroke="rgb(0 0 0 / 0.25)"
      strokeWidth="1"
    />
    <ellipse
      cx="7.4"
      cy="8.6"
      rx="2.1"
      ry="1.3"
      transform="rotate(-35 7.4 8.6)"
      fill="#fff"
      opacity="0.5"
    />
  </svg>
);

/** A padlock, in the text's colour: not unlocked yet. */
export const LockIcon = ({ className, label }: IconProps) => (
  <svg {...svg(label, className)}>
    <path
      d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
    />
    <rect x="4.5" y="10" width="15" height="11.5" rx="2.6" fill="currentColor" />
    <path
      d="M12 13.6a1.6 1.6 0 0 0-.8 3l-.4 2.2h2.4l-.4-2.2a1.6 1.6 0 0 0-.8-3z"
      fill="#000"
      opacity="0.4"
    />
  </svg>
);

/** A shirt in the gold kit the player starts in: what you change when you customise. */
export const ShirtIcon = ({ className, label }: IconProps) => {
  const id = useId();
  return (
    <svg {...svg(label, className)}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd766" />
          <stop offset="1" stopColor="#e0a526" />
        </linearGradient>
      </defs>
      <path
        d="M8.6 2.6L4.4 4.2L.8 8.8L3.9 11.8L6.1 10V21.4H17.9V10L20.1 11.8L23.2 8.8L19.6 4.2L15.4 2.6C14.3 4.8 9.7 4.8 8.6 2.6Z"
        fill={`url(#${id}-gold)`}
        stroke="#3a2a0c"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M8.6 2.6C9.7 4.8 14.3 4.8 15.4 2.6" fill="none" stroke="#1a1a1a" strokeWidth="1.6" />
      <path d="M.8 8.8L3.9 11.8M23.2 8.8L20.1 11.8" stroke="#1a1a1a" strokeWidth="1.6" />
    </svg>
  );
};

/** A gold cup on a stand: the leaderboard. */
export const TrophyIcon = ({ className, label }: IconProps) => {
  const id = useId();
  return (
    <svg {...svg(label, className)}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c98a1a" />
          <stop offset="0.35" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#e0a526" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#c98a1a" strokeWidth="1.8">
        <path d="M6.6 5H3.8c-.2 2.8 1.2 5.4 4 6" />
        <path d="M17.4 5h2.8c.2 2.8-1.2 5.4-4 6" />
      </g>
      <path
        d="M6 2.5h12v5.2a6 6 0 0 1-12 0z"
        fill={`url(#${id}-gold)`}
        stroke="#8a5a10"
        strokeWidth="0.8"
      />
      <path d="M10.6 13.4h2.8l.6 3.8h-4z" fill="#c98a1a" />
      <rect x="7" y="17" width="10" height="4.5" rx="1.2" fill="#6b4a1a" />
      <rect x="9.2" y="18.4" width="5.6" height="1.6" rx="0.5" fill="#f5c518" />
      <path d="M8.6 4.2v3.2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
};

/** A head and shoulders, in the text's colour: the player's account. */
export const PersonIcon = ({ className, label }: IconProps) => (
  <svg {...svg(label, className)}>
    <circle cx="12" cy="8" r="4.2" fill="currentColor" />
    <path d="M3.5 21.5c.6-4.6 4-7.4 8.5-7.4s7.9 2.8 8.5 7.4z" fill="currentColor" />
  </svg>
);

/** A foil pack, crimped at each end, with the ball on its front: a pack to open. */
export const PackIcon = ({ className, label }: IconProps) => {
  const id = useId();
  const teeth = (y: number, out: number) =>
    `M5 ${y}` +
    Array.from({ length: 7 }, (_, i) => `L${5.9 + i * 2} ${y + out}L${6.9 + i * 2} ${y}`).join("") +
    `L19 ${y}Z`;
  return (
    <svg {...svg(label, className)}>
      <defs>
        <linearGradient id={`${id}-foil`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a57bff" />
          <stop offset="0.5" stopColor="#2bc0ff" />
          <stop offset="1" stopColor="#ffd766" />
        </linearGradient>
      </defs>
      <path d={teeth(3.2, -1.6)} fill="#e9e2ff" />
      <path d={teeth(20.8, 1.6)} fill="#e9e2ff" />
      <rect
        x="4.6"
        y="3"
        width="14.8"
        height="18"
        rx="1.8"
        fill={`url(#${id}-foil)`}
        stroke="#fff"
        strokeWidth="1.2"
      />
      <path d="M6 15.5L18 8.5" stroke="#fff" strokeWidth="1.6" opacity="0.45" />
      <circle cx="12" cy="10.6" r="3.4" fill="#fff" stroke="#f5c518" strokeWidth="1.2" />
      <path d="M12 8.9l1.6 1.2-.6 1.9h-2l-.6-1.9z" fill="#1d2430" />
    </svg>
  );
};

const MEDAL = {
  1: { face: "#f5c518", edge: "#b8860b", ribbon: "#e5484d" },
  2: { face: "#dfe5ec", edge: "#8f9aa6", ribbon: "#3f8fd8" },
  3: { face: "#e09a5a", edge: "#9a5a2a", ribbon: "#2fbf5b" },
} as const;

/** A medal on a ribbon, gold, silver or bronze, with its place on it. */
export const MedalIcon = ({ place, className }: { place: 1 | 2 | 3; className?: string }) => {
  const { face, edge, ribbon } = MEDAL[place];
  return (
    <svg {...svg(`Place ${place}`, className)}>
      <path d="M6.5 1.5h4l3 7h-4z" fill={ribbon} />
      <path d="M17.5 1.5h-4l-3 7h4z" fill={ribbon} opacity="0.8" />
      <circle cx="12" cy="15" r="7" fill={face} stroke={edge} strokeWidth="1.6" />
      <text
        x="12"
        y="18.6"
        textAnchor="middle"
        fontFamily="Arial Black, Arial, sans-serif"
        fontWeight="900"
        fontSize="10"
        fill={edge}
      >
        {place}
      </text>
    </svg>
  );
};
