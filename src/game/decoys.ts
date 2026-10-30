import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { ARENA_BUILDERS, ARENA_MOTION } from "./colosseum-decoys";
import type { Decoy } from "./engine";
import type { FlyingKind, Motion } from "./objects";
import { matte, metal, part } from "./parts";
import { glowTexture } from "./textures";
import { TRINKET_ANIMATE, TRINKET_BUILDERS, TRINKET_MOTION } from "./trinkets";

// Each venue's own decoys, thrown alongside the classic ones in ./objects: pigeons in the park,
// fireballs from the volcano, UFOs in space. Like the classic ones, each is about 1 m across,
// centred on its origin and facing +Z (the camera), for the scene to scale. Some have parts that
// move as they fly, like wings and flames: see ANIMATE.

/** The decoys built here: all of them but the classic ones, the helmet and the volleyball. */
export type VenueDecoy = Exclude<
  Decoy,
  "panda" | "stopwatch" | "hat" | "gloves" | "boot" | "helmet" | "volleyball"
>;
type Builder = (environment: THREE.Texture) => THREE.Object3D;
type Vec3 = readonly [number, number, number];

const ball = new THREE.SphereGeometry(1, 28, 20);
const sides = [-1, 1] as const;
/** What a part on the left or right is named, for ANIMATE to find it. */
const named = (name: string, side: number) => `${name}-${side < 0 ? "left" : "right"}`;

/** Puts a group's parts round the origin, wherever they were built. */
const centred = (group: THREE.Object3D): THREE.Object3D => {
  const box = new THREE.Box3().setFromObject(group);
  group.position.sub(box.getCenter(new THREE.Vector3()));
  const outer = new THREE.Group();
  outer.add(group);
  return outer;
};

/** A smooth bumpiness for a direction, from about -1.5 to 1.5, the same every time for a seed. */
const bumps = (d: THREE.Vector3, seed: number) =>
  Math.sin(d.x * 3.1 + seed) * Math.sin(d.y * 2.7 + seed * 1.7) * Math.sin(d.z * 3.3 + seed * 0.6) +
  0.5 * Math.sin(d.x * 6.3 + d.y * 5.1 + seed * 2.3) * Math.sin(d.z * 5.7 - d.y * 4.1 + seed);

/**
 * A ball pushed in and out by `surface`, which gives the radius for each direction as a share of
 * `radius`. Smooth for snow and flames; faceted, like a rock, otherwise.
 */
const lumpy = (
  radius: number,
  detail: number,
  surface: (direction: THREE.Vector3) => number,
  smooth: boolean,
): THREE.BufferGeometry => {
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  if (smooth) geometry = mergeVertices(geometry);
  const position = geometry.getAttribute("position");
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    p.multiplyScalar(surface(p.clone().normalize()));
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
};

/** A soft glow behind something hot or bright, which shows over any background. */
const glow = (colour: THREE.ColorRepresentation, size: number, opacity = 1) => {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: colour,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.position.z = -0.25;
  return mesh;
};

/** A cone from `from` pointing towards `to`. */
const spike = (
  group: THREE.Object3D,
  material: THREE.Material,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
) => {
  const length = from.distanceTo(to);
  const mesh = part(group, new THREE.ConeGeometry(radius, length, 10), material, [0, 0, 0]);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
};

/** A tube along a smooth curve through the points. */
const tube = (points: readonly Vec3[], radius: number) =>
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    24,
    radius,
    8,
  );

/** Colours a shape's vertices by where they are, for stripes and bands. */
const banded = (geometry: THREE.BufferGeometry, colourAt: (p: THREE.Vector3) => string) => {
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  const colour = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    colour.set(colourAt(p.fromBufferAttribute(position, i))).toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
};

// --- Sunny Park ---------------------------------------------------------------------------------

