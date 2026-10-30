import * as THREE from "three";
import type { Item, Round } from "../engine";
import { PUFF_KINDS, puffCloud } from "./smoke";
import { DRIFT_SPAN, type TwistRule } from "./twist";
import {
  betweenLanes,
  PLAIN,
  progress,
  SHOWN,
  smooth,
  type TwistContext,
  type TwistView,
} from "./view";

// The Beach: gusts of sea breeze blow a whole wave one lane across. Just before a gust takes it,
// sand blows across the pitch the way it's going: low sheets of it snaking over the beach, and
// wisps whipping through the air. The palms bend over with it, and what's caught leans into it as
// it slides over, settling in its new lane with time to spare (see twists/twist.ts). The palms
// spring back once it's passed. The sand's all one draw, in wispy puffs (see smoke.ts).

/** How many low sheets of sand snake over the beach, and how many wisps whip through the air. */
const SHEETS = 16;
const WISPS = 40;
/** How far either side of the middle the sand blows before it comes round again, fading out. */
const ACROSS = 10;
/** How long before a gust takes a wave that the sand starts to blow, as a share of its flight. */
const WARNING = 0.16;
/**
 * How far the palms bend over in a gust, in radians, and how quickly they go over and come back:
 * bowing fast, then springing back more slowly once it's passed.
 */
const BEND = { lean: 0.16, flutter: 0.025, over: 4, back: 1.6 };

const driftOf = (item: Item) => (item.twist?.kind === "drift" ? item.twist : undefined);

export const beach = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, camera, pathAt, calm } = context;
  if (rule.kind !== "breeze") return PLAIN;

  // The blown sand, in streaks along the wind, paler than the beach, as sand in the air is, so it
  // shows as a haze over the sand as well as against the sea and the sky: low sheets of it, wide
  // and slower, and thin wisps through the air, long and fast. Each comes from its own place, the
  // same every time.
  const cloud = puffCloud(SHEETS + WISPS, 0, "streaks");
  scene.add(cloud.object);
  const sheetColours = ["#efd9a8", "#e6cd96", "#f3e2b8"].map((c) => new THREE.Color(c));
  const wispColours = ["#e9d3a0", "#dcc08a", "#f0dcae"].map((c) => new THREE.Color(c));
  const sand = Array.from({ length: SHEETS + WISPS }, (_, i) => {
    const sheet = i < SHEETS;
    const r = (n: number) => ((((i + 1) * n) % 1) + 1) % 1;
    return {
      sheet,
      from: new THREE.Vector3(
        r(0.618034) * ACROSS * 2 - ACROSS,
        sheet ? 0.12 + r(0.414214) * 0.35 : 0.3 + r(0.414214) * 3.4,
        -1.5 - r(0.732051) * 18,
      ),
      speed: sheet ? 6 + r(0.271828) * 4 : 10 + r(0.271828) * 8,
      size: sheet ? 3.5 + r(0.577215) * 2.5 : 1.8 + r(0.577215) * 1.6,
      stretch: sheet ? 0.32 + r(0.33) * 0.1 : 0.18 + r(0.33) * 0.08,
      solid: sheet ? 0.5 + r(0.19) * 0.2 : 0.6 + r(0.19) * 0.25,
      bob: r(0.91) * Math.PI * 2,
      puff: {
        at: new THREE.Vector3(),
        size: 0,
        spin: 0,
        opacity: 0,
        colour: (sheet ? sheetColours : wispColours)[i % 3] ?? new THREE.Color(),
        kind: i % PUFF_KINDS,
        stretch: 1,
      },
    };
  });
  const puffs = sand.map((grain) => grain.puff);
  let blown = 0;
  /** The palms (see props/models.ts and props/palms.ts), found once the venue's dressed. */
  let palms: THREE.Object3D | undefined;
  /** How far over they're bent now, in radians: negative bends them to the right. */
  let bent = 0;

  return {
    dress: (item) => {
      const drift = driftOf(item);
      if (!drift) return undefined;
      const way = Math.sign(item.lane - drift.from);
      const across = (p: number) => smooth(drift.at, drift.at + DRIFT_SPAN, p);
      return {
        move: (current, _round, p) => {
          if (p >= 1) return undefined;
          const at = betweenLanes(pathAt, current, drift.from, current.lane, p, across(p));
          return { air: at, ground: at };
        },
        update: (current, round, object) => {
          // Leaning into the gust as it's blown across.
          const p = progress(current, round.now);
          object.rotation.z -= way * Math.sin(Math.PI * across(p)) * 0.6;
          return SHOWN;
        },
        dispose: () => undefined,
      };
    },

    update: (round: Round, seconds: number, dt: number) => {
      // The gust blowing now, if any: from just before it takes a wave until it's set it down.
      const gust = round.items.find((i) => {
        const drift = driftOf(i);
        const p = progress(i, round.now);
        return drift && p > drift.at - WARNING && p < drift.at + DRIFT_SPAN;
      });
      const drift = gust && driftOf(gust);
      const way = gust && drift ? Math.sign(gust.lane - drift.from) : 0;
      blown += ((way ? 1 : 0) - blown) * Math.min(1, dt * 10);
      // The palms bow the way it's blowing, fluttering in it, and spring back once it's gone. A
      // player who's asked for less motion sees them lean, without the flutter.
      palms ??= scene.getObjectByName("props");
      const flutter = calm ? 0 : Math.sin(seconds * 6.5) * BEND.flutter * blown;
      const target = -way * BEND.lean + flutter;
      bent += (target - bent) * Math.min(1, dt * (way ? BEND.over : BEND.back));
      if (palms) palms.userData.lean = bent;
      // The sand, blowing the way the gust is, round across the pitch so it keeps coming, and
      // fading out towards either side, so none of it pops in or out. A player who's asked for
      // less motion sees it shorter and only drifting.
      for (const [i, grain] of sand.entries()) {
        const { puff, from } = grain;
        puff.opacity = 0;
        if (blown <= 0.02) continue;
        const span = ACROSS * 2;
        const travel = (way || 1) * seconds * grain.speed * (calm ? 0.15 : 1);
        const x = ((((from.x + travel + ACROSS) % span) + span) % span) - ACROSS;
        const edges = 1 - THREE.MathUtils.smoothstep(Math.abs(x), ACROSS * 0.6, ACROSS);
        const ripple = calm ? 0 : Math.sin(seconds * (grain.sheet ? 2 : 3) + grain.bob);
        puff.at.set(x, from.y + ripple * (grain.sheet ? 0.04 : 0.08), from.z);
        puff.size = grain.size * (calm ? 0.5 : 1);
        puff.stretch = grain.stretch;
        // Its tail trailing behind, the way the wind's blowing, and turning a little as it goes.
        puff.spin = (grain.sheet ? 0.05 : 0.03) * ripple + (way < 0 ? Math.PI : 0) + (i % 2) * 0.04;
        puff.opacity = blown * grain.solid * edges;
      }
      cloud.draw(puffs, camera);
    },
    warmUp: [cloud.warmUp],
    dispose: () => {
      scene.remove(cloud.object);
      cloud.dispose();
    },
  };
};
