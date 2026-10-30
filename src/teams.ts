import type { KitId } from "./kits";

// The Serie A clubs a player can support, picked when they first sign in (see ui/TeamPicker.tsx).
// Each brings its crest, shown beside the player's name, and its kit, which the player starts in
// and owns from the start, whatever their level.

// The crests and the league's mark and triangles are the clubs' and Serie A's own, so they're
// gitignored, and each person keeps their own copy in ./assets/serie-a: the crests named by club,
// as juventus.svg, the mark as serie-a.png and the triangles as triangles.png. Vite finds them at
// build time. Without its file, a club's crest is its colours (see Crest in ui/TeamPicker.tsx), and
// the menus go without the mark and the triangles.
const ARTWORK = import.meta.glob<string>("./assets/serie-a/*.{png,svg,webp}", {
  query: "?url",
  import: "default",
  eager: true,
});

const artwork = (name: string): string | undefined =>
  Object.entries(ARTWORK).find(([path]) => path.replace(/^.*\/|\.\w+$/g, "") === name)?.[1];

/** The league's mark, for the menus, if it's there. */
export const LEAGUE_MARK = artwork("serie-a");
/** The league's triangles, faint across the top of the menus, if they're there. */
export const LEAGUE_PATTERN = artwork("triangles");

export type TeamId = "juventus" | "milan" | "inter" | "roma" | "napoli";

export interface Team {
  readonly id: TeamId;
  readonly name: string;
  /** What its fans call it, as in "Forza Juve". */
  readonly short: string;
  /** Its crest, as an image address, if it's there. */
  readonly crest?: string;
  /** The kit its supporters start in (see kits.ts). */
  readonly kit: KitId;
}

export const TEAMS: readonly Team[] = [
  {
    id: "juventus",
    name: "Juventus",
    short: "Juve",
    crest: artwork("juventus"),
    kit: "bianconeri",
  },
  { id: "milan", name: "AC Milan", short: "Milan", crest: artwork("milan"), kit: "rossoneri" },
  { id: "inter", name: "Inter", short: "Inter", crest: artwork("inter"), kit: "nerazzurri" },
  { id: "roma", name: "Roma", short: "Roma", crest: artwork("roma"), kit: "giallorossi" },
  { id: "napoli", name: "Napoli", short: "Napoli", crest: artwork("napoli"), kit: "azzurri" },
];

/** A team by its id, or undefined for anything else, such as a profile from before teams. */
export const teamById = (id: unknown): Team | undefined => TEAMS.find((team) => team.id === id);
