import type { Kit } from "../kits";
import { usePicture } from "./studio";
import "./ui.css";

// A kit, as a picture to choose it by: the player wearing it, rendered in 3D with the kit shader
// the game uses (see game/kit.ts), so it's just how it'll look in play. Until that's ready, or
// without WebGL, a flat drawing of the shirt and shorts stands in.

/** How big the picture is drawn, in CSS pixels: big enough for the widest kit tile. */
const SIZE = { width: 140, height: 176 };

const SHIRT =
  "M23 5 L12 9 L2 21 L10 29 L16 24 V56 H48 V24 L54 29 L62 21 L52 9 L41 5 C38 11 26 11 23 5 Z";
const STRIPE = 32 / 6;

/**
 * A kit seen from the front: the shirt in its pattern, over the shorts. Halves show the player's
 * right on the left, as they would facing you.
 */
export const FlatKit = ({ kit }: { kit: Kit }) => {
  const first = kit.shirt[0] ?? kit.trim;
  const second = kit.shirt[1] ?? first;
  const clip = `kit-shirt-${kit.id}`;
  return (
    <svg className="flat-kit" viewBox="0 0 64 76" aria-hidden="true">
      <clipPath id={clip}>
        <path d={SHIRT} />
      </clipPath>
      <path d="M17 57 H47 L49 74 H35 L32 66 L29 74 H15 Z" fill={kit.shorts} />
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="60" fill={first} />
        {kit.pattern === "stripes" &&
          [-5, -3, -1, 1, 3, 5].map((k) => (
            <rect
              key={k}
              x={32 - STRIPE / 2 + k * STRIPE}
              width={STRIPE}
              height="60"
              fill={second}
            />
          ))}
        {kit.pattern === "halves" && <rect x="32" width="32" height="60" fill={second} />}
        {kit.pattern === "band" &&
          kit.shirt
            .slice(1)
            .map((colour, i) => (
              <rect key={i} y={24 + i * 3} width="64" height="3" fill={colour} />
            ))}
      </g>
      <path d={SHIRT} fill="none" stroke="rgba(0, 0, 0, 0.3)" />
      <path
        d="M23 5 C26 11 38 11 41 5 M2 21 L10 29 M62 21 L54 29"
        fill="none"
        stroke={kit.trim}
        strokeWidth="3"
      />
    </svg>
  );
};

/** The player in a kit, full length, from the front. */
export const KitPicture = ({ kit }: { kit: Kit }) => {
  const key = `kit:${kit.id}`;
  const url = usePicture(key, (three) =>
    three.snapshot(key, SIZE.width, SIZE.height, () =>
      three.kitShot(kit, "", 1, SIZE.width / SIZE.height),
    ),
  );
  return (
    <span className="kit-picture">
      {url ? <img src={url} alt="" draggable={false} /> : <FlatKit kit={kit} />}
    </span>
  );
};
