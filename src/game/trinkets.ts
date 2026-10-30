import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Decoy } from "./engine";
import type { FlyingKind, Motion } from "./objects";
import { matte, metal, part } from "./parts";
import { glowTexture } from "./textures";

// The later stages' own decoys: candy floss at the Funfair, pumpkins in the Haunted Castle, foam
// fingers at the Cup Final, and the castle's ghost balls. The rest are in ./decoys. Like those,
// each is about 1 m across, centred on its origin and facing +Z (the camera), for the scene to
// scale, and kept to a few low-poly shapes.

/** The decoys built here. */
export type Trinket = Extract<
  Decoy,
  | "candyFloss"
  | "toffeeApple"
  | "rubberDuck"
  | "pumpkin"
  | "skull"
  | "spellbook"
  | "scarf"
  | "banana"
  | "foamFinger"
  | "ghostBall"
>;
type Builder = (environment: THREE.Texture) => THREE.Object3D;

const ball = new THREE.SphereGeometry(1, 20, 14);
const sides = [-1, 1] as const;

/** Puts a group's parts round the origin, wherever they were built. */
const centred = (group: THREE.Object3D): THREE.Object3D => {
  const box = new THREE.Box3().setFromObject(group);
  group.position.sub(box.getCenter(new THREE.Vector3()));
  const outer = new THREE.Group();
  outer.add(group);
  return outer;
};

/** A ball pushed in and out by `surface`, which gives the radius for each direction. */
const lumpy = (radius: number, detail: number, surface: (d: THREE.Vector3) => number) => {
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  geometry = mergeVertices(geometry);
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

/** Something that lights itself, so it reads in any light, even the castle's gloom. */
const lit = (colour: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color: colour });

// --- Funfair ------------------------------------------------------------------------------------

/** A cloud of pink candy floss on a paper cone, tipped towards you. */
const candyFloss: Builder = (environment) => {
  const group = new THREE.Group();
  const floss = new THREE.MeshStandardMaterial({
    color: "#ff9ad5",
    emissive: "#ff5fb8",
    emissiveIntensity: 0.18,
    roughness: 1,
    envMap: environment,
    envMapIntensity: 0.3,
  });
  const surface = (d: THREE.Vector3) =>
    1 + 0.12 * Math.sin(d.x * 9 + 1) * Math.sin(d.y * 8) * Math.sin(d.z * 7 + 2);
  part(group, lumpy(0.36, 3, surface), floss, [0, 0.12, 0], [1.05, 0.9, 1]);
  for (const [x, y, z, r] of [
    [0.22, 0.3, 0.1, 0.17],
    [-0.24, 0.26, 0.05, 0.16],
    [0.05, 0.42, -0.05, 0.15],
  ] as const) {
    part(group, lumpy(r, 2, surface), floss, [x, y, z]);
  }
  // A white paper cone with a blue stripe round it.
  part(
    group,
    new THREE.ConeGeometry(0.11, 0.48, 14, 1, true),
    matte("#f6f2ea", environment, 0.8),
    [0, -0.36, 0],
    [1, 1, 1],
    [Math.PI, 0, 0],
  );
  part(
    group,
    new THREE.CylinderGeometry(0.075, 0.085, 0.07, 14, 1, true),
    matte("#3f8ee8", environment, 0.6),
    [0, -0.3, 0],
  );
  group.rotation.set(0.35, 0, -0.25);
  return centred(group);
};

/** A shiny red toffee apple on a wooden stick, with a skirt of toffee round its foot. */
const toffeeApple: Builder = (environment) => {
  const group = new THREE.Group();
  const toffee = new THREE.MeshPhysicalMaterial({
    color: "#c4121c",
    roughness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMap: environment,
  });
  // An apple's shape: wider at the shoulders, dimpled on top.
  const outline: [number, number][] = [
    [0, -0.3],
    [0.22, -0.28],
    [0.34, -0.12],
    [0.36, 0.06],
    [0.3, 0.22],
    [0.14, 0.27],
    [0.04, 0.22],
    [0, 0.2],
  ];
  part(
    group,
    new THREE.LatheGeometry(
      outline.map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    ),
    toffee,
    [0, 0, 0],
  );
  part(
    group,
    new THREE.CylinderGeometry(0.3, 0.38, 0.05, 20),
    new THREE.MeshPhysicalMaterial({
      color: "#9a0e16",
      roughness: 0.2,
      clearcoat: 1,
      envMap: environment,
    }),
    [0, -0.28, 0],
  );
  part(
    group,
    new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8),
    matte("#c99a5b", environment, 0.9),
    [0, 0.4, 0],
  );
  group.rotation.set(0.25, 0, 0.3);
  return centred(group);
};

