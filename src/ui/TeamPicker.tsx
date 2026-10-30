import { useState } from "react";
import { kitById } from "../kits";
import { LEAGUE_MARK, TEAMS, type Team, type TeamId } from "../teams";
import "./ui.css";

// The club a player supports, picked once they've a name, before anything else: the league's mark,
// the question, and the five clubs' crests to choose from. The club's kit is theirs from the start.

/** A club's shirt colours, striped if its shirt is, for a tile without its crest. */
const colours = (team: Team): string => {
  const { pattern, shirt } = kitById(team.kit);
  const [first = "#f4f4f4", second = first] = shirt;
  return pattern === "stripes"
    ? `repeating-linear-gradient(90deg, ${first} 0 25%, ${second} 25% 50%)`
    : first;
};

/**
 * A club's crest on a white tile, which every crest shows up on, dark ones and light. Without its
 * crest's file (see teams.ts), the tile's in the club's colours instead.
 */
export const Crest = ({ team, size = "large" }: { team: Team; size?: "small" | "large" }) =>
  team.crest ? (
    <span className={`crest crest-${size}`}>
      <img src={team.crest} alt="" draggable={false} />
    </span>
  ) : (
    <span className={`crest crest-${size}`} style={{ background: colours(team) }} />
  );

/** The league's mark, for the menus, or nothing without its file (see teams.ts). */
export const SerieAMark = ({ className }: { className?: string }) =>
  LEAGUE_MARK ? (
    <img className={className ?? "league-mark"} src={LEAGUE_MARK} alt="Serie A" draggable={false} />
  ) : null;

export const TeamPicker = ({ onPick }: { onPick: (team: Team) => void }) => {
  const [chosen, setChosen] = useState<TeamId>();
  const team = TEAMS.find((t) => t.id === chosen);
  return (
    <main className="screen title team-pick">
      <div className="title-top">
        <SerieAMark className="league-mark title-league" />
        <h2>
          Who do you
          <br />
          <span>support?</span>
        </h2>
        <p className="tagline">You'll start in their kit.</p>
      </div>
      <ul className="team-grid">
        {TEAMS.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={t.id === chosen ? "team-card chosen" : "team-card"}
              aria-pressed={t.id === chosen}
              onClick={() => setChosen(t.id)}
            >
              <Crest team={t} />
              <span>{t.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="button play-button"
        disabled={!team}
        onClick={() => {
          if (team) onPick(team);
        }}
      >
        {team ? `Forza ${team.short} ▶` : "Pick your club"}
      </button>
    </main>
  );
};
