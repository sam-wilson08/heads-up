import * as THREE from "three";
import { isHigh, type Item, type Lane, LANES, type Round } from "../engine";
import { trampolines } from "../props/funfair";
import { BOUNCE_AT, type TwistRule } from "./twist";
import {
  glowDisc,
  glowSprite,
  PLAIN,
  progress,
  SHOWN,
  type TwistContext,
  type TwistView,
} from "./view";

// The Funfair: a trampoline's set into each lane out on the pitch. A ball that's going to bounce
// comes off the throw low, dipping straight at its lane's trampoline, hits it at BOUNCE_AT of its
// flight and springs up into a high arc. That comes down where the player's head is at the top of
// a jump, so it can only be headed by jumping to meet it (see engine.ts); a player who stays on
// the ground watches it sail over them. As the ball hits, the trampoline stretches down and boings
// back with a "BOING!" over it: that's the warning, with time to jump (see twists.test.ts).

/** How far above its straight line a high ball's arc goes, at the top: high, but still on screen. */
const ARC = 3;
/** How much higher the head is at the top of a jump than standing: scene.ts's jump height. */
const HEAD_UP = 0.8;
/** How high a ball is when it hits a trampoline's bed. */
const BED = 0.5;
/** How long a trampoline wobbles after a bounce, and how long the BOING! shows. */
const BOING_MS = 900;

