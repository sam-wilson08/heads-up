import * as THREE from "three";
import { PAINTED_THIN, part, type Prop, seeded, solid, type Vec3 } from "./shapes";

// Coconut palms along the back of the beach, between the sand and the sea, their fronds stirring
// in the breeze. Units are metres; the goal is down -Z, 30 m away.

const BARK = [0x8a6a44, 0x6e5234] as const;
const FROND = { base: new THREE.Color(0x2f6a2a), tip: new THREE.Color(0x79b84a) };
const COCONUT = 0x5a3d1e;

/** A point along a quadratic curve from a to c, bent towards b. */
const bezier = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) =>
  a
    .clone()
    .multiplyScalar((1 - t) ** 2)
    .addScaledVector(b, 2 * (1 - t) * t)
    .addScaledVector(c, t * t);

/**
 * One frond, lying along +X from where it joins the crown: it arches up and out, then droops,
 * narrow at both ends, its leaflets folded up from the midrib and cut into a ragged edge.
 */
const frond = (length: number, width: number, droop: number, random: () => number) => {
  const steps = 14;
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const x = s * length;
    const y = length * (0.32 * s - droop * s * s);
    // Leaflets cut the edge into teeth; the frond is widest a third of the way out.
    const ragged = i % 2 ? 0.55 + random() * 0.15 : 1;
    const half = width * Math.sin(Math.PI * Math.min(s * 1.15, 1)) ** 0.7 * ragged;
    const fold = half * 0.35;
    c.copy(FROND.base).lerp(FROND.tip, s);
    for (const [z, up, shade] of [
      [-half, -fold, 0.85],
      [0, 0, 1],
      [half, -fold, 0.85],
    ] as const) {
      positions.push(x, y + up, z);
      colours.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 3;
    const b = a + 3;
    index.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * A coconut palm, `height` metres tall, its ringed trunk curving over towards `lean` (radians
 * round from +X), with a crown of fronds and a bunch of coconuts.
 */
const palm = (height: number, lean: number, seed: number): Prop => {
  const random = seeded(seed);
  const size = height / 7;
  const top = new THREE.Vector3(
    Math.cos(lean) * height * 0.28,
    height,
    Math.sin(lean) * height * 0.28,
  );
  const bend = new THREE.Vector3(
    Math.cos(lean) * height * 0.02,
    height * 0.5,
    Math.sin(lean) * height * 0.02,
  );
  const base = new THREE.Vector3();

  // The trunk: rings that taper as they go up, each a little wider at its foot, light and dark.
  const trunk: THREE.BufferGeometry[] = [];
  const rings = 12;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < rings; i++) {
    const from = bezier(base, bend, top, i / rings);
    const to = bezier(base, bend, top, (i + 1) / rings);
    const length = from.distanceTo(to);
    const radius = (0.3 - (0.13 * i) / rings) * size;
    const turn = new THREE.Quaternion().setFromUnitVectors(up, to.clone().sub(from).normalize());
    const middle = from.clone().lerp(to, 0.5);
    trunk.push(
      part(new THREE.CylinderGeometry(radius * 0.88, radius, length * 1.04, 9, 1), (p) =>
        p.y < -length * 0.3 ? BARK[1] : (BARK[i % 2] ?? BARK[0]),
      )
        .applyQuaternion(turn)
        .translate(middle.x, middle.y, middle.z),
    );
  }

  // The crown sits on the top of the trunk, so it can sway from there.
  const crown = new THREE.Group();
  crown.position.copy(top);
  const leaves: THREE.BufferGeometry[] = [];
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const turn = (i / fronds) * Math.PI * 2 + random() * 0.4;
    // Some reach up, most droop, so the crown isn't a flat star.
    const droop = 0.45 + random() * 0.45;
    const leaf = frond((2.4 + random() * 0.8) * size, 0.42 * size, droop, random);
    leaf.rotateZ((random() - 0.3) * 0.5);
    leaf.rotateY(turn);
    leaves.push(leaf);
  }
  const nuts: THREE.BufferGeometry[] = [
    part(new THREE.SphereGeometry(0.2 * size, 8, 6), 0x3f5a22, [0, 0.05 * size, 0]),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    nuts.push(
      part(new THREE.SphereGeometry(0.13 * size, 8, 6), COCONUT, [
        Math.cos(a) * 0.17 * size,
        -0.16 * size,
        Math.sin(a) * 0.17 * size,
      ]),
    );
  }
  crown.add(solid(leaves, PAINTED_THIN), solid(nuts));

  const object = new THREE.Group();
  object.add(solid(trunk), crown);
  const phase = random() * Math.PI * 2;
  return {
    object,
    update: (seconds) => {
      crown.rotation.z = Math.sin(seconds * 0.9 + phase) * 0.05;
      crown.rotation.x = Math.sin(seconds * 0.7 + phase * 1.3) * 0.04;
    },
  };
};

/** Where a palm stands, by its foot, how tall it is, and which way it leans (see palm). */
interface Spot {
  readonly at: Vec3;
  readonly height: number;
  readonly lean: number;
}

/**
 * Palms in two clumps, either side of the goal and well out from it, so nothing coming at the
 * player is lost against them. Each is placed by its foot.
 */
const PALMS: readonly Spot[] = [
  { at: [-7, 0, -40], height: 6.8, lean: Math.PI * 0.15 },
  { at: [-9.5, 0, -46], height: 7.8, lean: Math.PI * 0.9 },
  { at: [-11.5, 0, -37], height: 5.6, lean: Math.PI * 0.7 },
  { at: [7.2, 0, -45], height: 6.2, lean: Math.PI * 0.85 },
  { at: [9.6, 0, -39], height: 7.2, lean: Math.PI * 0.05 },
  { at: [12.5, 0, -49], height: 6.4, lean: Math.PI * 0.2 },
];

/**
 * Palms drawn live in front of the beach's picture, swaying: one either side of the goal leaning in
 * over it, close enough to frame it on a phone held upright, and one further out leaning away, for
 * a wider screen.
 */
export const BEACH_PALMS: readonly Spot[] = [
  { at: [-6.4, 0, -31.5], height: 7.4, lean: Math.PI * 0.12 },
  { at: [-10.5, 0, -27.5], height: 6.8, lean: Math.PI * 0.85 },
  { at: [6.6, 0, -32.5], height: 8, lean: Math.PI * 0.9 },
  { at: [10.8, 0, -28], height: 6.4, lean: Math.PI * 0.12 },
];

/**
 * Palms in their spots, swaying. Named "props", as the venues' Meshy props are, so the beach's
 * gusts lean them the way they blow, with `userData.lean` in radians (see ../twists/beach.ts).
 */
export const palms = (spots: readonly Spot[] = PALMS): Prop => {
  const object = new THREE.Group();
  object.name = "props";
  const trees = spots.map(({ at, height, lean }, i) => {
    const tree = palm(height, lean, i + 3);
    tree.object.position.set(...at);
    object.add(tree.object);
    return tree;
  });
  return {
    object,
    update: (seconds, dt) => {
      const lean = (object.userData.lean as number | undefined) ?? 0;
      for (const tree of trees) {
        tree.object.rotation.z = lean;
        tree.update(seconds, dt);
      }
    },
  };
};