/** A yellow rubber duck, as won on the hook-a-duck stall, with an orange beak. */
const rubberDuck: Builder = (environment) => {
  const group = new THREE.Group();
  const rubber = new THREE.MeshPhysicalMaterial({
    color: "#ffd21f",
    roughness: 0.35,
    clearcoat: 0.6,
    envMap: environment,
    envMapIntensity: 0.6,
  });
  part(group, ball, rubber, [0, -0.1, -0.05], [0.4, 0.3, 0.44]);
  // A tail flicked up behind.
  part(
    group,
    new THREE.ConeGeometry(0.14, 0.26, 12),
    rubber,
    [0, 0.04, -0.44],
    [1, 1, 0.6],
    [-0.9, 0, 0],
  );
  part(group, ball, rubber, [0, 0.27, 0.12], [0.24, 0.24, 0.24]);
  part(group, ball, matte("#ff7a12", environment, 0.4), [0, 0.22, 0.36], [0.11, 0.05, 0.11]);
  for (const side of sides) {
    part(
      group,
      ball,
      matte("#111111", environment, 0.2),
      [side * 0.1, 0.33, 0.31],
      [0.04, 0.05, 0.03],
    );
    part(group, ball, rubber, [side * 0.34, -0.06, -0.04], [0.1, 0.18, 0.28]);
  }
  group.rotation.y = -0.5;
  return centred(group);
};

// --- Haunted Castle -----------------------------------------------------------------------------

/** A pumpkin carved into a grinning lantern, glowing from inside. */
const pumpkin: Builder = (environment) => {
  const group = new THREE.Group();
  // Ribbed: pushed in along eight grooves.
  const surface = (d: THREE.Vector3) => {
    const around = Math.atan2(d.z, d.x);
    return 1 - 0.07 * Math.cos(around * 8) ** 8 * (1 - Math.abs(d.y));
  };
  part(
    group,
    lumpy(0.42, 4, surface),
    matte("#f07a12", environment, 0.6),
    [0, 0, 0],
    [1.15, 0.85, 1.1],
  );
  part(
    group,
    new THREE.CylinderGeometry(0.04, 0.06, 0.16, 8),
    matte("#4f6b22", environment, 0.8),
    [0.02, 0.38, 0],
    [1, 1, 1],
    [0, 0, -0.25],
  );
  // The face: triangle eyes and a jagged grin, cut through to the candle inside.
  const flame = lit("#ffd25a");
  const face = new THREE.Group();
  face.position.z = 0.455;
  for (const side of sides) {
    part(
      face,
      new THREE.CircleGeometry(0.09, 3),
      flame,
      [side * 0.15, 0.1, 0],
      [1, 1, 1],
      [0, 0, Math.PI / 2],
    );
  }
  part(
    face,
    new THREE.CircleGeometry(0.05, 3),
    flame,
    [0, -0.01, 0.005],
    [1, 1, 1],
    [0, 0, -Math.PI / 2],
  );
  const grin = new THREE.Shape();
  grin.moveTo(-0.24, -0.1);
  grin.lineTo(-0.16, -0.12);
  grin.lineTo(-0.12, -0.08);
  grin.lineTo(-0.06, -0.13);
  grin.lineTo(0, -0.09);
  grin.lineTo(0.06, -0.13);
  grin.lineTo(0.12, -0.08);
  grin.lineTo(0.16, -0.12);
  grin.lineTo(0.24, -0.1);
  grin.quadraticCurveTo(0, -0.32, -0.24, -0.1);
  part(face, new THREE.ShapeGeometry(grin), flame, [0, 0, 0]);
  group.add(face);
  return group;
};

/** A grinning skull, bone white, with dark sockets and teeth. */
const skull: Builder = (environment) => {
  const group = new THREE.Group();
  const bone = matte("#efe8d6", environment, 0.75);
  const dark = lit("#1a1214");
  part(group, ball, bone, [0, 0.08, -0.03], [0.36, 0.34, 0.38]);
  part(group, new RoundedBoxGeometry(0.42, 0.24, 0.36, 3, 0.08), bone, [0, -0.16, 0.06]);
  for (const side of sides) {
    part(group, ball, dark, [side * 0.13, 0.04, 0.31], [0.09, 0.1, 0.05]);
    part(group, ball, bone, [side * 0.2, -0.1, 0.22], [0.08, 0.06, 0.06]);
  }
  part(
    group,
    new THREE.ConeGeometry(0.04, 0.08, 3),
    dark,
    [0, -0.08, 0.36],
    [1, 1, 1],
    [0, 0, Math.PI],
  );
  for (let k = -2; k <= 2; k++) {
    part(group, new THREE.BoxGeometry(0.045, 0.06, 0.02), bone, [k * 0.055, -0.23, 0.245]);
  }
  part(group, new THREE.BoxGeometry(0.3, 0.012, 0.02), dark, [0, -0.2, 0.24]);
  return group;
};

