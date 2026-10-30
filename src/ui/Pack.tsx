import { useEffect, useRef, useState } from "react";
import { kitById } from "../kits";
import type { Profile } from "../profile";
import { type GameRewards, nameOf, PACK_BONUS_XP, rarityOf, type Reward } from "../progression";
import { BallIcon } from "./icons";
import { KitPicture } from "./KitPicture";
import { calm, load3D } from "./studio";
import type { Contents, Phase } from "./three";
import "./ui.css";
import { VenuePicture } from "./VenuePicture";

/** What's in a pack, for the 3D show. */
const contentsOf = (reward: Reward | undefined): Contents =>
  !reward
    ? { kind: "complete" }
    : reward.kind === "kit"
      ? { kind: "kit", kit: reward.kit }
      : { kind: "venue", venue: reward.venue };

/**
 * The pack every game ends with. It's opened like a walkout: it builds, bursts, and what was
 * inside rises out of the light, more of a show the rarer it is (see three/pack.ts). A tap opens
 * it, and another skips the build. Without WebGL it's a flat foil card that flips to what's
 * inside, and for a player who's asked for less motion, a tap goes straight there.
 */
export const Pack = ({
  rewards,
  profile,
  onUse,
  onAgain,
  onMenu,
}: {
  rewards: GameRewards;
  profile: Profile;
  onUse: (reward: Reward) => void;
  onAgain: () => void;
  onMenu: () => void;
}) => {
  const reward = rewards.pack;
  const rarity = reward ? rarityOf(reward) : "legendary";
  const [phase, setPhase] = useState<Phase>("waiting");
  /** Whether it's the flat version, without WebGL. */
  const [flat, setFlat] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const open = useRef<() => void>(() => undefined);

  useEffect(() => {
    let current = true;
    let cleanUp: (() => void) | undefined;
    void load3D().then((three) => {
      const element = holder.current;
      if (!current || !element) return;
      const stage = three?.stage(element);
      if (!three || !stage) {
        setFlat(true);
        open.current = () => setPhase("revealed");
        return;
      }
      // The show keeps its own clock, since the loop stops when nothing's moving.
      let clock = 0;
      let stop: (() => void) | undefined;
      const run = () => {
        stop ??= three.play((_, dt) => {
          clock += dt;
          const more = show.frame(clock, dt);
          stage.render(show);
          if (!more) stop = undefined;
          return more;
        });
      };
      const show = three.packShow({
        contents: contentsOf(reward),
        rarity,
        name: profile.name,
        number: profile.number,
        kit: kitById(profile.kit),
        calm: calm(),
        onPhase: (next) => {
          if (current) setPhase(next);
          run();
        },
      });
      const fit = () => {
        const { width, height } = stage.resize();
        show.resize(width, height);
        run();
      };
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(element);
      open.current = () => {
        show.open();
        run();
      };
      cleanUp = () => {
        stop?.();
        observer.disconnect();
        stage.release();
        show.dispose();
      };
    });
    return () => {
      current = false;
      cleanUp?.();
    };
    // Set up once: a pack's contents don't change while it's on screen.
  }, []);

  const opening = phase === "waiting" || phase === "building";
  return (
    <main className={`screen pack-screen pack-${phase} pack-${rarity}${flat ? " pack-flat" : ""}`}>
      <div className="pack-stage" ref={holder} aria-hidden="true" />
      {/* Only while it bursts: gone the moment what came out is named, however slow the phone. */}
      {phase === "burst" && !flat && <div className="pack-flash" aria-hidden="true" />}
      <p className="eyebrow">Your pack</p>
      {flat && opening && (
        <span className="flat-pack" aria-hidden="true">
          <span className="flat-pack-shine" />
          <BallIcon />
          <strong>Heads Up</strong>
        </span>
      )}
      {opening && (
        <button
          type="button"
          className="pack-tap"
          aria-label={phase === "waiting" ? "Open your pack" : "Skip to what's inside"}
          onClick={() => open.current()}
        >
          <span className="pack-hint">{phase === "waiting" ? "Tap to open" : ""}</span>
        </button>
      )}
      {phase === "revealed" && (
        <div className="pack-reveal" role="status">
          {flat && reward && (
            <span className="pack-reveal-picture">
              {reward.kind === "kit" ? (
                <KitPicture kit={reward.kit} />
              ) : (
                <VenuePicture venue={reward.venue} kit={kitById(profile.kit)} />
              )}
            </span>
          )}
          <span className="rarity">{reward ? rarity : "Complete"}</span>
          <small>
            {reward
              ? reward.kind === "kit"
                ? "New kit"
                : "New venue"
              : `+${PACK_BONUS_XP} XP instead`}
          </small>
          <h2>{reward ? nameOf(reward) : "You've got everything!"}</h2>
          <div className="pack-actions">
            {reward && (
              <button type="button" className="button again-button" onClick={() => onUse(reward)}>
                {reward.kind === "kit" ? "Wear it ▶" : "Play here ▶"}
              </button>
            )}
            <button
              type="button"
              className={reward ? "text-button" : "button again-button"}
              onClick={onAgain}
            >
              Play again ↻
            </button>
            <button type="button" className="text-button" onClick={onMenu}>
              ← Menu
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
