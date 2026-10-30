import * as THREE from "three";
import type { Item, Round } from "../engine";
import { DUST, dustDevils, thicknessOf, type Devil } from "./schedule";
import { PUFF_KINDS, puffCloud } from "./smoke";
import { strengthAt, type TwistRule } from "./twist";
import { PLAIN, type TwistContext, type TwistView } from "./view";

// Mars: dust devils spin up in a lane, out on the pitch, and hide whatever's coming down it until
// it's out in front of them, with half its flight to go. Each spins up slowly from the ground,
// which is its warning, and blows away after. They come from the round's seed (see schedule.ts).
// A devil is a column of swirling dust drawn over whatever's behind it, never over what's in
// front, so it hides just the far end of its lane: a thick core, with dust spiralling up round it,
// wider as it rises, and more whirling round its foot, darker low down and paler up top. All of
// it, for every devil, is one draw.

/** How many devils can be up at once: never more than two (see schedule.ts). */
const POOL = 2;
/**
 * How many puffs make a devil's core, which hides what's behind it, the dust spiralling up round
 * it, and the dust whirling round its foot.
 */
const CORE = 7;
const SWIRL = 16;
const FOOT = 5;
/** How tall the funnel is, and how wide it is at its foot and how much wider it gets as it rises. */
const TALL = 6.2;
const WAIST = [0.25, 0.17] as const;
/** How fast its dust spirals up, in funnels a second. */
const CLIMB = 0.3;
/** Its colours, from its foot to its top. */
const LOW = new THREE.Color("#e4773a");
const HIGH = new THREE.Color("#f7ae76");

export const mars = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, rules, seed, pathAt, calm } = context;
  if (rule.kind !== "dust") return PLAIN;
  const devils = dustDevils(rule, rules.roundMs, seed);
  const probe: Item = { id: 0, kind: "ball", lane: 0, launchedAt: 0, flightMs: 1000 };

  // The dust, for whichever devils are up: drawn after what it stands in front of, but not over
  // what's nearer.
  const cloud = puffCloud(POOL * (CORE + SWIRL + FOOT), 2);
  scene.add(cloud.object);
  const puffs = Array.from({ length: POOL * (CORE + SWIRL + FOOT) }, (_, k) => ({
    at: new THREE.Vector3(),
    size: 0,
    spin: 0,
    opacity: 0,
    colour: new THREE.Color(),
    kind: k % PUFF_KINDS,
    stretch: 1,
  }));
  /** How a devil sways at a height: more the higher up. */
  const sway = (height: number, seconds: number) => {
    const k = (height - 0.3) / 0.95;
    return calm ? 0 : Math.sin(seconds * 4 + k) * 0.08 * k;
  };
  /** How thick it is at a height, as it spins up from the ground: the low dust thickens first. */
  const riseAt = (height: number, thick: number) =>
    THREE.MathUtils.clamp(thick * 1.6 - ((height - 0.3) / 0.95) * 0.09, 0, 1);

  /** Where a devil stands: out on the pitch, where things in its lane come out in front of it. */
  const standAt = (devil: Devil) => {
    const s = strengthAt(rule, rules.roundMs, devil.from);
    return pathAt(probe, devil.lane, DUST.hidesTo(s));
  };

  return {
    dress: () => undefined,
    update: (round: Round, seconds: number) => {
      const up = devils.filter((d) => thicknessOf(d, round.now) > 0).slice(0, POOL);
      for (const puff of puffs) puff.opacity = 0;
      up.forEach((devil, n) => {
        const thick = thicknessOf(devil, round.now);
        const at = standAt(devil);
        const own = puffs.slice(n * (CORE + SWIRL + FOOT), (n + 1) * (CORE + SWIRL + FOOT));
        // Each devil turns at its own pace, so two side by side don't spin in step.
        const turning = calm ? 0 : seconds * (1 + n * 0.17);
        own.forEach((puff, k) => {
          if (k < CORE) {
            // The core, as thick and as wide as ever, so it hides just what it did.
            const height = 0.3 + k * 0.95;
            puff.at.set(at.x + sway(height, seconds), height, at.z);
            puff.size = 1.5 + k * 0.2;
            puff.opacity = 0.97 * riseAt(height, thick);
            puff.spin = calm ? k : turning * (1.6 + k * 0.25) + k;
            puff.colour.copy(LOW).lerp(HIGH, height / TALL);
            puff.stretch = 1;
            return;
          }
          if (k < CORE + SWIRL) {
            // Spiralling up round the core, wider as it rises, and turning faster low down. Set
            // back, so its nearest is level with the core and it hides nothing nearer.
            const j = k - CORE;
            const u = calm ? j / SWIRL : (j / SWIRL + seconds * CLIMB * (1 + n * 0.1)) % 1;
            const height = 0.2 + u * TALL;
            const wide = WAIST[0] + height * WAIST[1];
            const turn = j * 2.39996 + turning * (5.5 - height * 0.45);
            puff.at.set(
              at.x + sway(height, seconds) + Math.cos(turn) * wide,
              height,
              at.z + (Math.sin(turn) - 1) * wide * 0.55,
            );
            puff.size = 0.7 + height * 0.22;
            puff.opacity =
              0.75 *
              riseAt(height, thick) *
              THREE.MathUtils.smoothstep(u, 0, 0.08) *
              (1 - THREE.MathUtils.smoothstep(u, 0.85, 1));
            puff.spin = calm ? j : -turn * 0.5;
            // Its far side's in its own shade.
            puff.colour
              .copy(LOW)
              .lerp(HIGH, height / TALL)
              .multiplyScalar(0.88 + Math.sin(turn) * 0.12);
            puff.stretch = 1;
            return;
          }
          // Whirled round its foot, low and flat, set back as the spiral is.
          const j = k - CORE - SWIRL;
          const turn = (j / FOOT) * Math.PI * 2 + turning * 3;
          const wide = 0.75 + (j % 2) * 0.35;
          puff.at.set(
            at.x + Math.cos(turn) * wide,
            0.22 + (j % 3) * 0.06,
            at.z + (Math.sin(turn) - 1) * wide * 0.55,
          );
          puff.size = 1.5 + (j % 3) * 0.25;
          puff.stretch = 0.45;
          puff.opacity = 0.6 * riseAt(0.3, thick);
          puff.spin = calm ? j : -turn;
          puff.colour.copy(LOW).multiplyScalar(0.85);
        });
      });
      cloud.draw(puffs, context.camera);
    },
    warmUp: [cloud.warmUp],
    dispose: () => {
      scene.remove(cloud.object);
      cloud.dispose();
    },
  };
};