/** A spell book, bound in purple leather, with a glowing gold star on its cover. */
const spellbook: Builder = (environment) => {
  const group = new THREE.Group();
  const leather = matte("#5a2a7a", environment, 0.7);
  part(group, new RoundedBoxGeometry(0.62, 0.8, 0.2, 2, 0.04), leather, [0, 0, 0]);
  part(
    group,
    new THREE.BoxGeometry(0.56, 0.74, 0.17),
    matte("#f1e6c8", environment, 0.9),
    [0.04, 0, 0],
  );
  part(
    group,
    new THREE.CylinderGeometry(0.11, 0.11, 0.8, 12, 1, false, Math.PI, Math.PI),
    leather,
    [-0.31, 0, 0],
  );
  // Gold corners and a five-pointed star.
  const gold = metal("#e5b53e", environment, 0.3);
  for (const x of [-0.27, 0.27]) {
    for (const y of [-0.36, 0.36])
      part(group, new THREE.BoxGeometry(0.08, 0.08, 0.215), gold, [x, y, 0]);
  }
  const star = new THREE.Shape(
    Array.from({ length: 10 }, (_, i) => {
      const angle = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.07 : 0.17;
      return new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r);
    }),
  );
  part(group, new THREE.ShapeGeometry(star), lit("#ffd76a"), [0, 0.04, 0.102]);
  part(
    group,
    new THREE.BoxGeometry(0.05, 0.3, 0.01),
    matte("#c42a3a", environment, 0.6),
    [0.16, -0.5, 0.06],
  );
  group.rotation.set(0.15, -0.35, 0.12);
  return centred(group);
};

/**
 * A ghost ball: a football's ghost, pale and see-through, glowing faintly. Its motion and its
 * missing shadow are the twist's (see twists/haunted.ts).
 */
const ghostBall: Builder = () => {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 24, 16),
      new THREE.MeshBasicMaterial({
        color: "#dff4ff",
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    ),
  );
  // Faint patches where a ball's pentagons would be, so it reads as a ball at a glance.
  const patch = new THREE.MeshBasicMaterial({
    color: "#7d9bb8",
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  for (const [x, y, z] of [
    [0, 0, 1],
    [0.7, 0.45, 0.55],
    [-0.7, 0.45, 0.55],
    [0.45, -0.75, 0.5],
    [-0.45, -0.75, 0.5],
    [0, 0.95, -0.2],
  ] as const) {
    const d = new THREE.Vector3(x, y, z).normalize();
    const disc = part(group, new THREE.CircleGeometry(0.13, 5), patch, [0, 0, 0]);
    disc.position.copy(d).multiplyScalar(0.505);
    disc.lookAt(d.clone().multiplyScalar(2));
  }
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: "#9fd8ff",
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(1.6);
  group.add(glow);
  return group;
};

// --- Cup Final ----------------------------------------------------------------------------------

/** A woolly bar scarf in two colours, flung out as it flies, with tassels at each end. */
const scarf: Builder = (environment) => {
  const group = new THREE.Group();
  const colours = [matte("#d8202f", environment, 0.95), matte("#f4f1ea", environment, 0.95)];
  const bars = 10;
  for (let k = 0; k < bars; k++) {
    const t = k / (bars - 1);
    // A lazy S, as if it's been swung round someone's head and let go.
    const x = (t - 0.5) * 1.05;
    const y = Math.sin(t * Math.PI * 2) * 0.14;
    const slope = Math.cos(t * Math.PI * 2) * 0.14 * Math.PI * 2;
    part(
      group,
      new RoundedBoxGeometry(0.12, 0.2, 0.05, 1, 0.02),
      colours[k % 2] ?? colours[0] ?? matte("#d8202f", environment),
      [x, y, 0],
      [1, 1, 1],
      [0, 0, Math.atan(slope / 1.05)],
    );
  }
  for (const side of sides) {
    for (let k = -1; k <= 1; k++) {
      part(
        group,
        new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4),
        colours[1] ?? matte("#f4f1ea", environment),
        [side * 0.6, k * 0.06, 0],
        [1, 1, 1],
        [0, 0, Math.PI / 2],
      );
    }
  }
  return group;
};

