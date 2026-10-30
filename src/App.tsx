import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Summary } from "./game/engine";
import { Loading } from "./game/Loading";
import type { Trace } from "./game/trace";
import { TUTORIAL_RULES } from "./game/tutorial";
import { Home } from "./Home";
import { kitById, KITS } from "./kits";
import { type BoardPick, Leaderboard } from "./Leaderboard";
import { LevelBadge } from "./Level";
import { LevelResults } from "./LevelResults";
import { freePlayAt, type Level, levelsAt } from "./levels";
import { Login } from "./Login";
import {
  forgetSession,
  loadSession,
  OnlineError,
  type Posted,
  postScore,
  type Session,
  signIn,
} from "./online";
import {
  canPlay,
  DEFAULT_PROFILE,
  loadProfile,
  NAME_LENGTH,
  owns,
  type Profile,
  saveProfile,
  supports,
} from "./profile";
import { type GameRewards, levelProgress, nameOf, type Reward, rewardGame } from "./progression";
import { type LevelRun, loadRecords, recordRun, type Records, saveRecords } from "./records";
import { StageLevels, StagePicker } from "./Stages";
import { TEAMS } from "./teams";
import { LockIcon, PackIcon, TrophyIcon } from "./ui/icons";
import { KitPicture } from "./ui/KitPicture";
import { Pack } from "./ui/Pack";
import { PlayerView } from "./ui/PlayerView";
import { Crest, TeamPicker } from "./ui/TeamPicker";
import { venueById, type VenueId } from "./venues";
import { useWide } from "./wide";
import "./wide.css";

// The 3D game (and three.js with it) loads separately, so the menus open straight away.
const loadGame = () => import("./game/Game");
const Game = lazy(async () => ({ default: (await loadGame()).Game }));

type Screen =
  | { readonly name: "title" }
  | { readonly name: "customise"; readonly tab?: Tab }
  /** Where to play: the venues, as stages. */
  | { readonly name: "stages" }
  /** A stage's levels. */
  | { readonly name: "stage"; readonly venue: VenueId }
  | {
      readonly name: "playing";
      readonly round: number;
      /** The level being played, or undefined for free play. */
      readonly level: Level | undefined;
      readonly seed: number;
    }
  | {
      readonly name: "results";
      readonly summary: Summary;
      readonly newBest: boolean;
      readonly rewards: GameRewards;
      /** The player's XP before the game, for the XP bar to fill from. */
      readonly xpBefore: number;
      /** What a level run earned, or undefined after free play. */
      readonly run: LevelRun | undefined;
    }
  | { readonly name: "pack"; readonly rewards: GameRewards; readonly level: Level | undefined }
  | { readonly name: "login" }
  /** The club a new player supports, picked once they've a name (see teams.ts). */
  | { readonly name: "team" }
  /** The leaderboards, on the XP board unless `opening` says which. */
  | { readonly name: "leaderboard"; readonly opening?: BoardPick }
  /** How to play, a step at a time, then the game it's before: a level, or free play. */
  | { readonly name: "tutorial"; readonly round: number; readonly level: Level | undefined };

/** How a finished game got on to the leaderboard, or why it didn't. */
type Online =
  | { readonly state: "guest" }
  | { readonly state: "posting" }
  | { readonly state: "posted"; readonly posted: Posted }
  | { readonly state: "failed"; readonly message: string };

const onlineLine = (online: Online): string => {
  switch (online.state) {
    case "guest":
      return "Sign in to get on the leaderboard";
    case "posting":
      return "Adding your XP to the leaderboard…";
    case "failed":
      return online.message;
    case "posted": {
      const { rank, xp, venue } = online.posted;
      if (rank === undefined) return "Earn some XP to get on the leaderboard";
      const overall = `#${rank} on the leaderboard, with ${xp.toLocaleString("en-GB")} XP`;
      // After free play, where their best there ranks at the venue too.
      return venue
        ? `#${venue.rank} in free play at ${venueById(venue.venue).name} · ${overall}`
        : overall;
    }
  }
};

/** The parts of the customise screen. Where to play is chosen from the stages. */
type Tab = "player" | "kit";

