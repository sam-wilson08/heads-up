import * as THREE from "three";
import type { Motion } from "./objects";
import { matte, metal, part } from "./parts";

// The Colosseum's own decoys: a gladiator's helmet, an amphora and a bunch of grapes, thrown from
// the stands. Like every decoy, each is about 1 m across, centred on its origin and facing +Z (the
// camera), for the scene to scale. They're registered with the rest in ./decoys.

type Builder = (environment: THREE.Texture) => THREE.Object3D;

export type ArenaDecoy = "gladiatorHelmet" | "amphora" | "grapes";

const ball = new THREE.SphereGeometry(1, 28, 20);

/** Puts a group's parts round the origin, wherever they were built. */
const centred = (group: THREE.Object3D): THREE.Object3D => {
  const box = new THREE.Box3().setFromObject(group);
  group.position.sub(box.getCenter(new THREE.Vector3()));
  const outer = new THREE.Group();
  outer.add(group);
  return outer;
};

const lathe = (outline: readonly (readonly [number, number])[], segments = 40) =>
  new THREE.LatheGeometry(
    outline.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );

/**
 * A gladiator's helmet, a murmillo's: a bronze dome with a broad brim, a face guard of crossed bars
 * over the dark inside, and a tall red crest running front to back.
 */
const gladiatorHelmet: Builder = (environment) => {
  const group = new THREE.Group();
  const bronze = metal("#c08a36", environment, 0.32);
  const dark = matte("#1c140d", environment, 0.9);
  const crest = matte("#b3201c", environment, 0.85);
  // The dome, a little taller than it's wide.
  part(
    group,
    new THREE.SphereGeometry(0.34, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    bronze,
    [0, 0, 0],
    [1, 1.08, 1.05],
  );
  // The broad brim, flaring out all round.
  part(
    group,
    lathe([
      [0.32, 0.02],
      [0.42, -0.02],
      [0.5, -0.07],
      [0.49, -0.1],
      [0.4, -0.06],
      [0.31, -0.02],
    ]),
    bronze,
    [0, -0.04, 0],
  );
  // The face guard: a curved plate, dark behind its bars.
  part(
    group,
    new THREE.SphereGeometry(
      0.33,
      24,
      12,
      Math.PI * 0.2,
      Math.PI * 0.6,
      Math.PI * 0.45,
      Math.PI * 0.42,
    ),
    dark,
    [0, 0.02, 0.02],
  );
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.065;
    part(group, new THREE.BoxGeometry(0.018, 0.3, 0.02), bronze, [
      x,
      -0.16,
      0.31 - Math.abs(i) * 0.012,
    ]);
  }
  for (const y of [-0.06, -0.16, -0.26]) {
    part(group, new THREE.BoxGeometry(0.44, 0.018, 0.02), bronze, [0, y, 0.305]);
  }
  // The crest: a ridge of red plumes from the brow to the back of the neck.
  part(group, ball, crest, [0, 0.38, -0.02], [0.07, 0.17, 0.4]);
  part(group, new THREE.BoxGeometry(0.04, 0.06, 0.62), bronze, [0, 0.33, -0.02]);
  return centred(group);
};

/**
 * An amphora: a tall terracotta jar with a slim neck, two handles and a pointed foot, banded in
 * black like the ones painted with heroes.
 */