/** A grey pigeon flying straight at you, wings out, with a green sheen on its neck. */
const pigeon: Builder = (environment) => {
  const group = new THREE.Group();
  const grey = matte("#949cad", environment, 0.8);
  const dark = matte("#4d5464", environment, 0.8);
  const sheen = matte("#4f8a78", environment, 0.3);
  part(group, ball, grey, [0, 0, -0.05], [0.24, 0.22, 0.4]);
  part(group, ball, sheen, [0, 0.1, 0.2], [0.17, 0.16, 0.14]);
  part(group, ball, dark, [0, 0.2, 0.32], [0.13, 0.13, 0.13]);
  for (const side of sides) {
    part(
      group,
      ball,
      matte("#f08a24", environment, 0.3),
      [side * 0.07, 0.24, 0.41],
      [0.034, 0.034, 0.02],
    );
    part(
      group,
      ball,
      matte("#111111", environment, 0.2),
      [side * 0.073, 0.24, 0.425],
      [0.017, 0.017, 0.012],
    );
  }
  part(
    group,
    new THREE.ConeGeometry(0.035, 0.12, 12),
    dark,
    [0, 0.19, 0.48],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  part(group, ball, matte("#e8eaee", environment), [0, 0.215, 0.44], [0.03, 0.02, 0.03]);
  // A fan of a tail behind.
  part(
    group,
    new THREE.ConeGeometry(0.16, 0.3, 16),
    dark,
    [0, 0.02, -0.46],
    [1.2, 1, 0.25],
    [Math.PI / 2, 0, 0],
  );
  for (const side of sides) {
    const wing = new THREE.Group();
    wing.name = named("wing", side);
    wing.position.set(side * 0.17, 0.08, -0.02);
    part(wing, ball, grey, [side * 0.36, 0, -0.06], [0.38, 0.035, 0.26]);
    for (const z of [-0.1, -0.18])
      part(wing, ball, dark, [side * 0.28, 0.025, z], [0.2, 0.03, 0.025]);
    part(wing, ball, dark, [side * 0.66, 0, -0.08], [0.12, 0.03, 0.15]);
    group.add(wing);
  }
  // Pitched towards you, as if seen from a little above, so its back and wings show rather than
  // their edges.
  group.rotation.x = 0.65;
  return centred(group);
};

/** A pink frisbee with white rings on top. */
const frisbee: Builder = (environment) => {
  const group = new THREE.Group();
  const plastic = new THREE.MeshPhysicalMaterial({
    color: "#ff4f7b",
    roughness: 0.35,
    clearcoat: 0.6,
    envMap: environment,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
  // From the middle of the top, out to the rim and round under the lip.
  const outline: [number, number][] = [
    [0, 0.06],
    [0.2, 0.058],
    [0.36, 0.05],
    [0.44, 0.03],
    [0.47, 0],
    [0.465, -0.05],
    [0.44, -0.06],
  ];
  part(
    group,
    new THREE.LatheGeometry(
      outline.map(([r, y]) => new THREE.Vector2(r, y)),
      64,
    ),
    plastic,
    [0, 0, 0],
  );
  const white = matte("#ffffff", environment, 0.4);
  for (const radius of [0.18, 0.32]) {
    part(
      group,
      new THREE.TorusGeometry(radius, 0.012, 8, 64),
      white,
      [0, 0.055, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
  }
  return group;
};

// --- The Beach ----------------------------------------------------------------------------------

/** A red crab, claws up, eyes on stalks. */
const crab: Builder = (environment) => {
  const group = new THREE.Group();
  const shell = matte("#e8462c", environment, 0.45);
  const white = matte("#ffffff", environment, 0.3);
  const black = matte("#111111", environment, 0.2);
  part(group, ball, shell, [0, 0, 0], [0.34, 0.17, 0.26]);
  part(group, ball, matte("#f6a17c", environment, 0.6), [0, -0.05, 0.05], [0.3, 0.12, 0.22]);
  const leg = new THREE.CapsuleGeometry(0.025, 0.2, 4, 8);
  for (const side of sides) {
    part(group, new THREE.CylinderGeometry(0.02, 0.025, 0.16, 8), shell, [side * 0.09, 0.2, 0.12]);
    part(group, ball, white, [side * 0.09, 0.3, 0.12], [0.055, 0.055, 0.055]);
    part(group, ball, black, [side * 0.09, 0.31, 0.165], [0.028, 0.028, 0.02]);
    for (let k = 0; k < 3; k++) {
      part(
        group,
        leg,
        shell,
        [side * 0.38, -0.12, 0.06 - k * 0.1],
        [1, 1, 1],
        [0.2, 0, side * 1.1],
      );
    }
    const claw = new THREE.Group();
    claw.name = named("claw", side);
    claw.position.set(side * 0.28, 0.05, 0.1);
    part(
      claw,
      new THREE.CapsuleGeometry(0.045, 0.18, 6, 10),
      shell,
      [side * 0.1, 0.08, 0.02],
      [1, 1, 1],
      [0, 0, -side * 0.9],
    );
    part(claw, ball, shell, [side * 0.22, 0.22, 0.04], [0.12, 0.1, 0.08]);
    part(
      claw,
      new THREE.ConeGeometry(0.05, 0.18, 10),
      shell,
      [side * 0.24, 0.36, 0.04],
      [1, 1, 0.7],
      [0, 0, -side * 0.2],
    );
    part(
      claw,
      new THREE.ConeGeometry(0.04, 0.14, 10),
      shell,
      [side * 0.33, 0.29, 0.04],
      [1, 1, 0.7],
      [0, 0, -side * 1.1],
    );
    group.add(claw);
  }
  return group;
};

/** A flip-flop, sole on to you: a teal sole, a yellow footbed and a pink thong strap. */
const flipFlop: Builder = (environment) => {
  const group = new THREE.Group();
  const foot = new THREE.Shape();
  foot.moveTo(0, -0.45);
  foot.bezierCurveTo(0.17, -0.45, 0.17, -0.2, 0.15, 0);
  foot.bezierCurveTo(0.13, 0.2, 0.22, 0.45, 0, 0.45);
  foot.bezierCurveTo(-0.2, 0.45, -0.12, 0.2, -0.14, 0);
  foot.bezierCurveTo(-0.16, -0.2, -0.17, -0.45, 0, -0.45);
  const slab = (depth: number) =>
    new THREE.ExtrudeGeometry(foot, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 24,
    });
  part(group, slab(0.04), matte("#1fb0c0", environment, 0.75), [0, 0, -0.04]);
  part(group, slab(0.01), matte("#ffd84a", environment, 0.7), [0, 0, 0.012], [0.94, 0.96, 1]);
  const strap = matte("#ff4f8b", environment, 0.4);
  for (const side of sides) {
    part(
      group,
      tube(
        [
          [0, 0.24, 0.04],
          [side * 0.08, 0.12, 0.15],
          [side * 0.15, -0.04, 0.04],
        ],
        0.024,
      ),
      strap,
      [0, 0, 0],
    );
  }
  part(group, ball, strap, [0, 0.24, 0.05], [0.035, 0.035, 0.035]);
  return centred(group);
};

// --- Snowy Pitch --------------------------------------------------------------------------------

/** A packed snowball, lumpy, with a few clumps stuck on. */
const snowball: Builder = (environment) => {
  const group = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({
    color: "#f5f9ff",
    roughness: 0.95,
    envMap: environment,
    envMapIntensity: 0.4,
  });
  part(
    group,
    lumpy(0.45, 4, (d) => 1 + 0.06 * bumps(d, 1.3), true),
    snow,
    [0, 0, 0],
  );
  for (const [x, y, z] of [
    [0.3, 0.25, 0.2],
    [-0.32, -0.1, 0.25],
    [0.05, -0.36, 0.2],
  ] as const) {
    part(
      group,
      lumpy(0.12, 2, (d) => 1 + 0.15 * bumps(d, x * 9), true),
      snow,
      [x, y, z],
    );
  }
  return group;
};

/** An icy six-armed snowflake, with branches on each arm, that spins as it comes. */
const snowflake: Builder = (environment) => {
  const group = new THREE.Group();
  const ice = new THREE.MeshStandardMaterial({
    color: "#e3f4ff",
    roughness: 0.15,
    metalness: 0.1,
    envMap: environment,
    envMapIntensity: 1.2,
    emissive: "#9fd6ff",
    emissiveIntensity: 0.25,
  });
  const crystal = new THREE.Group();
  crystal.name = "crystal";
  const arm = new THREE.BoxGeometry(0.06, 0.46, 0.04);
  const branch = new THREE.BoxGeometry(0.04, 1, 0.035);
  const tip = new THREE.OctahedronGeometry(0.05);
  for (let k = 0; k < 6; k++) {
    const spoke = new THREE.Group();
    spoke.rotation.z = (k * Math.PI) / 3;
    part(spoke, arm, ice, [0, 0.23, 0]);
    for (const [y, length] of [
      [0.18, 0.16],
      [0.31, 0.11],
    ] as const) {
      // Angled up and out, in a V.
      for (const side of sides) {
        const angle = 0.9;
        part(
          spoke,
          branch,
          ice,
          [side * Math.sin(angle) * (length / 2), y + Math.cos(angle) * (length / 2), 0],
          [1, length, 1],
          [0, 0, -side * angle],
        );
      }
    }
    part(spoke, tip, ice, [0, 0.47, 0]);
    crystal.add(spoke);
  }
  part(
    crystal,
    new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6),
    ice,
    [0, 0, 0],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  group.add(crystal);
  return group;
};

// --- The Moon -----------------------------------------------------------------------------------

const CRATERS = [
  new THREE.Vector3(0.3, 0.5, 0.8),
  new THREE.Vector3(-0.6, -0.2, 0.75),
  new THREE.Vector3(0.7, -0.5, 0.4),
  new THREE.Vector3(-0.2, 0.9, -0.3),
  new THREE.Vector3(0.1, -0.8, -0.5),
].map((d) => d.normalize());

/** A grey moon rock, pitted with craters. */
const moonRock: Builder = (environment) => {
  const surface = (d: THREE.Vector3) => {
    let r = 1 + 0.1 * bumps(d, 4.2);
    for (const crater of CRATERS) {
      const angle = d.angleTo(crater);
      const size = 0.38;
      if (angle < size) r -= 0.13 * (1 - (angle / size) ** 2);
      r += 0.04 * Math.exp(-(((angle - size) / 0.08) ** 2));
    }
    return r;
  };
  return new THREE.Mesh(
    lumpy(0.44, 3, surface, false),
    new THREE.MeshStandardMaterial({
      color: "#a5a5aa",
      roughness: 0.95,
      flatShading: true,
      envMap: environment,
      envMapIntensity: 0.4,
    }),
  );
};

/**
 * A wedge of cheese, since that's what the Moon's made of: holes right through it that show the
 * sky, bites out of its edges, and more holes dimpling its sloping top.
 */
const cheese: Builder = (environment) => {
  const group = new THREE.Group();
  const wedge = new THREE.Shape();
  wedge.moveTo(-0.45, -0.22);
  // A bite out of the bottom, then up the slope with another out of that.
  wedge.lineTo(0.06, -0.22);
  wedge.absarc(0.14, -0.22, 0.08, Math.PI, 0, true);
  wedge.lineTo(0.5, -0.22);
  const up = new THREE.Vector2(-0.95, 0.48).normalize();
  const bite = new THREE.Vector2(0.5, -0.22).addScaledVector(up, 0.55 * Math.hypot(0.95, 0.48));
  const from = Math.atan2(-up.y, -up.x);
  wedge.lineTo(bite.x - up.x * 0.07, bite.y - up.y * 0.07);
  wedge.absarc(bite.x, bite.y, 0.07, from, from - Math.PI, true);
  wedge.lineTo(-0.45, 0.26);
  wedge.closePath();
  for (const [x, y, r] of [
    [-0.26, -0.07, 0.08],
    [-0.36, 0.11, 0.04],
    [-0.06, -0.1, 0.05],
  ] as const) {
    wedge.holes.push(new THREE.Path().absarc(x, y, r, 0, Math.PI * 2, true));
  }
  const depth = 0.42;
  part(
    group,
    new THREE.ExtrudeGeometry(wedge, {
      depth,
      bevelEnabled: true,
      // The bevel closes the holes up a little in the middle, so it's kept small.
      bevelThickness: 0.03,
      bevelSize: 0.015,
      bevelSegments: 3,
      curveSegments: 16,
    }),
    matte("#f6c544", environment, 0.5),
    [0, 0, -depth / 2],
  );
  const hole = matte("#cf9419", environment, 0.8);
  // Laid flat on the slope, which falls 0.48 over 0.95.
  const slope = -Math.atan2(0.48, 0.95);
  for (const [t, z, r] of [
    [0.3, 0.1, 0.06],
    [0.6, -0.12, 0.045],
    [0.15, -0.14, 0.035],
  ] as const) {
    part(
      group,
      ball,
      hole,
      [-0.45 + 0.95 * t, 0.26 - 0.48 * t + 0.022, z],
      [r, 0.012, r],
      [0, 0, slope],
    );
  }
  return centred(group);
};

// --- Underwater ---------------------------------------------------------------------------------

/** A glowing pink jellyfish: a pulsing bell, with frilly arms and fine tentacles trailing. */
const jellyfish: Builder = (environment) => {
  const group = new THREE.Group();
  const jelly = new THREE.MeshPhysicalMaterial({
    color: "#ff8fd8",
    emissive: "#c0389a",
    emissiveIntensity: 0.35,
    roughness: 0.2,
    transparent: true,
    opacity: 0.8,
    clearcoat: 1,
    envMap: environment,
    side: THREE.DoubleSide,
  });
  const bell = new THREE.Group();
  bell.name = "bell";
  const outline: [number, number][] = [
    [0, 0.3],
    [0.2, 0.27],
    [0.34, 0.15],
    [0.4, 0],
    [0.38, -0.04],
    [0.3, -0.02],
  ];
  part(
    bell,
    new THREE.LatheGeometry(
      outline.map(([r, y]) => new THREE.Vector2(r, y)),
      48,
    ),
    jelly,
    [0, 0, 0],
  );
  part(
    bell,
    new THREE.TorusGeometry(0.37, 0.03, 8, 48),
    jelly,
    [0, -0.03, 0],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  part(
    bell,
    ball,
    new THREE.MeshBasicMaterial({ color: "#ffd6f2" }),
    [0, 0.12, 0],
    [0.16, 0.09, 0.16],
  );
  const trailing = new THREE.Group();
  trailing.name = "tentacles";
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const [x, z] = [Math.cos(a) * 0.1, Math.sin(a) * 0.1];
    const points: Vec3[] = [0, 1, 2, 3, 4].map((j) => [
      x + Math.sin(j * 1.7 + k) * 0.06,
      -j * 0.13,
      z + Math.cos(j * 1.3 + k) * 0.06,
    ]);
    part(trailing, tube(points, 0.03), jelly, [0, 0, 0]);
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const [x, z] = [Math.cos(a) * 0.34, Math.sin(a) * 0.34];
    const points: Vec3[] = [0, 1, 2, 3].map((j) => [
      x * (1 - j * 0.08) + Math.sin(j + k) * 0.03,
      -0.04 - j * 0.16,
      z * (1 - j * 0.08),
    ]);
    part(trailing, tube(points, 0.008), jelly, [0, 0, 0]);
  }
  group.add(bell, trailing);
  group.position.y = 0.15;
  const outer = new THREE.Group();
  outer.add(group);
  return outer;
};

/** An orange starfish, face on, with bumps along its arms, spinning like a throwing star. */
const starfish: Builder = (environment) => {
  const group = new THREE.Group();
  const star = new THREE.Group();
  star.name = "star";
  const outlinePoints = Array.from({ length: 10 }, (_, i) => {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.19 : 0.46;
    return new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r);
  });
  part(
    star,
    new THREE.ExtrudeGeometry(new THREE.Shape(outlinePoints), {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 4,
    }),
    matte("#ff7b39", environment, 0.6),
    [0, 0, -0.03],
  );
  const bump = matte("#ffd2a6", environment, 0.5);
  for (let k = 0; k < 5; k++) {
    const angle = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    for (const r of [0.08, 0.17, 0.26, 0.34]) {
      part(
        star,
        ball,
        bump,
        [Math.cos(angle) * r, Math.sin(angle) * r, 0.07],
        [0.028, 0.028, 0.02],
      );
    }
  }
  group.add(star);
  return group;
};

// --- Volcano ------------------------------------------------------------------------------------

/** A fireball: a white-hot core in flickering flames, with tongues of fire licking back. */
const fireball: Builder = () => {
  const group = new THREE.Group();
  group.add(glow("#ff7a1a", 1.9));
  part(
    group,
    new THREE.SphereGeometry(0.3, 32, 20),
    new THREE.MeshBasicMaterial({ color: "#fff4c2" }),
    [0, 0, 0],
  );
  const flames = part(
    group,
    lumpy(0.38, 3, (d) => 1 + 0.16 * bumps(d, 2.1), true),
    new THREE.MeshBasicMaterial({ color: "#ffa21f", transparent: true, opacity: 0.85 }),
    [0, 0, 0],
  );
  flames.name = "flames";
  const outer = new THREE.MeshBasicMaterial({
    color: "#ff4a0a",
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shell = part(
    group,
    lumpy(0.47, 3, (d) => 1 + 0.22 * bumps(d, 5.3), true),
    outer,
    [0, 0, 0],
  );
  shell.name = "shell";
  const tongues = new THREE.Group();
  tongues.name = "tongues";
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const out = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.5).normalize();
    spike(
      tongues,
      outer,
      out.clone().multiplyScalar(0.3),
      out.clone().multiplyScalar(0.72 + (k % 3) * 0.08),
      0.11,
    );
  }
  group.add(tongues);
  return group;
};

/** A lump of black lava rock, glowing orange where it's still molten. */
const lavaRock: Builder = (environment) => {
  const group = new THREE.Group();
  group.add(glow("#ff5a10", 1.3, 0.6));
  const surface = (d: THREE.Vector3) => 1 + 0.16 * bumps(d, 7.7);
  part(
    group,
    lumpy(0.42, 2, surface, false),
    new THREE.MeshStandardMaterial({
      color: "#2e2523",
      roughness: 0.9,
      flatShading: true,
      envMap: environment,
      envMapIntensity: 0.3,
    }),
    [0, 0, 0],
  );
  const hot = new THREE.MeshBasicMaterial({ color: "#ff6a1a" });
  for (const [x, y, z, size] of [
    [0.4, 0.3, 0.85, 0.11],
    [-0.5, -0.2, 0.8, 0.09],
    [0.1, -0.6, 0.7, 0.08],
    [-0.2, 0.7, 0.6, 0.07],
    [0.8, -0.3, 0.4, 0.08],
    [-0.8, 0.3, 0.3, 0.06],
    [0.2, 0.1, 1, 0.05],
  ] as const) {
    const d = new THREE.Vector3(x, y, z).normalize();
    // Streaks of molten rock showing through cracks, each at its own angle.
    const patch = part(group, ball, hot, [0, 0, 0], [size * 1.9, size * 0.32, 0.02]);
    patch.position.copy(d).multiplyScalar(0.42 * surface(d) - 0.004);
    patch.quaternion
      .setFromUnitVectors(new THREE.Vector3(0, 0, 1), d)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), size * 40));
  }
  return group;
};

