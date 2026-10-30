import type { ReactNode } from "react";
import type { Summary } from "./game/engine";
import type { Slip, StreakBreak } from "./game/trace";
import { type Level, type Medal, MEDAL_XP, MEDALS, stageOf, targetsOf } from "./levels";
import "./levels.css";
import type { LevelRun } from "./records";
import { PackIcon } from "./ui/icons";
import { MedalIcon, PerfectIcon } from "./ui/MedalIcon";
import { venueById } from "./venues";

// After a level: the medal, the score against the targets and the best run, where the streak
// broke, and Retry, the big button, since practising a level means playing it again and again.

const NAMES: Record<Medal, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

const CAUSES: Record<Slip, string> = {
  missed: "Missed a ball",
  hit: "Knocked by a decoy",
  tripped: "Tripped",
  zapped: "Headed a zapped ball",
  overhead: "Let a high ball go over",
  ghosted: "Headed a ghost ball",
  frisbee: "Didn't duck a frisbee",
};

/** "0:23", for a time into the run. */
const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** The run as a bar, marked where the streak broke, with the costliest breaks listed under it. */
const Breaks = ({ breaks, roundMs }: { breaks: readonly StreakBreak[]; roundMs: number }) => {
  if (breaks.length === 0) {
    return <p className="breaks-none">The streak never broke. Lovely.</p>;
  }
  const costliest = [...breaks].sort((a, b) => b.streak - a.streak).slice(0, 3);
  return (
    <section className="breaks" aria-label="Where your streak broke">
      <div className="breaks-bar">
        {breaks.map((b, i) => (
          <span
            key={i}
            className={`break ${b.cause}`}
            style={{ left: `${Math.min(100, (b.at / roundMs) * 100)}%` }}
            title={`${clock(b.at)} ${CAUSES[b.cause]}`}
          />
        ))}
      </div>
      <ul>
        {costliest.map((b, i) => (
          <li key={i}>
            <b>{clock(b.at)}</b> {CAUSES[b.cause]}
            {b.streak > 1 && <em> ended a {b.streak}× streak</em>}
          </li>
        ))}
      </ul>
    </section>
  );
};

export const LevelResults = ({
  summary,
  run,
  xp,
  levelled,
  hasPack,
  next,
  onRetry,
  onNext,
  onOpenPack,
  onLevels,
  onMenu,
}: {
  summary: Summary;
  run: LevelRun;
  /** The XP bar, as the game's results show it. */
  xp: ReactNode;
  /** Lines for what the levels gained unlocked. */
  levelled: ReactNode;
  /** Whether the pack holds a new kit, worth opening. */
  hasPack: boolean;
  /** The stage's next level, if it's open now. */
  next: Level | undefined;
  onRetry: () => void;
  onNext: () => void;
  onOpenPack: () => void;
  onLevels: () => void;
  onMenu: () => void;
}) => {
  const { level, medal, earned, before } = run;
  const targets = targetsOf(level);
  const reached = medal ? MEDALS.indexOf(medal) : -1;
  // Against the best before this run, at the end of the run's last whole second.
  const beat = before && summary.score - before.best;
  return (
    <main className="screen results level-results">
      <p className="eyebrow">
        {venueById(level.venue).name} · {level.final ? "Final" : `Level ${level.number}`}
      </p>
      <h2 className={medal ? `medal-title ${medal}` : "medal-title"}>
        {medal ? (
          <>
            <MedalIcon medal={medal} /> {NAMES[medal]}
          </>
        ) : (
          "Out of lives"
        )}
      </h2>
      <p className="level-name">
        {level.name} · {stageOf(level.venue).title}
      </p>
      <div className="final">
        <span>Score</span>
        <strong>{summary.score.toLocaleString("en-GB")}</strong>
        {/* A best of nothing is one let go when the level's run changed (see records.ts). */}
        {run.newBest && before?.best ? (
          <em>New best! {beat !== undefined && `+${beat.toLocaleString("en-GB")}`}</em>
        ) : run.newBest ? (
          <em>Your first best</em>
        ) : before?.best ? (
          <em>Best {before.best.toLocaleString("en-GB")}</em>
        ) : null}
      </div>
      <ol className="medal-ladder" aria-label="Medals">
        {MEDALS.map((m, i) => (
          <li key={m} className={`${i <= reached ? "won" : ""}${earned.includes(m) ? " new" : ""}`}>
            <MedalIcon medal={m} empty={i > reached} />
            <span>{m === "bronze" ? "Finish" : targets[m].toLocaleString("en-GB")}</span>
            {earned.includes(m) && <b>+{MEDAL_XP[m]} XP</b>}
          </li>
        ))}
        <li className={`${run.perfect ? "won" : ""}${run.firstPerfect ? " new" : ""}`}>
          <PerfectIcon empty={!run.perfect} />
          <span>Every ball</span>
          {run.firstPerfect && <b>Perfect!</b>}
        </li>
      </ol>
      <Breaks breaks={run.trace.breaks} roundMs={level.rules.roundMs} />
      {xp}
      {levelled}
      <button type="button" className="button again-button retry-button" onClick={onRetry}>
        Retry ↻
      </button>
      <div className="level-actions">
        {next && (
          <button type="button" className="button home-tile" onClick={onNext}>
            Next: {next.name} ›
          </button>
        )}
        {hasPack && (
          <button type="button" className="button home-tile pack-tile" onClick={onOpenPack}>
            New kit <PackIcon />
          </button>
        )}
      </div>
      <p className="level-note">Level runs stay off the all-time leaderboard.</p>
      <button type="button" className="text-button" onClick={onLevels}>
        All levels
      </button>
      <button type="button" className="text-button" onClick={onMenu}>
        ← Menu
      </button>
    </main>
  );
};
