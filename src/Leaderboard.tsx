import { useEffect, useState } from "react";
import { fetchLeaderboard, fetchVenueBoard, type Session } from "./online";
import "./online.css";
import { levelFor } from "./progression";
import { MedalIcon } from "./ui/icons";
import { VENUES, venueById, type VenueId } from "./venues";

/** How often the board checks for new XP or scores while it's open. */
const REFRESH_MS = 8000;

/** Which board: everyone's XP, or the best free-play scores at a venue. */
export type BoardPick =
  { readonly kind: "xp" } | { readonly kind: "venue"; readonly venue: VenueId };

/** A row of either board. */
interface Row {
  readonly rank: number;
  readonly username: string;
  readonly value: number;
  readonly unit?: string;
  /** Under their name: their level, or the best streak of their best game. */
  readonly detail: string;
}

interface Rows {
  readonly entries: readonly Row[];
  readonly me?: Row;
}

/** Fetches a board, as rows. */
const fetchRows = async (pick: BoardPick, me: string | undefined): Promise<Rows> => {
  if (pick.kind === "xp") {
    const board = await fetchLeaderboard(me);
    const row = (e: (typeof board.entries)[number]): Row => ({
      rank: e.rank,
      username: e.username,
      value: e.xp,
      unit: "XP",
      detail: `Level ${levelFor(e.xp)}`,
    });
    return { entries: board.entries.map(row), ...(board.me ? { me: row(board.me) } : {}) };
  }
  const board = await fetchVenueBoard(pick.venue, me);
  const row = (e: (typeof board.entries)[number]): Row => ({
    rank: e.rank,
    username: e.username,
    value: e.score,
    detail: `Best streak ${e.bestStreak}×`,
  });
  return { entries: board.entries.map(row), ...(board.me ? { me: row(board.me) } : {}) };
};

const ago = (since: number) => {
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000));
  return seconds < 5 ? "just now" : `${seconds}s ago`;
};

const BoardRow = ({ row, mine, moved }: { row: Row; mine: boolean; moved: boolean }) => (
  <li className={["board-row", mine ? "me" : "", moved ? "moved" : ""].join(" ").trim()}>
    <span className="board-rank" aria-label={`Rank ${row.rank}`}>
      {row.rank === 1 || row.rank === 2 || row.rank === 3 ? (
        <MedalIcon place={row.rank} />
      ) : (
        <span className="rank-badge">{row.rank}</span>
      )}
    </span>
    <span className="board-name">
      {row.username}
      {mine && <em> (you)</em>}
      <small>{row.detail}</small>
    </span>
    <strong className="board-score">
      {row.value.toLocaleString("en-GB")}
      {row.unit && <small> {row.unit}</small>}
    </strong>
  </li>
);

/**
 * The leaderboards, live: everyone's XP, all told, or the best free-play scores at each venue,
 * best first, refreshing every few seconds while open. The signed-in player's row is picked out,
 * and shown below the list if they're not on it. The free-play boards open on `venue`.
 */
export const Leaderboard = ({
  session,
  opening = { kind: "xp" },
  venue: home,
  onBack,
  onSignIn,
  onSignOut,
}: {
  session: Session | undefined;
  /** The board it opens on. */
  opening?: BoardPick;
  /** The venue the free-play boards open on, unless it opens on one. */
  venue: VenueId;
  onBack: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) => {
  const [pick, setPick] = useState<BoardPick>(opening);
  /** The venue last looked at, for coming back to free play from XP. */
  const [venue, setVenue] = useState<VenueId>(opening.kind === "venue" ? opening.venue : home);
  const [rows, setRows] = useState<Rows>();
  const [failed, setFailed] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number>();
  /** Rows whose XP or score changed in the last refresh, to flash them. */
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set());
  const [, setClock] = useState(0);
  const username = session?.username;
  const shown = pick.kind === "venue" ? venueById(pick.venue) : undefined;

  useEffect(() => {
    let live = true;
    let previous: Rows | undefined;
    setRows(undefined);
    setMoved(new Set());
    const load = async () => {
      try {
        const next = await fetchRows(pick, username);
        if (!live) return;
        if (previous) {
          const before = new Map(previous.entries.map((e) => [e.username, e.value]));
          setMoved(
            new Set(
              next.entries.filter((e) => before.get(e.username) !== e.value).map((e) => e.username),
            ),
          );
        }
        previous = next;
        setRows(next);
        setFailed(false);
        setFetchedAt(Date.now());
      } catch {
        if (live) setFailed(true);
      }
    };
    void load();
    const refresh = setInterval(() => void load(), REFRESH_MS);
    // Keeps "updated 5s ago" ticking.
    const clock = setInterval(() => setClock((n) => n + 1), 1000);
    return () => {
      live = false;
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, [pick, username]);

  // Picking the board that's showing leaves it be, rather than loading it again.
  const showXp = () => {
    if (pick.kind !== "xp") setPick({ kind: "xp" });
  };
  const showVenue = (id: VenueId) => {
    setVenue(id);
    if (pick.kind !== "venue" || pick.venue !== id) setPick({ kind: "venue", venue: id });
  };
  const listed = rows?.entries.some((e) => e.username === username) ?? false;

  return (
    <main className="screen menu leaderboard">
      <header className="menu-header">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          ←
        </button>
        <h2>Leaderboard</h2>
        <span className={failed ? "live offline" : "live"}>{failed ? "Offline" : "Live"}</span>
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pick.kind === "xp"}
          className={pick.kind === "xp" ? "tab active" : "tab"}
          onClick={showXp}
        >
          XP
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pick.kind === "venue"}
          className={pick.kind === "venue" ? "tab active" : "tab"}
          onClick={() => showVenue(venue)}
        >
          Free play
        </button>
      </div>
      {pick.kind === "venue" && (
        <div className="board-venues" role="group" aria-label="Venue">
          {VENUES.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.id === pick.venue}
              className={v.id === pick.venue ? "board-venue active" : "board-venue"}
              onClick={() => showVenue(v.id)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {!rows && !failed && <p className="board-status">Loading the leaderboard…</p>}
      {!rows && failed && (
        <p className="board-status">Can't reach the leaderboard right now. It'll keep trying.</p>
      )}
      {rows?.entries.length === 0 && (
        <p className="board-status">
          {shown
            ? `No one's scored in free play at ${shown.name} yet. Play there to top the board!`
            : "No one has any XP yet. Play a game to be the first on the board!"}
        </p>
      )}

      {rows && rows.entries.length > 0 && (
        <ol className="board" aria-label={shown ? `Best scores at ${shown.name}` : "Most XP"}>
          {rows.entries.map((row) => (
            <BoardRow
              key={row.username}
              row={row}
              mine={row.username === username}
              moved={moved.has(row.username)}
            />
          ))}
        </ol>
      )}
      {rows?.me && !listed && (
        <ol className="board board-mine" aria-label={shown ? "Your best there" : "Your XP"}>
          <BoardRow row={rows.me} mine moved={false} />
        </ol>
      )}

      <footer className="board-footer">
        {fetchedAt !== undefined && (
          <small>
            {failed ? "Last updated" : "Updated"} {ago(fetchedAt)}
          </small>
        )}
        {session ? (
          <p>
            Playing as <strong>{session.username}</strong> ·{" "}
            <button type="button" className="text-button inline" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        ) : (
          <button type="button" className="button again-button" onClick={onSignIn}>
            Sign in to get on the board
          </button>
        )}
      </footer>
    </main>
  );
};
