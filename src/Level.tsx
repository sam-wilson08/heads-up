import { levelFor, levelProgress } from "./progression";

/** The player's level, with a bar for how far they are through it. */
export const LevelBadge = ({ xp }: { xp: number }) => {
  const level = levelFor(xp);
  const progress = levelProgress(xp);
  return (
    <span
      className="level"
      title={`${Math.round(progress * 100)}% of the way to level ${level + 1}`}
    >
      <strong>Level {level}</strong>
      <span className="level-bar" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </span>
    </span>
  );
};
