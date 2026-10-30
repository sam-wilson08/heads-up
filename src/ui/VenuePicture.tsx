import type { Kit } from "../kits";
import type { Venue } from "../venues";
import { usePicture } from "./studio";
import "./ui.css";

// A venue, as a picture to choose it by: rendered from the game's own scenery, with its sky,
// ground, goal, extras and a few of its crowd, in the player's kit. Until that's ready, or without
// WebGL, its colours stand in: its sky over its pitch.

/** How big the picture is drawn, in CSS pixels: big enough for the widest venue card. */
const SIZE = { width: 224, height: 136 };

/** A venue's colours: its sky over its pitch. */
const swatch = (venue: Venue) => ({
  background: `linear-gradient(${venue.sky[0]}, ${venue.sky[1]} 55%, ${venue.pitch[0]} 55%, ${venue.pitch[1]})`,
});

export const VenuePicture = ({ venue, kit }: { venue: Venue; kit: Kit }) => {
  const key = `venue:${venue.id}:${kit.id}`;
  const url = usePicture(key, (three) =>
    three.snapshot(key, SIZE.width, SIZE.height, () =>
      three.venueScene(venue, kit, SIZE.width / SIZE.height),
    ),
  );
  return (
    <span className="venue-picture" style={swatch(venue)}>
      {url && <img src={url} alt="" draggable={false} />}
    </span>
  );
};