// --- Mars ---------------------------------------------------------------------------------------

/** A Mars rover: a white body on six wheels, a gold underside, and a camera mast. */
const rover: Builder = (environment) => {
  const group = new THREE.Group();
  const shell = matte("#ece8de", environment, 0.5);
  const dark = matte("#2a2c33", environment, 0.7);
  part(group, new RoundedBoxGeometry(0.62, 0.2, 0.5, 3, 0.04), shell, [0, 0.02, 0]);
  part(
    group,
    new THREE.BoxGeometry(0.58, 0.05, 0.46),
    metal("#d4a24c", environment, 0.35),
    [0, -0.1, 0],
  );
  part(
    group,
    new THREE.BoxGeometry(0.6, 0.02, 0.48),
    metal("#27375a", environment, 0.4),
    [0, 0.13, 0],
  );
  const wheel = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 24);
  const hub = new THREE.CylinderGeometry(0.04, 0.04, 0.09, 12);
  for (const side of sides) {
    part(group, new THREE.BoxGeometry(0.03, 0.03, 0.5), dark, [side * 0.33, -0.12, 0]);
    for (const z of [0.2, 0, -0.2]) {
      part(
        group,
        wheel,
        matte("#3a3d45", environment, 0.85),
        [side * 0.36, -0.2, z],
        [1, 1, 1],
        [0, 0, Math.PI / 2],
      );
      part(
        group,
        hub,
        metal("#b8bec8", environment, 0.3),
        [side * 0.37, -0.2, z],
        [1, 1, 1],
        [0, 0, Math.PI / 2],
      );
    }
  }
  part(group, new THREE.CylinderGeometry(0.025, 0.025, 0.36, 10), shell, [0.18, 0.3, 0.15]);
  part(group, new RoundedBoxGeometry(0.18, 0.09, 0.09, 2, 0.02), shell, [0.18, 0.5, 0.17]);
  for (const x of [0.14, 0.22]) {
    part(
      group,
      new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16),
      matte("#0b0d12", environment, 0.15),
      [x, 0.5, 0.22],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
  }
  part(
    group,
    new THREE.CylinderGeometry(0.1, 0.02, 0.04, 20),
    metal("#c9ced6", environment, 0.3),
    [-0.18, 0.2, -0.1],
    [1, 1, 1],
    [0.5, 0, 0.3],
  );
  group.rotation.y = -0.45;
  return centred(group);
};

