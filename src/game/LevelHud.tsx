import { type Level, nextTarget } from "../levels";
import { MedalIcon } from "../ui/MedalIcon";

// What a level run shows over the play, besides the score and clock: the next medal to go for,
// and how the run stands against the player's best on this level at the same second.

/** A split like "+1,240" or "−300", against the best run. */
export const splitText = (split: number): string =>
  `${split >= 0 ? "+" : "−"}${Math.abs(split).toLocaleString("en-GB")}`;

export const LevelHud = ({
  level,
  score,
  split,
}: {
  level: Level;
  score: number;
  /** The run's score less the best run's, at the last whole second; undefined without a best. */
  split: number | undefined;
}) => {
  const next = nextTarget(level, score);
  return (
    <div className="hud-practice" aria-live="off">
      <span className={next ? `hud-target ${next.medal}` : "hud-target done"}>
        {next ? (
          <>
            <MedalIcon medal={next.medal} /> {next.score.toLocaleString("en-GB")}
          </>
        ) : (
          <>
            <MedalIcon medal="gold" /> Gold!
          </>
        )}
      </span>
      {split !== undefined && (
        <span
          className={split >= 0 ? "hud-split ahead" : "hud-split behind"}
          title="Against your best run at the same second"
        >
          {splitText(split)}
        </span>
      )}
    </div>
  );
};
