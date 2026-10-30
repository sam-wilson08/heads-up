// On a screen wider than a phone, such as a laptop's or a tablet's on its side, the game fills the
// window. A round's venue spreads across the whole of it, while the lanes, and everything drawn
// over them, keep to a column as wide as a phone held upright, in the middle, laid out just as on a
// phone. The menus fill the window too, laid out for its width (see wide.css). A phone, even on
// its side, keeps a phone's layout. It follows the window as it's resized.

import { useSyncExternalStore } from "react";

/** A window wide enough: wider than it's tall, with room for the menus to spread out. */
const QUERY = "(orientation: landscape) and (min-width: 768px) and (min-height: 500px)";

const media = (() => {
  try {
    return window.matchMedia(QUERY);
  } catch {
    return undefined;
  }
})();

/** Whether the window is wide now. */
export const isWide = (): boolean => media?.matches ?? false;

const watch = (changed: () => void) => {
  media?.addEventListener("change", changed);
  return () => media?.removeEventListener("change", changed);
};

/** Whether the window is wide, kept up to date as it's resized. */
export const useWide = (): boolean => useSyncExternalStore(watch, isWide);

/** The narrowest the column over the lanes gets, in CSS pixels: a small phone's width. */
const NARROWEST = 360;

/**
 * How wide the column over the lanes is, in a play area `width` by `height`: a phone held upright's
 * share of the height, 390 to 844, but no narrower than a small phone, and no wider than the area.
 * The 3D camera sees the same height whatever the width (see game/scene.ts), so the lanes fill
 * this column, as they fill a phone.
 */
export const columnWidth = (width: number, height: number): number =>
  Math.min(width, Math.max(NARROWEST, (height * 390) / 844));