const Customise = ({
  profile,
  opening = "player",
  onChange,
  onBack,
}: {
  profile: Profile;
  /** The tab it opens on. */
  opening?: Tab | undefined;
  onChange: (profile: Profile) => void;
  onBack: () => void;
}) => {
  const [tab, setTab] = useState<Tab>(opening);
  return (
    <main className="screen menu">
      <header className="menu-header">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          ←
        </button>
        <h2>Customise</h2>
        <LevelBadge xp={profile.xp} />
      </header>
      <div className="tabs" role="tablist">
        {(["player", "kit"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "tab active" : "tab"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "player" && (
        <section className="fields">
          {/* The club they support: picking another puts them in its kit. */}
          <div className="field">
            <span id="club-label">Club</span>
            <div className="clubs" role="group" aria-labelledby="club-label">
              {TEAMS.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={profile.team === team.id ? "club chosen" : "club"}
                  aria-pressed={profile.team === team.id}
                  aria-label={team.name}
                  title={team.name}
                  onClick={() => onChange(supports(profile, team))}
                >
                  <Crest team={team} />
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Name</span>
            <input
              value={profile.name}
              maxLength={NAME_LENGTH}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...profile, name: e.target.value.toUpperCase() })}
            />
          </label>
          <div className="field">
            <span id="number-label">Number</span>
            <div className="stepper" role="group" aria-labelledby="number-label">
              <button
                type="button"
                aria-label="Lower number"
                onClick={() => onChange({ ...profile, number: Math.max(1, profile.number - 1) })}
              >
                −
              </button>
              <output>{profile.number}</output>
              <button
                type="button"
                aria-label="Higher number"
                onClick={() => onChange({ ...profile, number: Math.min(99, profile.number + 1) })}
              >
                +
              </button>
            </div>
          </div>
          <p className="note">Your name and number go on the back of your shirt.</p>
        </section>
      )}
      {tab === "player" && (
        <PlayerView
          className="shirt-back"
          kit={kitById(profile.kit)}
          name={profile.name}
          number={profile.number}
          view="back"
        />
      )}
      {tab === "kit" && (
        <ul className="kits">
          {KITS.map((kit) => {
            const selected = profile.kit === kit.id;
            const open = owns(profile, { kind: "kit", kit });
            return (
              <li key={kit.id}>
                <button
                  type="button"
                  className={selected ? "kit selected" : "kit"}
                  disabled={!open}
                  aria-pressed={selected}
                  onClick={() => onChange({ ...profile, kit: kit.id })}
                >
                  <KitPicture kit={kit} />
                  {kit.name}
                  {!open && (
                    <small className="lock">
                      <LockIcon /> Level {kit.unlockLevel}
                    </small>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
};

const newThing = (reward: Reward) => (reward.kind === "kit" ? "New kit" : "New stage");

/** What the levels a game gained unlocked. */
const Unlocked = ({ rewards }: { rewards: GameRewards }) =>
  rewards.levelled.map((reward) => (
    <p key={nameOf(reward)} className="unlocked">
      {newThing(reward)}: {nameOf(reward)}
    </p>
  ));

/** The XP a game earned, on a bar filling from where the player was to where they are now. */
const XpGain = ({ rewards, xpBefore }: { rewards: GameRewards; xpBefore: number }) => {
  const levelledUp = rewards.levelAfter > rewards.levelBefore;
  const end = levelProgress(rewards.progress.xp);
  const [filled, setFilled] = useState(levelledUp ? 0 : levelProgress(xpBefore));
  useEffect(() => {
    // After the bar has drawn where it starts, so it visibly fills.
    const timer = setTimeout(() => setFilled(end), 150);
    return () => clearTimeout(timer);
  }, [end]);
  return (
    <div className="xp">
      <div className="xp-head">
        <span>+{rewards.xp.toLocaleString("en-GB")} XP</span>
        <strong className={levelledUp ? "level-up" : undefined}>
          {levelledUp ? `Level up! Level ${rewards.levelAfter}` : `Level ${rewards.levelAfter}`}
        </strong>
      </div>
      <div className="xp-bar">
        <span style={{ width: `${filled * 100}%` }} />
      </div>
    </div>
  );
};

const Results = ({
  summary,
  newBest,
  rewards,
  xpBefore,
  online,
  onOpenPack,
  onLeaderboard,
  onAgain,
  onMenu,
}: {
  summary: Summary;
  newBest: boolean;
  rewards: GameRewards;
  xpBefore: number;
  online: Online;
  onOpenPack: () => void;
  onLeaderboard: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) => (
  <main className="screen results">
    <p className="eyebrow">{summary.outOfLives ? "Out of lives" : "Full time"}</p>
    <h2>Game over</h2>
    <div className="final">
      <span>Final score</span>
      <strong>{summary.score.toLocaleString("en-GB")}</strong>
      {newBest && summary.score > 0 && <em>New best!</em>}
    </div>
    <div className="stats">
      <div>
        <strong className="teal">{summary.bestStreak}×</strong>
        <span>Best streak</span>
      </div>
      <div>
        <strong>{summary.headers}</strong>
        <span>Headers</span>
      </div>
      <div>
        <strong>{Math.round(summary.accuracy * 100)}%</strong>
        <span>Accuracy</span>
      </div>
    </div>
    <XpGain rewards={rewards} xpBefore={xpBefore} />
    <Unlocked rewards={rewards} />
    <p className={online.state === "posted" ? "online-result ranked" : "online-result"}>
      {onlineLine(online)}
    </p>
    <button type="button" className="button pack-button" onClick={onOpenPack}>
      Open your pack <PackIcon />
    </button>
    <button type="button" className="text-button" onClick={onAgain}>
      Play again ↻
    </button>
    <button type="button" className="text-button" onClick={onLeaderboard}>
      <TrophyIcon /> Leaderboard
    </button>
    <button type="button" className="text-button" onClick={onMenu}>
      ← Menu
    </button>
  </main>
);

/**
 * Moves between signing in and the title as one screen: the ball and the name glide from where one
 * has them to where the other does, while the rest fades across (see .title in styles.css). Where
 * the browser can't, it just changes.
 */
const glide = (change: () => void) => {
  if (!("startViewTransition" in document)) {
    change();
    return;
  }
  document.startViewTransition(() => flushSync(change));
};

export const App = () => {
  const wide = useWide();
  const [profile, setProfile] = useState(loadProfile);
  const [session, setSession] = useState<Session | undefined>(loadSession);
  // Someone new picks a username first; anyone who has one goes straight to the title, or to how
  // to play if they've not been through it yet.
  const [screen, setScreen] = useState<Screen>(() =>
    !loadSession()
      ? { name: "login" }
      : !profile.team
        ? { name: "team" }
        : profile.tutored
          ? { name: "title" }
          : { name: "tutorial", round: 0, level: undefined },
  );
  const [online, setOnline] = useState<Online>({ state: "guest" });
  const [records, setRecords] = useState<Records>(loadRecords);
  /** Counts the rounds played, so each is a fresh game, even a level played again. */
  const rounds = useRef(0);

  useEffect(() => {
    // Fetch the game and the player model while the player reads the title screen.
    void loadGame().then((game) => game.preload());
  }, []);

  // Where the next round's most likely to be played: the stage being looked at, or the player's
  // own venue. Its shaders are compiled while the menus are idle (see warmUp in game/Game.tsx).
  const nextVenue =
    screen.name === "stage"
      ? screen.venue
      : screen.name === "playing" || screen.name === "tutorial"
        ? undefined
        : profile.venue;
  useEffect(() => {
    if (nextVenue) void loadGame().then((game) => game.warmUp(profile, nextVenue));
  }, [profile, nextVenue]);

  useEffect(() => {
    // Checks the saved sign-in still holds. If the name's no longer theirs, they pick another;
    // if the server can't be reached, they stay signed in and play on.
    const saved = loadSession();
    if (!saved) return;
    signIn(saved.username, saved.token).catch((error: unknown) => {
      if (error instanceof OnlineError && error.status === 409) {
        forgetSession();
        setSession(undefined);
        setScreen((s) => (s.name === "title" ? { name: "login" } : s));
      }
    });
  }, []);

  /**
   * Where someone goes once they've a name, or have chosen to play as a guest: the club they
   * support, if they've not picked one, then how to play, if they're new, before they see the Play
   * button, or the title.
   */
  const arrive = (from: Profile = profile) =>
    setScreen(
      !from.team
        ? { name: "team" }
        : from.tutored
          ? { name: "title" }
          : { name: "tutorial", round: ++rounds.current, level: undefined },
    );

  const signedIn = (next: Session) =>
    glide(() => {
      setSession(next);
      // A new player's shirt shows their username, unless they've named it themselves.
      if (profile.name === DEFAULT_PROFILE.name) {
        update({ ...profile, name: next.username.toUpperCase().slice(0, NAME_LENGTH) });
      }
      arrive();
    });

  const signOut = () => {
    forgetSession();
    setSession(undefined);
    setScreen({ name: "login" });
  };

  /**
   * Posts a finished game to the leaderboard, if the player's signed in, with the XP they have now,
   * all told, which is what the leaderboard ranks. A free-play game goes on its venue's board too.
   * A level's game counts its XP but not its score.
   */
  const post = (summary: Summary, xp: number, level: Level | undefined) => {
    if (!session) {
      setOnline({ state: "guest" });
      return;
    }
    setOnline({ state: "posting" });
    postScore(session, {
      score: level ? 0 : summary.score,
      bestStreak: summary.bestStreak,
      headers: summary.headers,
      xp,
      ...(level ? {} : { venue: profile.venue }),
    })
      .then((posted) => setOnline({ state: "posted", posted }))
      .catch((error: unknown) => {
        if (error instanceof OnlineError && error.status === 401) {
          forgetSession();
          setSession(undefined);
          setOnline({
            state: "failed",
            message: "Sign in again to add your XP to the leaderboard",
          });
        } else {
          setOnline({ state: "failed", message: "Couldn't add your XP: you're offline" });
        }
      });
  };

  const update = (next: Profile) => {
    setProfile(next);
    saveProfile(next);
  };

  /**
   * Starts a round: a level, at its own venue on its own seed, or free play at the venue the
   * player's chosen, on a fresh one. `from` is the profile to play with, if it's just changed.
   */
  const start = (level: Level | undefined, from: Profile = profile) => {
    const venue = level?.venue ?? from.venue;
    if (from !== profile || venue !== profile.venue) update({ ...from, venue });
    // Someone new learns how to play first, then plays.
    if (!from.tutored) {
      setScreen({ name: "tutorial", round: ++rounds.current, level });
      return;
    }
    setScreen({
      name: "playing",
      round: ++rounds.current,
      level,
      seed: level?.seed ?? Math.floor(Math.random() * 2 ** 31),
    });
  };
  const play = () => start(undefined);

  /** How to play, any time, from the title. */
  const learn = () => setScreen({ name: "tutorial", round: ++rounds.current, level: undefined });
  /** Once they've been through it, or skipped it, it's not shown again unless they ask. */
  const learned = (level: Level | undefined) => {
    const next = { ...profile, tutored: true };
    update(next);
    start(level, next);
  };
  // The tutorial's at Sunny Park, wherever the player's chosen to play.
  const tutorProfile = useMemo((): Profile => ({ ...profile, venue: "park" }), [profile]);

  // A finished game banks its XP and opens its pack straight away, so a reward is kept even if the
  // player leaves before seeing it revealed, and posts the XP the player has now to the leaderboard.
  // A level run also banks the XP for any medal it's won there for the first time. Its score isn't
  // a free-play best: levels differ in length and lives, so their scores don't compare with free
  // play's, and a level's best is kept here only.
  const finish = (level: Level | undefined) => (summary: Summary, trace: Trace) => {
    if (!level) {
      const rewards = rewardGame(profile, summary.score, Math.random);
      update({ ...profile, ...rewards.progress, best: Math.max(profile.best, summary.score) });
      post(summary, rewards.progress.xp, undefined);
      setScreen({
        name: "results",
        summary,
        newBest: summary.score > profile.best,
        rewards,
        xpBefore: profile.xp,
        run: undefined,
      });
      return;
    }
    const recorded = recordRun(records, level, summary, trace);
    setRecords(recorded.records);
    saveRecords(recorded.records);
    const rewards = rewardGame(profile, summary.score, Math.random, recorded.run.bonusXp);
    update({ ...profile, ...rewards.progress });
    post(summary, rewards.progress.xp, level);
    setScreen({
      name: "results",
      summary,
      newBest: recorded.run.newBest,
      rewards,
      xpBefore: profile.xp,
      run: recorded.run,
    });
  };

  const use = (reward: Reward, level: Level | undefined) => {
    start(
      level,
      reward.kind === "kit"
        ? { ...profile, kit: reward.kit.id }
        : { ...profile, venue: reward.venue.id },
    );
  };

  /** The level after one in its stage, if it's open. */
  const nextAfter = (level: Level) => {
    const next = levelsAt(level.venue)[level.number];
    return next && canPlay(records, next) ? next : undefined;
  };

  // On a wide window, every screen fills it (see wide.ts and wide.css).
  return (
    <div className={wide ? "stage wide" : "stage"}>
      {screen.name === "login" && (
        <Login onSignedIn={signedIn} onGuest={() => glide(() => arrive())} />
      )}
      {screen.name === "team" && (
        <TeamPicker
          onPick={(team) => {
            const next = supports(profile, team);
            update(next);
            glide(() => arrive(next));
          }}
        />
      )}
      {screen.name === "title" && (
        <Home
          profile={profile}
          username={session?.username}
          onPlay={play}
          onLearn={learn}
          onCustomise={() => setScreen({ name: "customise" })}
          onVenue={() => setScreen({ name: "stages" })}
          onLeaderboard={() => setScreen({ name: "leaderboard" })}
          onSignIn={() => glide(() => setScreen({ name: "login" }))}
        />
      )}
      {screen.name === "leaderboard" && (
        <Leaderboard
          session={session}
          venue={profile.venue}
          {...(screen.opening ? { opening: screen.opening } : {})}
          onBack={() => setScreen({ name: "title" })}
          onSignIn={() => setScreen({ name: "login" })}
          onSignOut={signOut}
        />
      )}
      {screen.name === "customise" && (
        <Customise
          profile={profile}
          opening={screen.tab}
          onChange={update}
          onBack={() => setScreen({ name: "title" })}
        />
      )}
      {screen.name === "stages" && (
        <StagePicker
          profile={profile}
          records={records}
          onStage={(venue) => setScreen({ name: "stage", venue })}
          onBack={() => setScreen({ name: "title" })}
        />
      )}
      {screen.name === "stage" && (
        <StageLevels
          profile={profile}
          records={records}
          venue={screen.venue}
          onPlay={(level) => start(level)}
          onFreePlay={(venue) => start(undefined, { ...profile, venue })}
          onBack={() => setScreen({ name: "stages" })}
        />
      )}
      {screen.name === "playing" && (
        <Suspense fallback={<Loading done={0} />}>
          <Game
            key={screen.round}
            profile={profile}
            rules={screen.level?.rules ?? freePlayAt(profile.venue)}
            seed={screen.seed}
            level={screen.level}
            best={screen.level && records[screen.level.id]?.splits}
            onFinish={finish(screen.level)}
            onRestart={() => start(screen.level)}
            onQuit={() =>
              setScreen(
                screen.level ? { name: "stage", venue: screen.level.venue } : { name: "title" },
              )
            }
          />
        </Suspense>
      )}
      {screen.name === "tutorial" && (
        <Suspense fallback={<Loading done={0} />}>
          <Game
            key={screen.round}
            profile={tutorProfile}
            rules={TUTORIAL_RULES}
            seed={1}
            // A new player's first time through can't be skipped or left.
            tutorial={{ onDone: () => learned(screen.level), required: !profile.tutored }}
            onFinish={() => learned(screen.level)}
            onRestart={learn}
            onQuit={() => {
              if (!profile.tutored) update({ ...profile, tutored: true });
              setScreen({ name: "title" });
            }}
          />
        </Suspense>
      )}
      {screen.name === "results" && screen.run && (
        <LevelResults
          summary={screen.summary}
          run={screen.run}
          xp={<XpGain rewards={screen.rewards} xpBefore={screen.xpBefore} />}
          levelled={<Unlocked rewards={screen.rewards} />}
          hasPack={screen.rewards.pack !== undefined}
          next={nextAfter(screen.run.level)}
          onRetry={() => start(screen.run?.level)}
          onNext={() => {
            const next = screen.run && nextAfter(screen.run.level);
            if (next) start(next);
          }}
          onOpenPack={() =>
            setScreen({ name: "pack", rewards: screen.rewards, level: screen.run?.level })
          }
          onLevels={() => setScreen({ name: "stage", venue: screen.run?.level.venue ?? "park" })}
          onMenu={() => setScreen({ name: "title" })}
        />
      )}
      {screen.name === "results" && !screen.run && (
        <Results
          summary={screen.summary}
          newBest={screen.newBest}
          rewards={screen.rewards}
          xpBefore={screen.xpBefore}
          online={online}
          onOpenPack={() => setScreen({ name: "pack", rewards: screen.rewards, level: undefined })}
          // Straight to the board of the venue just played.
          onLeaderboard={() =>
            setScreen({
              name: "leaderboard",
              opening: { kind: "venue", venue: profile.venue },
            })
          }
          onAgain={play}
          onMenu={() => setScreen({ name: "title" })}
        />
      )}
      {screen.name === "pack" && (
        <Pack
          rewards={screen.rewards}
          profile={profile}
          onUse={(reward) => use(reward, screen.level)}
          onAgain={() => start(screen.level)}
          onMenu={() => setScreen({ name: "title" })}
        />
      )}
    </div>
  );
};