/** A toy rocket, nose up and towards you, white with red fins and a flickering exhaust. */
const rocket: Builder = (environment) => {
  const ship = new THREE.Group();
  const white = matte("#f4f4f2", environment, 0.35);
  const red = matte("#e23a3a", environment, 0.4);
  const body: [number, number][] = [
    [0, -0.36],
    [0.13, -0.35],
    [0.16, -0.22],
    [0.17, 0],
    [0.15, 0.18],
  ];
  part(
    ship,
    new THREE.LatheGeometry(
      body.map(([r, y]) => new THREE.Vector2(r, y)),
      32,
    ),
    white,
    [0, 0, 0],
  );
  part(ship, new THREE.ConeGeometry(0.15, 0.26, 32), red, [0, 0.31, 0]);
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0.16, -0.12);
  fin.lineTo(0.16, -0.26);
  fin.lineTo(0, -0.18);
  fin.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(fin, { depth: 0.02, bevelEnabled: false });
  finGeometry.translate(0, 0, -0.01);
  for (let k = 0; k < 3; k++) {
    const holder = new THREE.Group();
    holder.rotation.y = (k * Math.PI * 2) / 3 + Math.PI / 2;
    part(holder, finGeometry, red, [0.14, -0.12, 0]);
    ship.add(holder);
  }
  part(
    ship,
    new THREE.TorusGeometry(0.06, 0.015, 10, 24),
    metal("#c0c6d0", environment, 0.3),
    [0, 0.04, 0.165],
  );
  part(
    ship,
    new THREE.CircleGeometry(0.06, 24),
    metal("#5fc8ff", environment, 0.1),
    [0, 0.04, 0.168],
  );
  part(
    ship,
    new THREE.CylinderGeometry(0.08, 0.11, 0.08, 20),
    matte("#3a3d45", environment, 0.6),
    [0, -0.4, 0],
  );
  const flame = new THREE.Group();
  flame.name = "flame";
  flame.position.y = -0.44;
  part(
    flame,
    new THREE.ConeGeometry(0.1, 0.36, 16),
    new THREE.MeshBasicMaterial({ color: "#ff9a2e", transparent: true, opacity: 0.85 }),
    [0, -0.18, 0],
    [1, 1, 1],
    [Math.PI, 0, 0],
  );
  part(
    flame,
    new THREE.ConeGeometry(0.05, 0.2, 12),
    new THREE.MeshBasicMaterial({ color: "#fff2a8" }),
    [0, -0.1, 0],
    [1, 1, 1],
    [Math.PI, 0, 0],
  );
  ship.add(flame);
  ship.rotation.set(0.45, 0, -0.4);
  return centred(ship);
};