const amphora: Builder = (environment) => {
  const group = new THREE.Group();
  const clay = matte("#c4683a", environment, 0.75);
  const glaze = matte("#24160e", environment, 0.5);
  const cream = matte("#ead6a8", environment, 0.6);
  part(
    group,
    lathe([
      [0, -0.5],
      [0.05, -0.48],
      [0.08, -0.4],
      [0.2, -0.24],
      [0.27, -0.06],
      [0.28, 0.08],
      [0.24, 0.2],
      [0.13, 0.28],
      [0.1, 0.36],
      [0.1, 0.44],
      [0.14, 0.47],
      [0.14, 0.5],
      [0.09, 0.5],
    ]),
    clay,
    [0, 0, 0],
  );
  // A black band round its belly, with a cream line above and below.
  part(group, new THREE.CylinderGeometry(0.283, 0.272, 0.16, 40, 1, true), glaze, [0, -0.04, 0]);
  for (const y of [0.05, -0.13]) {
    part(
      group,
      new THREE.TorusGeometry(0.278, 0.008, 6, 40),
      cream,
      [0, y, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
  }
  // Two handles, from the neck down to the shoulder.
  for (const side of [-1, 1]) {
    part(
      group,
      new THREE.TorusGeometry(0.11, 0.022, 8, 20, Math.PI * 1.15),
      clay,
      [side * 0.14, 0.3, 0],
      [1, 1.25, 1],
      [0, 0, side < 0 ? Math.PI * 0.42 : Math.PI * -0.57],
    );
  }
  return centred(group);
};

/** A bunch of grapes: dusky purple, glossy, hanging from a stem with a vine leaf. */
const grapes: Builder = (environment) => {
  const group = new THREE.Group();
  const purple = new THREE.MeshPhysicalMaterial({
    color: "#5a2a72",
    roughness: 0.35,
    clearcoat: 0.6,
    envMap: environment,
    envMapIntensity: 0.6,
  });
  const ripe = new THREE.MeshPhysicalMaterial({
    color: "#7a3a8e",
    roughness: 0.35,
    clearcoat: 0.6,
    envMap: environment,
    envMapIntensity: 0.6,
  });
  const leaf = matte("#4f8f2a", environment, 0.8);
  const stem = matte("#6b4a24", environment, 0.9);
  // Rings of grapes, widest at the top and narrowing to a point at the bottom.
  const rings = [
    { y: 0.3, r: 0.2, n: 7 },
    { y: 0.16, r: 0.2, n: 7 },
    { y: 0.02, r: 0.16, n: 6 },
    { y: -0.12, r: 0.12, n: 5 },
    { y: -0.25, r: 0.07, n: 3 },
  ];
  rings.forEach(({ y, r, n }, row) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + row * 0.5;
      const size = 0.085 - row * 0.004;
      part(
        group,
        ball,
        (i + row) % 3 ? purple : ripe,
        [Math.cos(a) * r, y, Math.sin(a) * r],
        [size, size * 1.1, size],
      );
    }
  });
  part(group, ball, purple, [0, -0.36, 0], [0.075, 0.08, 0.075]);
  part(group, ball, ripe, [0, 0.24, 0.08], [0.09, 0.1, 0.09]);
  part(
    group,
    new THREE.CylinderGeometry(0.018, 0.024, 0.2, 8),
    stem,
    [0.02, 0.48, 0],
    [1, 1, 1],
    [0, 0, -0.3],
  );
  // A vine leaf: three lobes, tipped back behind the stem.
  const lobe = new THREE.SphereGeometry(1, 16, 10);
  for (const [x, y, rot] of [
    [-0.14, 0.5, 0.7],
    [0.0, 0.58, 0],
    [0.14, 0.5, -0.7],
  ] as const) {
    part(group, lobe, leaf, [x, y, -0.06], [0.11, 0.15, 0.02], [-0.35, 0, rot]);
  }
  return centred(group);
};

export const ARENA_BUILDERS: Record<ArenaDecoy, Builder> = {
  gladiatorHelmet,
  amphora,
  grapes,
};

/** How each flies: see Motion in ./objects. */
export const ARENA_MOTION: Record<ArenaDecoy, Motion> = {
  // The helmet keeps its face guard to the player, so it reads as a gladiator's.
  gladiatorHelmet: { kind: "wobble", turn: 0.45, rock: 0.25 },
  amphora: { kind: "wobble", turn: 0.5, rock: 0.35 },
  grapes: { kind: "wobble", turn: 0.4, rock: 0.3 },
};
