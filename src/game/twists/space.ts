import * as THREE from "three";
import type { Item } from "../engine";
import { PORTAL_LEAD, type TwistRule } from "./twist";
import {
  glowSprite,
  PLAIN,
  progress,
  ringTexture,
  SHOWN,
  smooth,
  type TwistContext,
  type TwistView,
} from "./view";

// Space Stadium: a pair of portals opens in two lanes, an orange one in the lane something's
// coming down and a blue one in the lane it'll come out in. It flies into the orange one, and out
// of the blue one in the other lane, with half its flight still to go. The portals open well
// before it gets there, so the blue one says where it's going (see twists/twist.ts).

const IN = new THREE.Color("#ff8a3d");
const OUT = new THREE.Color("#46e6ff");
/** How long the portals stay open after the warp, as a share of the flight. */
const LINGER = 0.12;

const warpOf = (item: Item) => (item.twist?.kind === "warp" ? item.twist : undefined);

export const space = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, pathAt, calm } = context;
  if (rule.kind !== "warp") return PLAIN;
  const ring = ringTexture();

  return {
    dress: (item) => {
      const warp = warpOf(item);
      if (!warp) return undefined;
      const entry = glowSprite(ring, IN);
      const exit = glowSprite(ring, OUT);
      entry.position.copy(pathAt(item, warp.from, warp.at));
      exit.position.copy(pathAt(item, item.lane, warp.at));
      scene.add(entry, exit);
      return {
        move: (current, _round, p) => {
          if (p >= 1) return undefined;
          const at = pathAt(current, p < warp.at ? warp.from : current.lane, p);
          return { air: at, ground: at };
        },
        update: (current, round, object) => {
          const p = progress(current, round.now);
          // Open from PORTAL_LEAD before the warp, and close a little after.
          const open =
            smooth(warp.at - PORTAL_LEAD, warp.at - PORTAL_LEAD + 0.06, p) *
            (1 - smooth(warp.at + LINGER - 0.05, warp.at + LINGER, p));
          for (const portal of [entry, exit]) {
            portal.visible = open > 0.01;
            portal.scale.setScalar(1.25 * open);
            portal.material.rotation = calm ? 0 : round.now * 0.006;
          }
          // Squeezed through: it shrinks into one portal and grows out of the other.
          const squeeze = 1 - (1 - smooth(0, 0.05, Math.abs(p - warp.at))) * 0.85;
          object.scale.multiplyScalar(squeeze);
          return SHOWN;
        },
        dispose: () => {
          scene.remove(entry, exit);
          entry.material.dispose();
          exit.material.dispose();
        },
      };
    },
    update: () => undefined,
    warmUp: [glowSprite(ring, IN)],
    dispose: () => ring.dispose(),
  };
};