// --- Space Stadium ------------------------------------------------------------------------------

/** A flying saucer with a glass dome, a little alien inside, and lights round its rim. */
const ufo: Builder = (environment) => {
  const group = new THREE.Group();
  const hull: [number, number][] = [
    [0, -0.12],
    [0.18, -0.13],
    [0.38, -0.06],
    [0.5, 0],
    [0.38, 0.06],
    [0.2, 0.09],
    [0, 0.1],
  ];
  part(
    group,
    new THREE.LatheGeometry(
      hull.map(([r, y]) => new THREE.Vector2(r, y)),
      64,
    ),
    metal("#c4ccd8", environment, 0.25),
    [0, 0, 0],
  );
  part(
    group,
    new THREE.TorusGeometry(0.47, 0.02, 8, 64),
    metal("#7d8796", environment, 0.35),
    [0, 0, 0],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  const skin = matte("#7ed957", environment, 0.5);
  part(group, ball, skin, [0, 0.16, 0], [0.09, 0.1, 0.09]);
  for (const side of sides) {
    part(
      group,
      ball,
      matte("#0c0c12", environment, 0.1),
      [side * 0.035, 0.17, 0.075],
      [0.025, 0.018, 0.012],
      [0, 0, side * 0.4],
    );
  }
  part(
    group,
    new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: "#9ff3ff",
      transparent: true,
      opacity: 0.4,
      roughness: 0.05,
      clearcoat: 1,
      envMap: environment,
    }),
    [0, 0.08, 0],
  );
  const lights = ["#ff4fd8", "#fff36b", "#7ef9ff"] as const;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    part(
      group,
      ball,
      new THREE.MeshBasicMaterial({ color: lights[k % lights.length] }),
      [Math.cos(a) * 0.43, 0.01, Math.sin(a) * 0.43],
      [0.03, 0.03, 0.03],
    );
  }
  part(
    group,
    new THREE.CircleGeometry(0.12, 32),
    new THREE.MeshBasicMaterial({ color: "#7ef9ff" }),
    [0, -0.131, 0],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  return group;
};

