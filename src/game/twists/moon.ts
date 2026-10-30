import * as THREE from "three";
import { arrivalOf, type Item, type Round } from "../engine";
import type { TwistRule } from "./twist";
import {
  glowDisc,
  glowSprite,
  PLAIN,
  progress,
  smooth,
  type TwistContext,
  type TwistView,
} from "./view";

// The Moon: a UFO hangs over the pitch. When it's going to zap a ball, it swoops over it and its
// beam charges; then it fires, and the ball turns alien green, glowing and pulsing faster and
// faster as it comes, until it explodes just before it would be headed. The engine settles which
// balls are zapped and when (see twists/twist.ts); this only shows it, so there's always a UFO
// over the ball well before the zap, and the ball glows from the zap on.

const ZAP_GREEN = new THREE.Color("#5dff6a");
/** How long before the zap the beam starts to charge, and how long it fires for. */
const CHARGE_MS = 350;
const BEAM_MS = 220;
/** How long before reaching the player a zapped ball explodes. */
export const EXPLODE_MS = 90;
/** Where the UFO waits between zaps: high over the far end. */
const IDLE = new THREE.Vector3(0, 7.2, -24);
/** How far above a ball it hovers to zap it. */
const ABOVE = 2.4;

const zapOf = (item: Item) => (item.twist?.kind === "zap" ? item.twist : undefined);

/** When a ball is zapped, in milliseconds into the round, or never. */
const zapTime = (item: Item) => {
  const zap = zapOf(item);
  return zap ? item.launchedAt + item.flightMs * zap.at : Infinity;
};

export const moon = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, make, pathAt, calm } = context;
  if (rule.kind !== "zap") return PLAIN;
  const glow = glowDisc();

  const ufo = new THREE.Group();
  const saucer = make("ufo");
  saucer.scale.setScalar(1.7);
  saucer.rotation.x = 0.25;
  const charge = glowSprite(glow, ZAP_GREEN);
  charge.position.y = -0.3;
  ufo.add(saucer, charge);
  ufo.position.copy(IDLE);
  // The beam: a tall, thin cone of green light from the saucer's belly down to the ball.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.42, 1, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: ZAP_GREEN,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  beam.visible = false;
  scene.add(ufo, beam);
  const target = new THREE.Vector3();

  return {
    dress: (item) => {
      const zap = zapOf(item);
      if (!zap) return undefined;
      const aura = glowSprite(glow, ZAP_GREEN);
      const burst = glowSprite(glow, "#d8ffd0");
      aura.visible = burst.visible = false;
      scene.add(aura, burst);
      return {
        update: (current, round, _object, at, size) => {
          const p = progress(current, round.now);
          const zapped = p >= zap.at;
          const untilBang = arrivalOf(current) - EXPLODE_MS - round.now;
          // It glows from the zap, pulsing faster as the bang nears.
          aura.visible = zapped && untilBang > 0;
          if (aura.visible) {
            const fuse = smooth(zap.at, 1, p);
            const pulse = calm ? 0.5 : (Math.sin(round.now * (0.012 + fuse * 0.05)) + 1) / 2;
            aura.position.copy(at);
            aura.scale.setScalar(size * (2.1 + pulse * 0.9 + fuse * 0.6));
            aura.material.opacity = 0.65 + pulse * 0.35;
          }
          // Then it bursts in a flash that spreads and fades.
          const since = -untilBang;
          burst.visible = since >= 0 && since < 420;
          if (burst.visible) {
            const t = since / 420;
            burst.position.copy(at);
            burst.scale.setScalar(0.6 + t * 2.6);
            burst.material.opacity = 1 - t;
          }
          return { show: untilBang > 0, glow: !zapped };
        },
        dispose: () => {
          scene.remove(aura, burst);
          aura.material.dispose();
          burst.material.dispose();
        },
      };
    },

    update: (round: Round, seconds: number, dt: number) => {
      // The next ball due a zap, while its zap is still coming or has only just gone off.
      const next = round.items
        .filter((i) => round.now < zapTime(i) + BEAM_MS)
        .sort((a, b) => zapTime(a) - zapTime(b))[0];
      const untilZap = next ? zapTime(next) - round.now : Infinity;
      if (next) {
        // Over where the ball will be when it's zapped, following it on as it fires.
        const p = Math.max(progress(next, round.now), zapOf(next)?.at ?? 0);
        target.copy(pathAt(next, next.lane, Math.min(p, 1)));
        target.y += ABOVE;
      } else {
        // Idling: a slow drift from side to side, high over the far end.
        target.copy(IDLE);
        target.x = calm ? 0 : Math.sin(seconds * 0.6) * 3;
      }
      ufo.position.lerp(target, Math.min(1, dt * (next ? 9 : 2)));
      saucer.rotation.y += dt * 3;
      if (!calm) ufo.position.y += Math.sin(seconds * 3) * 0.002;

      // The beam charges under the saucer, then fires down to the ball.
      const charging = untilZap < CHARGE_MS && untilZap > 0;
      charge.visible = charging || (untilZap <= 0 && untilZap > -BEAM_MS);
      charge.scale.setScalar(0.6 + 1.4 * (charging ? 1 - untilZap / CHARGE_MS : 1));
      beam.visible = Boolean(next) && untilZap <= 0 && untilZap > -BEAM_MS;
      if (beam.visible && next) {
        const ball = pathAt(next, next.lane, progress(next, round.now));
        const top = ufo.position.clone().add(new THREE.Vector3(0, -0.2, 0));
        beam.position.copy(top).lerp(ball, 0.5);
        beam.scale.set(1, top.distanceTo(ball), 1);
        beam.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          top.clone().sub(ball).normalize(),
        );
        beam.material.opacity = 0.9 * (1 + untilZap / BEAM_MS);
      }
    },
    warmUp: [make("ufo"), glowSprite(glow, ZAP_GREEN)],
    dispose: () => {
      scene.remove(ufo, beam);
      beam.geometry.dispose();
      beam.material.dispose();
      charge.material.dispose();
      glow.dispose();
    },
  };
};
