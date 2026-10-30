// Where the game is played. Each venue unlocks at a level, or sooner from a pack (see
// progression.ts).

import type { Decoy } from "./game/engine";

export type VenueId =
  | "park"
  | "beach"
  | "snow"
  | "moon"
  | "underwater"
  | "volcano"
  | "mars"
  | "space"
  | "funfair"
  | "castle"
  | "final"
  | "colosseum"
  | "pisa"
  | "fuji";

/** Who turns up to watch as the streak grows. */
export type Crowd = "people" | "aliens" | "penguins" | "fish" | "robots" | "ghosts" | "romans";

/**
 * What comes along the ground for the player to jump, or at the Colosseum, at their head to duck.
 * On Sakura Peak it's a ninja's staff, swept in low from the side.
 */
export type HurdleKind = "hurdle" | "sunbather" | "sled" | "spear" | "staff";

/** A sun in the sky. Angles are in degrees: up from the horizon, and right of straight ahead. */
export interface Sun {
  readonly colour: string;
  /** The halo round it. A sun with no size is only a glow, like the light off a volcano. */
  readonly glow: string;
  readonly height: number;
  readonly across: number;
  /** How wide the disc is, in degrees. */
  readonly size: number;
}

/** How a venue's goal looks. A venue without one has white posts and a white net. */
export interface GoalStyle {
  /** The posts and bar, and what they're made of. */
  readonly frame: string;
  readonly finish: "paint" | "metal" | "rough";
  /** Rings round the posts and bar: candy-cane stripes, bamboo knuckles, cracks of lava. */
  readonly bands?: {
    readonly colour: string;
    /** How far apart they are, and how wide each one is, in metres. */
    readonly every: number;
    readonly width: number;
    readonly glow?: boolean;
  };
  /** The supports running back behind the goal, if they're not the frame's colour. */
  readonly supports?: string;
  readonly net: string;
  /** What glows, lighting itself up: just the net (lasers, embers), or the frame too (neon). */
  readonly glow?: "net" | "all";
  /** Snow lying along the top of the bar. */
  readonly snow?: boolean;
}

export interface Venue {
  readonly id: VenueId;
  readonly name: string;
  /** The level that unlocks it (see progression.ts). A pack can unlock it sooner. */
  readonly unlockLevel: number;
  /** The sky overhead, then down at the horizon. */
  readonly sky: readonly [string, string];
  /** The haze along the horizon, which the distance fades into. */
  readonly haze: string;
  /**
   * A sun, moon or glow that shows in the sky ahead. A daytime venue's sun is behind the camera,
   * lighting the player's back (see game/look.ts), so it has none.
   */
  readonly sun?: Sun;
  /** Clouds' sunlit tops and shaded undersides, for venues that have weather. */
  readonly clouds?: readonly [string, string];
  /** How much of the sky its clouds cover, from 0 to 1: a little over a third, if not given. */
  readonly cover?: number;
  /** The two stripes mown into the pitch (or raked into the sand). */
  readonly pitch: readonly [string, string];
  /** Grass gets the full grass photo for detail; other ground only its texture. */
  readonly surface: "grass" | "ground";
  /** The ground beyond the pitch. */
  readonly surround: string;
  readonly lines: string;
  readonly crowd: Crowd;
  /** A training hurdle, unless the venue has something of its own to jump. */
  readonly hurdle?: HurdleKind;
  /** Decoys of the venue's own, thrown alongside the classic ones, and more often. */
  readonly decoys?: readonly Decoy[];
  /**
   * Its goal, or false for none, and none of the chalk that goes with one: the pitch is open
   * ground, and things are thrown from its far end all the same.
   */
  readonly goal?: GoalStyle | false;
  /**
   * How far in front of the player the ground ends, in metres, at a cliff's edge: Sakura Peak's.
   * Past it there's only the drop, painted in its backdrop's floor picture, so nothing's shadow
   * falls past it and no crowd comes, since there's nowhere for one to stand.
   */
  readonly ledge?: number;
}

const PARK: Venue = {
  id: "park",
  name: "Sunny Park",
  unlockLevel: 1,
  sky: ["#3f8fd8", "#a9d4f2"],
  haze: "#e2f0f7",
  clouds: ["#ffffff", "#b4c5da"],
  pitch: ["#3f7d2c", "#558f3c"],
  surface: "grass",
  surround: "#5f8a40",
  lines: "#f2f2ea",
  crowd: "people",
  decoys: ["pigeon", "frisbee"],
};

