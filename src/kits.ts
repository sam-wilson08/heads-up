// What the player wears: Serie A clubs' home kits, in their colours and patterns, each named for its
// club. A player starts in the kit of the club they support (see teams.ts), and the rest unlock as
// they level up. Their ids are the names they first had, kept so saved profiles still find them,
// whatever club now wears them. The Scudetto is the exception: the champions' kit, the whole player
// cut like a gem, every facet catching the venue round them.

export type KitId =
  | "gold"
  | "rossoneri"
  | "nerazzurri"
  | "bianconeri"
  | "azzurri"
  | "giallorossi"
  | "biancocelesti"
  | "viola"
  | "granata"
  | "rossoblu"
  | "grifone"
  | "blucerchiati"
  | "diamond";

/**
 * How the shirt's colours are laid out. Plain uses the first colour. Stripes run up and down in the
 * first two, with the first down the middle. Halves split the first two down the middle, the first
 * on the player's right. A band is the first colour with hoops across the chest in the rest, top
 * to bottom.
 */
export type Pattern = "plain" | "stripes" | "halves" | "band";

/**
 * What the kit's made of. Cloth is the model's own, painted in the kit's colours. Diamond is the
 * whole player, skin and boots too, cut into flat facets of polished metal that mirror the venue,
 * so it's teal under a space stadium's neon and orange by a volcano (see game/kit.ts).
 */
export type Finish = "cloth" | "diamond";

export interface Kit {
  readonly id: KitId;
  readonly name: string;
  readonly pattern: Pattern;
  /**
   * The shirt's colours. A diamond kit's colours are only for what can't be diamond: the crowd
   * wearing it, and its picture until that's drawn.
   */
  readonly shirt: readonly string[];
  /** The collar, cuffs and piping. */
  readonly trim: string;
  readonly shorts: string;
  readonly socks: string;
  /** Cloth, if not given. */
  readonly finish?: Finish;
  /** The level that unlocks it (see progression.ts). A pack can unlock it sooner. */
  readonly unlockLevel: number;
}

/** Hellas Verona's gialloblù, the kit anyone wears before they've picked a club. */
const VERONA: Kit = {
  id: "gold",
  name: "Hellas Verona",
  pattern: "plain",
  shirt: ["#f4c20d"],
  trim: "#1d3a8a",
  shorts: "#1d3a8a",
  socks: "#f4c20d",
  unlockLevel: 1,
};

export const KITS: readonly Kit[] = [
  VERONA,
  {
    id: "rossoneri",
    name: "AC Milan",
    pattern: "stripes",
    shirt: ["#d0102a", "#141414"],
    trim: "#141414",
    shorts: "#f4f4f4",
    socks: "#141414",
    unlockLevel: 2,
  },
  {
    id: "nerazzurri",
    name: "Inter",
    pattern: "stripes",
    shirt: ["#0b5cc0", "#141414"],
    trim: "#141414",
    shorts: "#141414",
    socks: "#141414",
    unlockLevel: 4,
  },
  {
    id: "bianconeri",
    name: "Juventus",
    pattern: "stripes",
    shirt: ["#f4f4f4", "#141414"],
    trim: "#141414",
    shorts: "#f4f4f4",
    socks: "#f4f4f4",
    unlockLevel: 6,
  },
  {
    id: "azzurri",
    name: "Napoli",
    pattern: "plain",
    shirt: ["#139fd9"],
    trim: "#f4f4f4",
    shorts: "#f4f4f4",
    socks: "#139fd9",
    unlockLevel: 8,
  },
  {
    id: "giallorossi",
    name: "Roma",
    pattern: "plain",
    shirt: ["#8e1f2f"],
    trim: "#f0bc42",
    shorts: "#f4f4f4",
    socks: "#8e1f2f",
    unlockLevel: 10,
  },
  {
    id: "biancocelesti",
    name: "Lazio",
    pattern: "plain",
    shirt: ["#87cdee"],
    trim: "#f4f4f4",
    shorts: "#f4f4f4",
    socks: "#f4f4f4",
    unlockLevel: 12,
  },
  {
    id: "viola",
    name: "Fiorentina",
    pattern: "plain",
    shirt: ["#4c2c92"],
    trim: "#f4f4f4",
    shorts: "#f4f4f4",
    socks: "#4c2c92",
    unlockLevel: 14,
  },
  {
    id: "granata",
    name: "Torino",
    pattern: "plain",
    shirt: ["#7f1d1d"],
    trim: "#f4f4f4",
    shorts: "#f4f4f4",
    socks: "#7f1d1d",
    unlockLevel: 16,
  },
  {
    id: "rossoblu",
    name: "Bologna",
    pattern: "stripes",
    shirt: ["#a6192e", "#1a2b5f"],
    trim: "#f4f4f4",
    shorts: "#f4f4f4",
    socks: "#1a2b5f",
    unlockLevel: 17,
  },
  {
    id: "grifone",
    name: "Genoa",
    pattern: "halves",
    shirt: ["#c8102e", "#0a2a66"],
    trim: "#f4f4f4",
    shorts: "#0a2a66",
    socks: "#0a2a66",
    unlockLevel: 19,
  },
  {
    id: "blucerchiati",
    name: "Sassuolo",
    pattern: "stripes",
    shirt: ["#00a04f", "#141414"],
    trim: "#141414",
    shorts: "#141414",
    socks: "#00a04f",
    unlockLevel: 5,
  },
  {
    id: "diamond",
    name: "Scudetto",
    pattern: "halves",
    shirt: ["#e6f1ff", "#9fc4ec"],
    trim: "#5f86b8",
    shorts: "#c9ddf3",
    socks: "#9fc4ec",
    finish: "diamond",
    unlockLevel: 20,
  },
];

export const kitById = (id: string): Kit => KITS.find((k) => k.id === id) ?? VERONA;