/** An inflatable banana, as waved on the terraces, yellow with brown ends. */
const banana: Builder = (environment) => {
  const group = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.45, 0.2, 0),
    new THREE.Vector3(0, -0.35, 0),
    new THREE.Vector3(0.45, 0.2, 0),
  );
  const skin = new THREE.MeshPhysicalMaterial({
    color: "#ffe04a",
    roughness: 0.3,
    clearcoat: 0.8,
    envMap: environment,
    envMapIntensity: 0.6,
  });
  const body = new THREE.TubeGeometry(curve, 16, 0.13, 10);
  // Tapered to its ends.
  const position = body.getAttribute("position");
  const p = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const t = Math.floor(i / 11) / 16;
    curve.getPointAt(t, centre);
    const taper = 0.35 + 0.65 * Math.sin(Math.PI * t);
    p.sub(centre).multiplyScalar(taper).add(centre);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  body.computeVertexNormals();
  part(group, body, skin, [0, 0, 0]);
  const brown = matte("#5a3d1e", environment, 0.8);
  for (const side of sides) {
    part(group, ball, brown, [side * 0.46, 0.21, 0], [0.04, 0.05, 0.04]);
  }
  return centred(group);
};

/** A big foam finger, pointing to the sky, in the team's colour, with "No 1" in white. */
const foamFinger: Builder = (environment) => {
  const group = new THREE.Group();
  const foam = matte("#2b6fe0", environment, 0.95);
  part(group, new RoundedBoxGeometry(0.44, 0.42, 0.18, 3, 0.07), foam, [0, -0.12, 0]);
  part(group, new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), foam, [0.1, 0.32, 0]);
  part(
    group,
    new THREE.CapsuleGeometry(0.07, 0.08, 4, 10),
    foam,
    [-0.25, -0.02, 0.02],
    [1, 1, 1],
    [0, 0, 0.9],
  );
  for (const x of [-0.12, 0.0]) {
    part(
      group,
      new THREE.CapsuleGeometry(0.065, 0.06, 4, 10),
      foam,
      [x, 0.12, 0.06],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
  }
  part(
    group,
    new THREE.CylinderGeometry(0.17, 0.2, 0.22, 14),
    matte("#f2f2f2", environment, 0.9),
    [0, -0.42, 0],
  );
  // A big white "1" on the front.
  const white = lit("#ffffff");
  part(group, new THREE.BoxGeometry(0.05, 0.22, 0.01), white, [0.02, -0.12, 0.096]);
  part(
    group,
    new THREE.BoxGeometry(0.06, 0.035, 0.01),
    white,
    [-0.02, -0.02, 0.096],
    [1, 1, 1],
    [0, 0, 0.6],
  );
  group.rotation.z = -0.2;
  return centred(group);
};

export const TRINKET_BUILDERS: Record<Trinket, Builder> = {
  candyFloss,
  toffeeApple,
  rubberDuck,
  pumpkin,
  skull,
  spellbook,
  scarf,
  banana,
  foamFinger,
  ghostBall,
};

/** How each flies: see Motion in ./objects. */
export const TRINKET_MOTION: Record<Trinket, Motion> = {
  candyFloss: { kind: "wobble", turn: 0.4, rock: 0.25 },
  toffeeApple: { kind: "wobble", turn: 0.5, rock: 0.3 },
  rubberDuck: { kind: "wobble", turn: 0.45, rock: 0.3 },
  pumpkin: { kind: "wobble", turn: 0.35, rock: 0.2 },
  skull: { kind: "wobble", turn: 0.35, rock: 0.25 },
  spellbook: { kind: "wobble", turn: 0.5, rock: 0.3 },
  scarf: { kind: "wobble", turn: 0.3, rock: 0.35 },
  // An inflatable spins end over end, as anything light and long does.
  banana: { kind: "twirl" },
  foamFinger: { kind: "wobble", turn: 0.45, rock: 0.25 },
  // A ghost ball spins like the footballs it's pretending to be.
  ghostBall: { kind: "spin" },
};

/** How the moving parts of some of them move, `seconds` after launch. */
export const TRINKET_ANIMATE: Partial<
  Record<FlyingKind, (object: THREE.Object3D, seconds: number) => void>
> = {
  // The scarf flaps as it flies.
  scarf: (object, t) => {
    object.rotation.z += Math.sin(t * 9) * 0.15;
  },
};
