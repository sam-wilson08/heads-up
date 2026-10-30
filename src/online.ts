// Heads Up online: signing in with just a username, posting games, the leaderboard of everyone's
// total XP, and each venue's board of best free-play scores. They're Postgres functions in a
// Supabase project (see supabase/migrations), which the game calls with the project's URL and
// publishable key from VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Without them the game
// still plays, offline.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueId } from "./venues";

/** Who's signed in on this device. The token proves the username is theirs. */
export interface Session {
  readonly username: string;
  readonly token: string;
}

export interface Entry {
  readonly rank: number;
  readonly username: string;
  /** All the XP they've earned. */
  readonly xp: number;
  /** Their best free-play score. */
  readonly best: number;
  readonly at?: string;
}

export interface Board {
  readonly entries: readonly Entry[];
  /** Where the signed-in player ranks, once they've played. */
  readonly me?: Entry;
  readonly updatedAt: string;
}

/** A player's best free-play game at a venue, and where it ranks there. */
export interface ScoreEntry {
  readonly rank: number;
  readonly username: string;
  readonly score: number;
  readonly bestStreak: number;
  readonly at: string;
}

export interface VenueBoard {
  readonly venue: VenueId;
  readonly entries: readonly ScoreEntry[];
  /** Where the signed-in player ranks, once they've a score there. */
  readonly me?: ScoreEntry;
  readonly updatedAt: string;
}

export interface Posted {
  /** Their XP, all told, and where it ranks. */
  readonly xp: number;
  readonly rank?: number;
  readonly best: number;
  readonly newBest: boolean;
  readonly games: number;
  /** After free play, their best at the venue and where it ranks, once they've scored there. */
  readonly venue?: {
    readonly venue: VenueId;
    readonly best: number;
    readonly newBest: boolean;
    readonly rank: number;
  };
}

const SESSION_KEY = "heads-up:session";
/** Every name this device has signed in to, with its token, so signing out doesn't lose them. */
const NAMES_KEY = "heads-up:names";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const knownNames = (): Record<string, unknown> => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(NAMES_KEY) ?? "{}");
    return isRecord(saved) ? saved : {};
  } catch {
    return {};
  }
};

/** The token for a name this device has signed in to before, to sign back in with. */
export const tokenFor = (username: string): string | undefined => {
  const token = knownNames()[username.trim().replace(/\s+/g, " ").toLowerCase()];
  return typeof token === "string" ? token : undefined;
};

export const loadSession = (): Session | undefined => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    if (isRecord(saved) && typeof saved.username === "string" && typeof saved.token === "string") {
      return { username: saved.username, token: saved.token };
    }
  } catch {
    // Nothing saved, or storage is blocked: signed out.
  }
  return undefined;
};

export const saveSession = (session: Session): void => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(
      NAMES_KEY,
      JSON.stringify({ ...knownNames(), [session.username.toLowerCase()]: session.token }),
    );
  } catch {
    // Signed in for now, but not remembered.
  }
};

/** Signs out on this device. The name's token is kept, so signing in to it again just works. */
export const forgetSession = (): void => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to forget.
  }
};

/** The server's rules for names, so a mistake shows before asking it. */
export const NAME_LIMITS = { min: 3, max: 16 };

export const nameProblem = (input: string): string | undefined => {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < NAME_LIMITS.min) return `At least ${NAME_LIMITS.min} characters`;
  if (name.length > NAME_LIMITS.max) return `At most ${NAME_LIMITS.max} characters`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(name)) {
    return "Use letters, numbers, spaces, _ - and .";
  }
  return undefined;
};

/** A request the server turned down, with what it said, or one that never reached it. */
export class OnlineError extends Error {
  public constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Loaded on first use, so it isn't in the way of the title screen.
let client: Promise<SupabaseClient> | undefined;
const supabase = (): Promise<SupabaseClient> => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Promise.reject(new OnlineError("Online play isn't set up. Play as a guest."));
  }
  return (client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    // Players sign in with their username's token, not Supabase Auth, so there's no session to keep.
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  ));
};

/**
 * Calls one of the game's functions in the database. The functions answer a request they turn down
 * with an HTTP status, as the API they replaced did: 400, 401 or 409.
 */
const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error, status } = await (await supabase()).rpc(fn, args);
  if (error) {
    if (!status) throw new OnlineError("Couldn't reach the server. Check your connection.");
    throw new OnlineError(error.message || "Something went wrong. Try again.", status);
  }
  return data as T;
};

/** Claims a username, or signs back in to one with its token. */
export const signIn = (username: string, token?: string): Promise<Session> =>
  call<Session>("heads_up_sign_in", { p_username: username, p_token: token ?? null });

/**
 * Posts a finished game, with the XP the player has now, all told. A free-play game comes with its
 * venue, for the venue's board. A level's game is posted with a score of 0 and no venue, since its
 * scores don't compare with free play's, but its XP still counts.
 */
export const postScore = (
  session: Session,
  game: {
    readonly score: number;
    readonly bestStreak: number;
    readonly headers: number;
    readonly xp: number;
    readonly venue?: VenueId;
  },
): Promise<Posted> =>
  call<Posted>("heads_up_post_score", {
    p_username: session.username,
    p_token: session.token,
    p_score: game.score,
    p_best_streak: game.bestStreak,
    p_headers: game.headers,
    p_xp: game.xp,
    p_venue: game.venue ?? null,
  });

export const fetchLeaderboard = (me?: string): Promise<Board> =>
  call<Board>("heads_up_leaderboard", { p_limit: 50, p_me: me ?? null });

/** A venue's board: the best free-play games played there. */
export const fetchVenueBoard = (venue: VenueId, me?: string): Promise<VenueBoard> =>
  call<VenueBoard>("heads_up_leaderboard", { p_limit: 50, p_me: me ?? null, p_venue: venue });