const PLANET_BANDS = ["#f2c68c", "#e7a65c", "#f8e0b0", "#d98f4e", "#f2d29b", "#c97a3e"];
const RING_BANDS = ["#e9d8b4", "#c8b089", "#f3e6c8", "#b89a6e"];

/** A ringed planet, banded like Saturn. */
const planet: Builder = (environment) => {
  const group = new THREE.Group();
  part(
    group,
    banded(new THREE.SphereGeometry(0.3, 48, 32), (p) => {
      const band = Math.floor((p.y / 0.3 + 1) * 4.5 + Math.sin(p.x * 9) * 0.25);
      return PLANET_BANDS[Math.abs(band) % PLANET_BANDS.length] ?? "#f2c68c";
    }),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      envMap: environment,
      envMapIntensity: 0.4,
    }),
    [0, 0, 0],
  );
  part(
    group,
    banded(new THREE.RingGeometry(0.4, 0.64, 96, 8), (p) => {
      const band = Math.floor(((Math.hypot(p.x, p.y) - 0.4) / 0.24) * 7);
      return RING_BANDS[band % RING_BANDS.length] ?? "#e9d8b4";
    }),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      roughness: 0.6,
    }),
    [0, 0, 0],
    [1, 1, 1],
    [-Math.PI / 2 + 0.4, 0, 0.3],
  );
  return group;
};

