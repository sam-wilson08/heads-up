import * as THREE from "three";
import { arrivalOf, type Item } from "../engine";
import type { TwistRule } from "./twist";
import {
  glowDisc,
  glowSprite,
  PLAIN,
  progress,
  ringTexture,
  smooth,
  type TwistContext,
  type TwistView,
} from "./view";

// Volcano: lava bombs come down out of the sky beside the ball, into a lane at the player's end.
// From the moment one's thrown, a ring glows on the pitch where it'll land, with a shimmer of heat
// rising from it, brighter as the bomb falls, so there's always time to step out of its lane. It
// lands with the ball beside it, and bursts. The engine makes room for it (see twists/twist.ts).

const LAVA = new THREE.Color("#ff6a1a");
/** Where a bomb is thrown from: high over the far end of the pitch, low enough to stay in view. */
const FROM = { y: 7.5, z: -24 };
/** How far in front of the player's feet the ring sits, so their body doesn't hide it. */
const RING_Z = -0.55;

const isBomb = (item: Item) => item.twist?.kind === "bomb";

export const volcano = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, contactAt, calm } = context;
  if (rule.kind !== "bombs") return PLAIN;
  const ring = ringTexture();
  const glow = glowDisc();
  const pillarGeometry = new THREE.CylinderGeometry(0.42, 0.5, 3.2, 20, 1, true);

  /** The ring where a bomb will land, and the shimmer of heat rising from it. */
  const marks = () => {
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 1.25),
      new THREE.MeshBasicMaterial({
        map: ring,
        color: LAVA,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    const pillar = new THREE.Mesh(
      pillarGeometry,
      new THREE.MeshBasicMaterial({
        color: LAVA,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    return { marker, pillar };
  };

  return {
    dress: (item) => {
      if (!isBomb(item)) return undefined;
      const end = contactAt(item, item.lane);
      const start = new THREE.Vector3(end.x * 1.8, FROM.y, FROM.z);
      const { marker, pillar } = marks();
      marker.position.set(end.x, 0.03, RING_Z);
      pillar.position.set(end.x, 1.6, RING_Z);
      const splash = glowSprite(glow, "#ffb46a");
      splash.visible = false;
      scene.add(marker, pillar, splash);
      return {
        // Down out of the sky, speeding up as it falls, onto the head in its lane.
        move: (_current, _round, p) => {
          const t = Math.min(Math.max(p, 0), 1);
          const air = new THREE.Vector3(
            THREE.MathUtils.lerp(start.x, end.x, t),
            THREE.MathUtils.lerp(start.y, end.y, t * t),
            THREE.MathUtils.lerp(start.z, end.z, t),
          );
          return { air, ground: new THREE.Vector3(end.x, 0, RING_Z) };
        },
        update: (current, round, object, at) => {
          const p = progress(current, round.now);
          const since = round.now - arrivalOf(current);
          const coming = since < 0;
          // The ring brightens and tightens as the bomb comes, pulsing.
          const near = smooth(0, 1, p);
          const pulse = calm ? 0.5 : (Math.sin(round.now * (0.01 + near * 0.025)) + 1) / 2;
          marker.visible = pillar.visible = coming;
          marker.material.opacity = 0.45 + near * 0.45 + pulse * 0.1;
          marker.scale.setScalar(1.15 - near * 0.25 + pulse * 0.06);
          pillar.material.opacity = 0.06 + near * 0.16 + pulse * 0.05;
          if (!calm) object.rotation.set(round.now * 0.006, round.now * 0.004, 0);
          // A burst where it lands.
          splash.visible = since >= 0 && since < 400;
          if (splash.visible) {
            const t = since / 400;
            splash.position.copy(at);
            splash.scale.setScalar(0.8 + t * 2.4);
            splash.material.opacity = 1 - t;
          }
          return { show: coming, glow: false, shadow: 0 };
        },
        dispose: () => {
          scene.remove(marker, pillar, splash);
          marker.geometry.dispose();
          marker.material.dispose();
          pillar.material.dispose();
          splash.material.dispose();
        },
      };
    },
    update: () => undefined,
    warmUp: [glowSprite(glow, LAVA), ...Object.values(marks())],
    dispose: () => {
      ring.dispose();
      glow.dispose();
      pillarGeometry.dispose();
    },
  };
};