/** "BOING!" in fat candy letters with a dark outline, to show over a trampoline. */
const boingTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 112;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = `900 80px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 14;
    ctx.strokeStyle = "#2a1040";
    ctx.strokeText("BOING!", 128, 58);
    const fill = ctx.createLinearGradient(0, 20, 0, 96);
    fill.addColorStop(0, "#fff36b");
    fill.addColorStop(1, "#ff5fa2");
    ctx.fillStyle = fill;
    ctx.fillText("BOING!", 128, 58);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** When a high ball hits its trampoline, in milliseconds into the round. */
const bounceTime = (item: Item) => item.launchedAt + item.flightMs * BOUNCE_AT;

/**
 * How far a trampoline's bed is stretched down, `ms` after a ball hits it: down hard as it lands,
 * then springing back up past flat and settling.
 */
const stretchAt = (ms: number) => {
  if (ms < -60 || ms > BOING_MS) return 0;
  if (ms < 0) return 1 + ms / 60;
  return Math.exp(-ms / 180) * Math.cos(ms * 0.022);
};

export const funfair = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, pathAt, contactAt, calm } = context;
  if (rule.kind !== "bounce") return PLAIN;
  const probe: Item = { id: 0, kind: "ball", lane: 0, launchedAt: 0, flightMs: 1000 };

  // The scenery's trampolines, or some of the twist's own if there aren't any.
  let owned: THREE.Object3D | undefined;
  let group = scene.getObjectByName("trampolines");
  if (!group) {
    owned = group = trampolines();
    scene.add(owned);
  }
  /** Where a ball meets each lane's trampoline, with the trampoline put there under it. */
  const beds = new Map<Lane, THREE.Vector3>();
  const mats = new Map<Lane, THREE.Object3D>();
  const frames = new Map<Lane, THREE.Object3D>();
  for (const lane of LANES) {
    const at = pathAt(probe, lane, BOUNCE_AT);
    beds.set(lane, new THREE.Vector3(at.x, BED, at.z));
    const trampoline = group.getObjectByName(`trampoline-${lane}`);
    if (!trampoline) continue;
    trampoline.position.set(at.x, 0, at.z);
    frames.set(lane, trampoline);
    const mat = trampoline.getObjectByName("mat");
    if (mat) mats.set(lane, mat);
  }

  // A BOING! over each trampoline, and a flash on the bed, for when a ball hits it.
  const word = boingTexture();
  const disc = glowDisc();
  const boings = new Map(
    LANES.map((lane) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: word, transparent: true, depthWrite: false, fog: false }),
      );
      const flash = glowSprite(disc, "#fff1a8");
      sprite.visible = flash.visible = false;
      scene.add(sprite, flash);
      return [lane, { sprite, flash }] as const;
    }),
  );

  return {
    dress: (item) => {
      if (!isHigh(item)) return undefined;
      return {
        // Down off the throw onto the trampoline, then up and over in a high arc that comes down
        // where the head is at the top of a jump, and on over the player if it isn't there.
        move: (current, _round, p) => {
          if (p >= 1 && current.outcome === "header") return undefined;
          const lane = current.lane;
          const bed = beds.get(lane) ?? pathAt(current, lane, BOUNCE_AT);
          let air: THREE.Vector3;
          if (p <= BOUNCE_AT) {
            const t = Math.max(p, 0) / BOUNCE_AT;
            const launch = pathAt(current, lane, 0);
            air = launch.clone().lerp(bed, t);
            air.y = THREE.MathUtils.lerp(launch.y, bed.y, t * t) + 0.6 * t * (1 - t);
          } else {
            const s = (p - BOUNCE_AT) / (1 - BOUNCE_AT);
            const top = contactAt(current, lane).add(new THREE.Vector3(0, HEAD_UP, 0));
            air = bed.clone().lerp(top, s);
            // Past the player, it carries on over their head and out of sight, dropping gently.
            air.y = s <= 1 ? air.y + ARC * 4 * s * (1 - s) : top.y - (s - 1) * 2;
          }
          return { air, ground: new THREE.Vector3(air.x, 0, air.z) };
        },
        // Squashed flat for a moment as it hits the bed.
        update: (current, round, object) => {
          const since = round.now - bounceTime(current);
          if (!calm && since > -50 && since < 110) {
            const squash = Math.sin(((since + 50) / 160) * Math.PI) * 0.35;
            object.scale.multiply(
              new THREE.Vector3(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6),
            );
          }
          return SHOWN;
        },
        dispose: () => undefined,
      };
    },

    update: (round: Round) => {
      for (const lane of LANES) {
        // The latest bounce in this lane, if one's still wobbling it.
        const since = round.items
          .filter((i) => isHigh(i) && i.lane === lane && progress(i, round.now) < 2)
          .map((i) => round.now - bounceTime(i))
          .filter((ms) => ms > -60 && ms < BOING_MS)
          .sort((a, b) => a - b)[0];
        const stretch = since === undefined ? 0 : stretchAt(since) * (calm ? 0.6 : 1);
        const mat = mats.get(lane);
        if (mat) mat.scale.y = 0.02 + 0.28 * stretch;
        const frame = frames.get(lane);
        if (frame) frame.scale.y = 1 - Math.max(stretch, 0) * 0.15;
        const boing = boings.get(lane);
        const bed = beds.get(lane);
        if (!boing || !bed) continue;
        const shown = since !== undefined && since >= 0;
        boing.sprite.visible = boing.flash.visible = shown;
        if (!shown) continue;
        const t = since / BOING_MS;
        // It pops up big, settles, and fades as it floats up.
        const pop = since < 140 ? (since / 140) * 1.25 : 1.25 - Math.min(0.25, (since - 140) / 300);
        boing.sprite.position.set(bed.x, 1.5 + t * 0.8, bed.z);
        boing.sprite.scale.set(2.6 * pop, 1.14 * pop, 1);
        boing.sprite.material.opacity = 1 - THREE.MathUtils.smoothstep(t, 0.6, 1);
        boing.flash.position.set(bed.x, BED, bed.z);
        boing.flash.scale.setScalar(0.8 + t * 2.4);
        boing.flash.material.opacity = 1 - t;
      }
    },
    warmUp: [
      new THREE.Sprite(new THREE.SpriteMaterial({ map: word, transparent: true })),
      glowSprite(disc, "#fff1a8"),
    ],
    dispose: () => {
      for (const { sprite, flash } of boings.values()) {
        scene.remove(sprite, flash);
        sprite.material.dispose();
        flash.material.dispose();
      }
      word.dispose();
      disc.dispose();
      // Their materials are the props' own, shared with the scenery, so only their shapes go.
      if (owned) {
        scene.remove(owned);
        owned.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose();
        });
      }
    },
  };
};
