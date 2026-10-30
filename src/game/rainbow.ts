import * as THREE from "three";
import { glowTexture, rainbowTexture } from "./textures";

// The rainbow a football glows with while the player's on a streak: a swirling ring of colour
// round it, rainbow sparkles thrown off it, and the ball itself shimmering through the colours. It's
// kept for a streak of over 10, once the streak blazes, and builds to its brightest by 13.
//
// The balls fly almost straight at the camera, so a trail behind one would hide behind it. The
// sparkles fly out sideways instead, and stay where they were thrown as the ball comes on, so
// they spray round it, and stream after it once it's headed away.

const GLOW = { from: 11, full: 13 };
/** How bright the glow is at full strength: the ring, the sparkles and the ball's tint. */
const BRIGHTNESS = 0.3;
/**
 * Sparkles: how many each ball can have in the air, how long each lasts in seconds, how many it
 * throws off a second at full strength, and how fast they fly out, in metres a second.
 */
const SPARKS = { count: 36, life: 0.6, rate: 55, speed: 1.6 };

/** How strongly footballs glow for a streak, from 0 to 1. */
export const glowFor = (streak: number): number =>
  THREE.MathUtils.clamp((streak - GLOW.from + 1) / (GLOW.full - GLOW.from + 1), 0, 1);

export interface Glow {
  /** Moves the glow to the ball, `size` across, and shows it if the ball shows. */
  follow(position: THREE.Vector3, size: number, shown: boolean): void;
  dispose(): void;
}

export interface Rainbow {
  /** Gives a football its glow. */
  attach(ball: THREE.Object3D): Glow;
  /** Sets how strongly every football glows, from 0 to 1, and turns the colours. */
  update(strength: number, seconds: number): void;
  dispose(): void;
}

export const buildRainbow = (scene: THREE.Scene, calm: boolean): Rainbow => {
  const ring = new THREE.SpriteMaterial({
    map: rainbowTexture(),
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  const spark = new THREE.PointsMaterial({
    map: glowTexture(),
    size: 0.6,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const tinted = new Set<THREE.MeshStandardMaterial>();
  const colour = new THREE.Color();
  let strength = 0;
  let hue = 0;
  let now = 0;

  return {
    attach: (ball) => {
      // The ball's material is shared by every copy of it, so tinting it tints them all.
      ball.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          tinted.add(o.material);
        }
      });
      const halo = new THREE.Sprite(ring);
      const positions = new Float32Array(SPARKS.count * 3);
      const colours = new Float32Array(SPARKS.count * 4);
      const velocities = new Float32Array(SPARKS.count * 3);
      const hues = new Float32Array(SPARKS.count);
      // Every sparkle starts spent.
      const ages = new Float32Array(SPARKS.count).fill(SPARKS.life);
      const positionAttribute = new THREE.BufferAttribute(positions, 3);
      const colourAttribute = new THREE.BufferAttribute(colours, 4);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", positionAttribute);
      geometry.setAttribute("color", colourAttribute);
      const sparkles = new THREE.Points(geometry, spark);
      // Its points move every frame, so its bounds never hold for long.
      sparkles.frustumCulled = false;
      scene.add(halo, sparkles);
      let last = now;
      /** Sparkles owed, building up between frames. */
      let due = 0;

      const throwOne = (from: THREE.Vector3, size: number) => {
        const i = ages.findIndex((age) => age >= SPARKS.life);
        if (i < 0) return;
        // Out across the view, coloured by the way it flies, so together they make a rainbow.
        const angle = Math.random() * Math.PI * 2;
        const speed = SPARKS.speed * (0.5 + Math.random() * 0.5);
        positions[i * 3] = from.x + Math.cos(angle) * size * 0.4;
        positions[i * 3 + 1] = from.y + Math.sin(angle) * size * 0.4;
        positions[i * 3 + 2] = from.z;
        velocities[i * 3] = Math.cos(angle) * speed;
        velocities[i * 3 + 1] = Math.sin(angle) * speed;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        hues[i] = angle / (Math.PI * 2);
        ages[i] = 0;
      };

      return {
        follow: (position, size, shown) => {
          const dt = Math.min(0.05, now - last);
          last = now;
          const glowing = shown && strength > 0.01;
          if (glowing && !calm) {
            due += SPARKS.rate * strength * dt;
            for (; due >= 1; due--) throwOne(position, size);
          }
          for (let i = 0; i < SPARKS.count; i++) {
            const age = (ages[i] ?? SPARKS.life) + dt;
            ages[i] = age;
            const drag = Math.max(0, 1 - dt * 2);
            for (let k = 0; k < 3; k++) {
              const j = i * 3 + k;
              positions[j] = (positions[j] ?? 0) + (velocities[j] ?? 0) * dt;
              velocities[j] = (velocities[j] ?? 0) * drag;
            }
            colour.setHSL(((hues[i] ?? 0) + hue) % 1, 1, 0.62);
            colour.toArray(colours, i * 4);
            colours[i * 4 + 3] = strength * BRIGHTNESS * Math.max(0, 1 - age / SPARKS.life);
          }
          positionAttribute.needsUpdate = true;
          colourAttribute.needsUpdate = true;

          halo.visible = glowing;
          halo.position.copy(position);
          halo.scale.setScalar(size * (1.6 + strength * 0.2));
        },
        dispose: () => {
          scene.remove(halo, sparkles);
          geometry.dispose();
        },
      };
    },
    update: (next, seconds) => {
      strength = next;
      now = seconds;
      hue = (seconds * 0.35) % 1;
      ring.opacity = strength * BRIGHTNESS;
      ring.rotation = calm ? 0 : -seconds * 2.5;
      colour.setHSL(hue, 1, 0.5);
      for (const material of tinted) {
        material.emissive.copy(colour);
        material.emissiveIntensity = strength * BRIGHTNESS * 0.45;
      }
    },
    dispose: () => {
      ring.map?.dispose();
      ring.dispose();
      spark.map?.dispose();
      spark.dispose();
    },
  };
};