export const VENUE_BUILDERS: Record<VenueDecoy, Builder> = {
  pigeon,
  frisbee,
  crab,
  flipFlop,
  snowball,
  snowflake,
  moonRock,
  cheese,
  jellyfish,
  starfish,
  fireball,
  lavaRock,
  rover,
  rocket,
  ufo,
  planet,
  ...TRINKET_BUILDERS,
  ...ARENA_BUILDERS,
};

/** How each flies: see Motion in ./objects. */
export const VENUE_MOTION: Record<VenueDecoy, Motion> = {
  pigeon: { kind: "wobble", turn: 0.3, rock: 0.15 },
  // A frisbee spins flat, tipped to show its top.
  frisbee: { kind: "twirl" },
  crab: { kind: "wobble", turn: 0.4, rock: 0.3 },
  flipFlop: { kind: "wobble", turn: 0.6, rock: 0.4 },
  // A snowball spins like the footballs it's mistaken for.
  snowball: { kind: "spin" },
  snowflake: { kind: "wobble", turn: 0.3, rock: 0.1 },
  moonRock: { kind: "spin" },
  cheese: { kind: "spin" },
  jellyfish: { kind: "wobble", turn: 0.2, rock: 0.15 },
  starfish: { kind: "wobble", turn: 0.3, rock: 0.15 },
  // A fireball keeps its flames trailing behind it.
  fireball: { kind: "wobble", turn: 0.25, rock: 0.25 },
  lavaRock: { kind: "spin" },
  rover: { kind: "wobble", turn: 0.5, rock: 0.3 },
  rocket: { kind: "wobble", turn: 0.3, rock: 0.15 },
  ufo: { kind: "twirl" },
  planet: { kind: "twirl" },
  ...TRINKET_MOTION,
  ...ARENA_MOTION,
};

