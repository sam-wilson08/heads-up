import { duckDownLabel, duckLabel, jumpLabel, jumpUpLabel, moveLabel } from "./controls";
import "./home.css";
import { kitById } from "./kits";
import { LevelBadge } from "./Level";
import { stageOf } from "./levels";
import type { Profile } from "./profile";
import { teamById } from "./teams";
import { TitleBall } from "./ui/Ball";
import { PersonIcon, ShirtIcon, TrophyIcon } from "./ui/icons";
import { Crest, SerieAMark } from "./ui/TeamPicker";
import { VenuePicture } from "./ui/VenuePicture";
import { venueById } from "./venues";

// The home screen: who the player is, where they're playing, and the way into a game, over the
// middle of a floodlit pitch. It's kept spare, with Play the one thing that stands out: the venue
// they've chosen on its card, the controls in a line, and the rest as quiet links.

export const Home = ({
  profile,
  username,
  onPlay,
  onLearn,
  onCustomise,
  onVenue,
  onLeaderboard,
  onSignIn,
}: {
  profile: Profile;
  username: string | undefined;
  onPlay: () => void;
  /** How to play, step by step (see game/tutorial.ts). */
  onLearn: () => void;
  onCustomise: () => void;
  /** Opens the stages: where to play, and each one's levels. */
  onVenue: () => void;
  onLeaderboard: () => void;
  onSignIn: () => void;
}) => {
  const venue = venueById(profile.venue);
  const kit = kitById(profile.kit);
  const team = teamById(profile.team);
  // Who they are: their club's crest, or until they've one, a figure.
  const badge = team ? <Crest team={team} size="small" /> : <PersonIcon />;
  // How to play, in a line. Where the player can duck as well as jump, the half of the screen
  // tapped says which; at the Colosseum, the tap ducks the spears.
  const howToPlay = [
    moveLabel(),
    ...(stageOf(venue.id).ducks
      ? [jumpUpLabel(), duckDownLabel()]
      : [venue.hurdle === "spear" ? duckLabel() : jumpLabel()]),
  ].join(" · ");
  return (
    <main className="screen title home">
      <header className="home-top">
        {username ? (
          <span className="player-chip" title="Signed in">
            {badge} {username}
          </span>
        ) : (
          <button type="button" className="player-chip" onClick={onSignIn}>
            {badge} Sign in
          </button>
        )}
        <SerieAMark className="league-mark home-league" />
        <LevelBadge xp={profile.xp} />
      </header>

      <div className="home-hero">
        <div className="title-ball" aria-hidden="true">
          <TitleBall />
        </div>
        <h1>
          Heads
          <br />
          <span>Up</span>
        </h1>
      </div>

      {/* The way in, as one: the venue and Play, and the rest. On a wide screen, it's the right-hand
          side (see wide.css); on a phone, its parts sit in the screen's column as they always have. */}
      <div className="home-side">
        <button type="button" className="matchday" onClick={onVenue}>
          <VenuePicture venue={venue} kit={kit} />
          <span className="matchday-text">
            <small>Playing at</small>
            <strong>{venue.name}</strong>
            {profile.best > 0 && (
              <span className="matchday-best">
                <TrophyIcon /> Best {profile.best.toLocaleString("en-GB")}
              </span>
            )}
          </span>
          <span className="matchday-change">Stages ›</span>
        </button>

        <div className="title-actions">
          <button type="button" className="button play-button" onClick={onPlay}>
            Play ▶
          </button>
          <p className="home-how">
            {howToPlay} ·{" "}
            <button type="button" className="home-learn" onClick={onLearn}>
              How to play
            </button>
          </p>
          <div className="home-more">
            <button type="button" className="button home-tile" onClick={onLeaderboard}>
              <TrophyIcon /> Leaderboard
            </button>
            <button type="button" className="button home-tile" onClick={onCustomise}>
              <ShirtIcon /> Customise
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
