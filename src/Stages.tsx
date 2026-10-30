import { kitById } from "./kits";
import { LevelBadge } from "./Level";
import { type Level, levelsAt, MEDALS, stageOf, STAGES, targetsOf } from "./levels";
import "./levels.css";
import { canPlay, owns, type Profile } from "./profile";
import { medalsAt, type Records } from "./records";
import { HeartIcon, LockIcon } from "./ui/icons";
import { MedalIcon, PerfectIcon } from "./ui/MedalIcon";
import { VenuePicture } from "./ui/VenuePicture";
import { type Venue, venueById, type VenueId } from "./venues";

// Choosing where to play: the stages, each a venue that plays its own way, opened in turn by XP;
// then a stage's levels, to practise it on, or free play there.

const isOpen = (profile: Profile, venue: Venue) => owns(profile, { kind: "venue", venue });

export const StagePicker = ({
  profile,
  records,
  onStage,
  onBack,
}: {
  profile: Profile;
  records: Records;
  onStage: (venue: VenueId) => void;
  onBack: () => void;
}) => {
  const kit = kitById(profile.kit);
  return (
    <main className="screen menu stages">
      <header className="menu-header">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          ←
        </button>
        <h2>Stages</h2>
        <LevelBadge xp={profile.xp} />
      </header>
      <p className="note">Every stage plays its own way. Earn XP to open the next.</p>
      <ul className="stage-list">
        {STAGES.map((stage) => {
          const venue = venueById(stage.venue);
          const open = isOpen(profile, venue);
          const here = profile.venue === venue.id;
          const { won, of } = medalsAt(records, venue.id);
          return (
            <li key={venue.id}>
              <button
                type="button"
                className={`stage-card${here ? " here" : ""}`}
                disabled={!open}
                onClick={() => onStage(venue.id)}
              >
                <VenuePicture venue={venue} kit={kit} />
                <span className="stage-text">
                  <strong>{venue.name}</strong>
                  <small className="stage-twist">{stage.title}</small>
                  {open ? (
                    <span className="stage-medals" aria-label={`${won} of ${of} medals`}>
                      <MedalIcon medal="gold" empty={won === 0} /> {won}/{of}
                      {here && <em>Playing here</em>}
                    </span>
                  ) : (
                    <span className="stage-locked">Reach level {venue.unlockLevel}</span>
                  )}
                </span>
                {!open && (
                  <small className="lock">
                    <LockIcon /> Level {venue.unlockLevel}
                  </small>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
};

/** A level's lives, as hearts. */
const Lives = ({ count }: { count: number }) => (
  <span className="level-lives" aria-label={`${count} ${count === 1 ? "life" : "lives"}`}>
    {Array.from({ length: count }, (_, i) => (
      <HeartIcon key={i} />
    ))}
  </span>
);

const LevelRow = ({
  level,
  records,
  onPlay,
}: {
  level: Level;
  records: Records;
  onPlay: (level: Level) => void;
}) => {
  const record = records[level.id];
  const open = canPlay(records, level);
  const targets = targetsOf(level);
  const reached = record?.medal ? MEDALS.indexOf(record.medal) : -1;
  return (
    <li>
      <button
        type="button"
        className={`level-row${level.final ? " level-final" : ""}`}
        disabled={!open}
        onClick={() => onPlay(level)}
      >
        <span className="level-number">{level.final ? "F" : level.number}</span>
        <span className="level-text">
          <strong>{level.name}</strong>
          <small>
            {level.rules.roundMs / 1000}s · <Lives count={level.rules.lives} />
            {level.rules.hurdles ? " · hurdles" : ""}
          </small>
          {open ? (
            <small className="level-best">
              {record?.best
                ? `Best ${record.best.toLocaleString("en-GB")}`
                : `Gold ${targets.gold.toLocaleString("en-GB")}`}
            </small>
          ) : (
            <small className="level-best">Win a medal on the last level to open</small>
          )}
        </span>
        <span className="level-medals">
          {MEDALS.map((medal, i) => (
            <MedalIcon
              key={medal}
              medal={medal}
              empty={i > reached}
              label={i <= reached ? medal : undefined}
            />
          ))}
          <PerfectIcon empty={!record?.perfect} label={record?.perfect ? "Perfect" : undefined} />
        </span>
        {!open && (
          <small className="lock">
            <LockIcon />
          </small>
        )}
      </button>
    </li>
  );
};

export const StageLevels = ({
  profile,
  records,
  venue: id,
  onPlay,
  onFreePlay,
  onBack,
}: {
  profile: Profile;
  records: Records;
  venue: VenueId;
  onPlay: (level: Level) => void;
  onFreePlay: (venue: VenueId) => void;
  onBack: () => void;
}) => {
  const venue = venueById(id);
  const stage = stageOf(id);
  return (
    <main className="screen menu stage-levels">
      <header className="menu-header">
        <button
          type="button"
          className="icon-button"
          aria-label="Back to the stages"
          onClick={onBack}
        >
          ←
        </button>
        <h2>{venue.name}</h2>
        <LevelBadge xp={profile.xp} />
      </header>
      <section className="stage-hero">
        <VenuePicture venue={venue} kit={kitById(profile.kit)} />
        <div className="stage-about">
          <strong>{stage.title}</strong>
          <p>{stage.blurb}</p>
        </div>
      </section>
      <ul className="level-list" aria-label="Levels">
        {levelsAt(id).map((level) => (
          <LevelRow key={level.id} level={level} records={records} onPlay={onPlay} />
        ))}
      </ul>
      <p className="note medal-key">
        <MedalIcon medal="bronze" /> Finish · <MedalIcon medal="silver" /> Score ·{" "}
        <MedalIcon medal="gold" /> Big score · <PerfectIcon /> Every ball
      </p>
      <button type="button" className="button free-play-button" onClick={() => onFreePlay(id)}>
        Free play here ▶
      </button>
    </main>
  );
};