/** Every venue there is, hidden or not. */
const EVERY_VENUE: readonly Venue[] = [
  PARK,
  {
    id: "beach",
    name: "The Beach",
    unlockLevel: 3,
    sky: ["#1f8fe0", "#9fd8f5"],
    haze: "#e6f6fc",
    clouds: ["#ffffff", "#c2d6e6"],
    pitch: ["#e9c987", "#f1d69c"],
    surface: "ground",
    surround: "#e3c27e",
    lines: "#ffffff",
    crowd: "people",
    hurdle: "sunbather",
    decoys: ["volleyball", "crab", "flipFlop"],
    // Bamboo poles with a fisherman's blue net.
    goal: {
      frame: "#d6b56e",
      finish: "rough",
      bands: { colour: "#8a6a32", every: 0.42, width: 0.035 },
      supports: "#b8955a",
      net: "#2f7fd6",
    },
  },
  {
    id: "snow",
    name: "Snowy Pitch",
    unlockLevel: 7,
    sky: ["#8ea4bb", "#d9e2ec"],
    haze: "#eef2f6",
    clouds: ["#f2f4f7", "#a9b4c1"],
    pitch: ["#f4f8fc", "#e2eaf2"],
    surface: "ground",
    surround: "#eef3f8",
    lines: "#3c78d8",
    crowd: "penguins",
    decoys: ["snowball", "snowflake"],
    hurdle: "sled",
    // Candy-cane posts, with snow along the bar.
    goal: {
      frame: "#ffffff",
      finish: "paint",
      bands: { colour: "#d62839", every: 0.24, width: 0.12 },
      net: "#ffffff",
      snow: true,
    },
  },
  {
    id: "moon",
    name: "The Moon",
    unlockLevel: 9,
    sky: ["#000000", "#0b0c12"],
    haze: "#15171f",
    pitch: ["#9a9a9a", "#a7a7a7"],
    surface: "ground",
    surround: "#8a8a8a",
    lines: "#e8e8e8",
    crowd: "aliens",
    decoys: ["helmet", "moonRock", "cheese"],
    // Silver, wrapped in gold foil like a lander, with a laser net.
    goal: {
      frame: "#c9ced6",
      finish: "metal",
      bands: { colour: "#d9a441", every: 0.8, width: 0.14 },
      net: "#5ff3ff",
      glow: "net",
    },
  },
  {
    id: "underwater",
    name: "Underwater",
    unlockLevel: 11,
    sky: ["#032a45", "#13849c"],
    haze: "#1a9cb2",
    sun: { colour: "#d8fbff", glow: "#7fe6f5", height: 62, across: 0, size: 3 },
    pitch: ["#2c8b83", "#33968d"],
    surface: "ground",
    surround: "#2a7f78",
    lines: "#d8f6f2",
    crowd: "fish",
    decoys: ["jellyfish", "starfish"],
    // Pink coral, knobbly with paler polyps, with seaweed for a net.
    goal: {
      frame: "#ff6f8f",
      finish: "rough",
      bands: { colour: "#ffc4d2", every: 0.3, width: 0.05 },
      supports: "#f0607f",
      net: "#4fd38a",
    },
  },
  {
    id: "volcano",
    name: "Volcano",
    unlockLevel: 13,
    // Smoke hangs over everything, lit red from below by the lava.
    sky: ["#0d0403", "#4f1b0d"],
    haze: "#6e2a15",
    sun: { colour: "#ff8a3a", glow: "#ff5a1a", height: 3, across: -14, size: 0 },
    // Black ash, raked into stripes.
    pitch: ["#2b2524", "#332c2a"],
    surface: "ground",
    surround: "#231c1a",
    lines: "#e8d6c8",
    crowd: "people",
    decoys: ["fireball", "lavaRock"],
    // Black obsidian, cracked with glowing lava, and a net of embers.
    goal: {
      frame: "#2b2426",
      finish: "rough",
      bands: { colour: "#ff6a1a", every: 0.33, width: 0.03, glow: true },
      net: "#ff8a3a",
      glow: "net",
    },
  },
  {
    id: "mars",
    name: "Mars",
    unlockLevel: 15,
    sky: ["#a8532c", "#e7b48a"],
    haze: "#f2cfae",
    // Sunsets on Mars glow blue.
    sun: { colour: "#fff4e6", glow: "#9cc0ff", height: 8, across: -5, size: 0.9 },
    pitch: ["#ad512b", "#bb5d35"],
    surface: "ground",
    surround: "#a14a27",
    lines: "#f3e2d4",
    crowd: "robots",
    decoys: ["rover", "rocket"],
    // Rusted metal, its net dusty.
    goal: { frame: "#9a4e2c", finish: "rough", net: "#e9c4a2" },
  },
  {
    id: "space",
    name: "Space Stadium",
    unlockLevel: 18,
    sky: ["#07031a", "#2c1563"],
    haze: "#4a2a96",
    pitch: ["#22135a", "#2b1a6b"],
    surface: "ground",
    surround: "#160c3c",
    lines: "#9ff3ff",
    crowd: "aliens",
    decoys: ["ufo", "planet"],
    // Neon.
    goal: { frame: "#ff3df0", finish: "metal", net: "#4ff3ff", glow: "all" },
  },
  {
    id: "funfair",
    name: "Funfair",
    unlockLevel: 20,
    // A summer evening, the sun going down behind the rides.
    sky: ["#3f7fd6", "#ffc89e"],
    haze: "#ffe0c4",
    sun: { colour: "#fff0d0", glow: "#ffc278", height: 5, across: -6, size: 1.8 },
    clouds: ["#ffffff", "#e8bfd2"],
    pitch: ["#447f30", "#5a9541"],
    surface: "grass",
    surround: "#668f46",
    lines: "#ffffff",
    crowd: "people",
    decoys: ["candyFloss", "toffeeApple", "rubberDuck"],
    // Bubblegum-pink and white candy stripes, with a lemon net.
    goal: {
      frame: "#ff6fb5",
      finish: "paint",
      bands: { colour: "#ffffff", every: 0.26, width: 0.12 },
      net: "#ffe066",
    },
  },
  {
    id: "castle",
    name: "Haunted Castle",
    unlockLevel: 22,
    sky: ["#04030a", "#1d1733"],
    haze: "#2a2240",
    // A full moon over the battlements.
    sun: { colour: "#eef0ff", glow: "#8f9cff", height: 24, across: 9, size: 3.4 },
    // Worn flagstones.
    pitch: ["#4b4a52", "#56555e"],
    surface: "ground",
    surround: "#3a3940",
    lines: "#b8b4a8",
    crowd: "ghosts",
    decoys: ["pumpkin", "skull", "spellbook"],
    // Dark iron, rusting at the joints, with a net like cobwebs.
    goal: {
      frame: "#2c2c33",
      finish: "metal",
      bands: { colour: "#6a5440", every: 0.6, width: 0.05 },
      net: "#cfd2dc",
    },
  },
  {
    id: "final",
    name: "Cup Final",
    unlockLevel: 24,
    // Night, under the floodlights.
    sky: ["#020512", "#16244a"],
    haze: "#2a3a66",
    // A perfect pitch, mown in sharp stripes, and the classic white goal.
    pitch: ["#2c7a30", "#3a913d"],
    surface: "grass",
    surround: "#24572a",
    lines: "#ffffff",
    crowd: "people",
    decoys: ["scarf", "banana", "foamFinger"],
  },
  {
    id: "colosseum",
    name: "The Colosseum",
    // Next after Mars while Space, the Funfair, the Castle and the Cup Final are hidden.
    unlockLevel: 18,
    sky: ["#3a86cf", "#bfdcef"],
    haze: "#efe0c2",
    clouds: ["#ffffff", "#d8c8ae"],
    // Raked sand.
    pitch: ["#d2a35f", "#ddb06e"],
    surface: "ground",
    surround: "#c99a5a",
    lines: "#f6ecd8",
    crowd: "romans",
    hurdle: "spear",
    decoys: ["gladiatorHelmet", "amphora", "grapes"],
    // Marble columns banded in gold, with a net in imperial red.
    goal: {
      frame: "#efe7d6",
      finish: "rough",
      bands: { colour: "#d8a93a", every: 0.6, width: 0.07 },
      net: "#b3261e",
    },
  },
  {
    id: "pisa",
    name: "Leaning Tower",
    // Next after the Colosseum while the Funfair is hidden.
    unlockLevel: 20,
    // A clear Tuscan afternoon over the Field of Miracles.
    sky: ["#2f7fd0", "#b8dcf2"],
    haze: "#e8eef0",
    // Its lawns, mown in stripes, as olive as the picture's under the sun: the floor picture covers
    // the pitch, but a leaning screen's lower corners swing past it onto the pitch's own.
    pitch: ["#4a4f28", "#525830"],
    surface: "grass",
    surround: "#4a4f28",
    lines: "#f6f4ec",
    crowd: "people",
    // White marble, like the tower's, with a net in Pisa's red.
    goal: { frame: "#f1ede4", finish: "rough", net: "#c8202e" },
  },
  {
    id: "fuji",
    name: "Sakura Peak",
    unlockLevel: 22,
    // The edge of a cliff on a windswept mountain top in Japan at golden hour, looking out over a
    // sea of cloud far below to Mount Fuji, with slopes of cherry trees in blossom either side.
    sky: ["#2a6cc0", "#f1d9a6"],
    haze: "#f0e0c0",
    // Its short, wind-flattened grass, as golden as the floor picture's in the low sun: the floor
    // covers the ground, but a knocked-out player's camera sees past its near edge onto the pitch.
    pitch: ["#5b4f27", "#625629"],
    surface: "grass",
    surround: "#5b4f27",
    lines: "#f6f4ec",
    crowd: "people",
    hurdle: "staff",
    // No goal: the ground ends in the cliff's edge, a couple of metres in front of the player.
    goal: false,
    ledge: 2.2,
  },
];

/**
 * Venues hidden for now: each is still here, scenery, twist and all, but not shown, played or
 * unlocked. Take one out to bring it back.
 */
export const HIDDEN_VENUES: ReadonlySet<VenueId> = new Set<VenueId>([
  "space",
  "funfair",
  "castle",
  "final",
]);

export const VENUES: readonly Venue[] = EVERY_VENUE.filter((venue) => !HIDDEN_VENUES.has(venue.id));

export const venueById = (id: string): Venue => VENUES.find((v) => v.id === id) ?? PARK;
