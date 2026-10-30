// How the player plays: shared by the menus and the game, so it stays out of the game's bundle.

/**
 * Phones and tablets play by touch: drag left and right to move, tap anywhere to jump, or where the
 * player can duck as well, tap high to jump and low to duck. Best with both thumbs: one to drag,
 * the other to tap. Anything with a keyboard plays with the arrow keys and the space bar.
 */
export const isTouch = (): boolean => matchMedia("(pointer: coarse)").matches;

export const moveHint = (): string =>
  isTouch() ? "Swipe left and right to move your head" : "Use the arrow keys to move your head";

export const jumpHint = (): string => (isTouch() ? "Tap anywhere to jump" : "Press space to jump");

/** At the Colosseum the same tap ducks a spear. */
export const duckHint = (): string => (isTouch() ? "Tap to duck" : "Press space to duck");

/**
 * Where the player can duck as well as jump, a tap on the top half of the screen jumps and one on
 * the bottom half ducks. The down arrow ducks too.
 */
export const jumpUpHint = (): string =>
  isTouch() ? "Tap the top half to jump" : "Press space to jump";
export const duckDownHint = (): string =>
  isTouch() ? "Tap the bottom half to duck" : "Press ↓ to duck";

/** The same, in a few words each, for the home screen's how-to-play. */
export const moveLabel = (): string => (isTouch() ? "Swipe to move" : "← → to move");
export const jumpLabel = (): string => (isTouch() ? "Tap anywhere to jump" : "Space to jump");
export const duckLabel = (): string => (isTouch() ? "Tap to duck" : "Space to duck");
export const jumpUpLabel = (): string => (isTouch() ? "Tap high to jump" : "Space to jump");
export const duckDownLabel = (): string => (isTouch() ? "Tap low to duck" : "↓ to duck");