const flap = (object: THREE.Object3D, name: string, angle: number, axis: "y" | "z") => {
  for (const side of sides) {
    const limb = object.getObjectByName(named(name, side));
    if (limb) limb.rotation[axis] = side * angle;
  }
};

/**
 * How the moving parts of some decoys move, `seconds` after launch: wings flap, claws wave, the
 * jellyfish pulses, flames flicker and a starfish or snowflake spins in its own plane.
 */
export const ANIMATE: Partial<
  Record<FlyingKind, (object: THREE.Object3D, seconds: number) => void>
> = {
  pigeon: (object, t) => flap(object, "wing", Math.sin(t * 16) * 0.7, "z"),
  crab: (object, t) => flap(object, "claw", Math.sin(t * 7) * 0.25, "z"),
  snowflake: (object, t) => {
    const crystal = object.getObjectByName("crystal");
    if (crystal) crystal.rotation.z = t * 2.5;
  },
  starfish: (object, t) => {
    const star = object.getObjectByName("star");
    if (star) star.rotation.z = -t * 4;
  },
  jellyfish: (object, t) => {
    const pulse = Math.sin(t * 6);
    object.getObjectByName("bell")?.scale.set(1 + pulse * 0.08, 1 - pulse * 0.1, 1 + pulse * 0.08);
    const tentacles = object.getObjectByName("tentacles");
    if (tentacles) tentacles.rotation.y = Math.sin(t * 2) * 0.4;
  },
  fireball: (object, t) => {
    object.getObjectByName("flames")?.rotation.set(t * 3, t * 2.3, 0);
    const shell = object.getObjectByName("shell");
    shell?.rotation.set(-t * 2, t * 3.1, 0);
    shell?.scale.setScalar(1 + Math.sin(t * 23) * 0.06 + Math.sin(t * 37) * 0.04);
    const tongues = object.getObjectByName("tongues");
    if (tongues) {
      tongues.rotation.z = t * 1.5;
      tongues.scale.setScalar(1 + Math.sin(t * 29) * 0.08);
    }
  },
  rocket: (object, t) => {
    object
      .getObjectByName("flame")
      ?.scale.set(1, 1 + Math.sin(t * 40) * 0.15 + Math.sin(t * 23) * 0.1, 1);
  },
  ...TRINKET_ANIMATE,
};
