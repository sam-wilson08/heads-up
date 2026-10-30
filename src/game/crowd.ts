import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Kit } from "../kits";
import type { Crowd } from "../venues";
import { batchMeshes } from "./batch";
import { meshyCreature } from "./creatures";
import { fanAt, meshyFan } from "./fans";
import { roman } from "./props/colosseum-crowd";
import { fish } from "./props/fish";
import { ghost } from "./props/ghosts";
import { shadowTexture } from "./textures";

// The crowd: figures that come out to watch along both sides of the pitch as the streak grows, and
// cheer every header. Fans in the player's kit at most venues, penguins in the snow, aliens on the
// Moon and in space. Units are metres.
//
// Each figure stands on its origin facing +Z, about 1.7 m tall, and is modelled from smooth shapes
// painted with vertex colours rather than textures. The shapes that move together are merged into
// one mesh, so however detailed a figure is, it's a few draw calls: its body, and each arm.

type Vec3 = readonly [number, number, number];
/** A shape's colour: one all over, or one for each point on it, in the shape's own space. */
type Paint = THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.ColorRepresentation);

/** Cloth and skin: rough, lit by the venue's sky and surroundings as well as its lights. */
const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
/** For the parts that light up, like an alien's antennae, so they're bright in any light. */
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });

const colour = new THREE.Color();
const point = new THREE.Vector3();
const paintAt = (paint: Paint, p: THREE.Vector3) =>
  typeof paint === "function" ? paint(p) : paint;

/** Paints a shape and puts it in place in the figure, ready to merge. */
const part = (
  geometry: THREE.BufferGeometry,
  paint: Paint,
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
): THREE.BufferGeometry => {
  geometry.deleteAttribute("uv");
  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    colour.set(paintAt(paint, point.fromBufferAttribute(positions, i)));
    colour.toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    ),
  );
};

/** Merges painted shapes into one mesh. */
const solid = (parts: readonly THREE.BufferGeometry[], material: THREE.Material = BODY) => {
  const mesh = new THREE.Mesh(mergeGeometries([...parts]), material);
  for (const p of parts) p.dispose();
  return mesh;
};

/** An arm or a flipper: a pivot at the shoulder, with the limb hanging down from it. */
const limb = (parts: readonly THREE.BufferGeometry[], shoulder: Vec3) => {
  const pivot = new THREE.Group();
  pivot.position.set(...shoulder);
  pivot.add(solid(parts));
  return pivot;
};

/** A round shape turned from its outline: radius and height pairs, bottom to top, smoothed. */
const turned = (outline: readonly (readonly [number, number])[], segments = 20) => {
  const curve = new THREE.SplineCurve(outline.map(([r, y]) => new THREE.Vector2(r, y)));
  const points = curve.getPoints(outline.length * 2).map((p) => p.setX(Math.max(p.x, 0)));
  return new THREE.LatheGeometry(points, segments);
};

const sphere = (radius = 1, detail = 10) => new THREE.SphereGeometry(radius, detail, detail * 0.75);

/** Where a point on a round shape faces: 1 straight ahead (+Z), 0 to the side, -1 behind. */
const facing = (p: THREE.Vector3) => p.z / (Math.hypot(p.x, p.z) || 1);

/** A repeatable random source for each figure, so the crowd looks the same every game. */
const seeded = (i: number) => {
  // Mulberry32. A simpler generator gives neighbouring figures much the same numbers.
  let seed = Math.imul(i + 1, 0x9e3779b9);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(random: () => number, from: readonly [T, ...T[]]): T =>
  from[Math.floor(random() * from.length)] ?? from[0];

/** The kit's two main colours, for scarves, hats and flags. */
const kitColours = (kit: Kit): [string, string] => {
  const first = kit.shirt[0] ?? kit.trim;
  return [first, kit.shirt.find((c) => c !== first) ?? kit.trim];
};

/** How wide each stripe on a striped shirt is, in radians round the body. */
const STRIPE = Math.PI / 7;

/**
 * A shirt in the kit's pattern, for a body between two heights, worn the way the player wears it:
 * the first stripe down the middle, the first half on the wearer's right, a band across the chest.
 */
const shirtIn = (kit: Kit, bottom: number, top: number): Paint => {
  const [first, second] = [kit.shirt[0] ?? kit.trim, kit.shirt[1] ?? kit.trim];
  return (p) => {
    switch (kit.pattern) {
      case "plain":
        return first;
      case "stripes":
        return Math.round(Math.atan2(p.x, p.z) / STRIPE) % 2 ? second : first;
      case "halves":
        // The wearer faces +Z, so their right is -X.
        return p.x < 0 ? first : second;
      case "band": {
        const hoop = Math.floor((0.83 - (p.y - bottom) / (top - bottom)) / 0.07);
        return (hoop >= 0 ? kit.shirt[hoop + 1] : undefined) ?? first;
      }
    }
  };
};

/**
 * A woolly scarf in the kit's colours: a striped ring round the neck, and one end hanging down the
 * front, lying on a chest that's `chest(y)` forward at each height.
 */
const scarf = (
  kit: Kit,
  neck: number,
  radius: number,
  chest: (y: number) => number,
  length = 6,
): THREE.BufferGeometry[] => {
  const colours = kitColours(kit);
  const parts: THREE.BufferGeometry[] = [];
  // Stripes need sharp edges, which colours blended between vertices don't give, so each is its own
  // piece of ring.
  const stripes = 10;
  for (let s = 0; s < stripes; s++) {
    const ring = new THREE.TorusGeometry(radius, 0.05, 6, 3, (Math.PI * 2) / stripes);
    ring.rotateZ((s * Math.PI * 2) / stripes);
    parts.push(part(ring, colours[s % 2] ?? colours[0], [0, neck, 0], [Math.PI / 2, 0, 0]));
  }
  for (let s = 0; s < length; s++) {
    const y = neck - 0.07 - s * 0.06;
    // Tipped to lie flat on the chest.
    const slope = (chest(y - 0.03) - chest(y + 0.03)) / 0.06;
    parts.push(
      part(
        new THREE.BoxGeometry(0.1, 0.06, 0.03),
        colours[s % 2] ?? colours[0],
        [0.06 + s * 0.004, y, chest(y)],
        [-Math.atan(slope), 0, 0.06],
      ),
    );
  }
  return parts;
};

/** A woolly hat with a bobble on top, in the kit's colours, for a head of a given size. */
const bobbleHat = (kit: Kit, centre: Vec3, radius: number): THREE.BufferGeometry[] => {
  const [first, second] = kitColours(kit);
  const [x, y, z] = centre;
  const brim = Math.PI * 0.4;
  return [
    part(new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, brim), first, centre),
    part(
      new THREE.TorusGeometry(radius * Math.sin(brim), radius * 0.13, 6, 18),
      second,
      [x, y + radius * Math.cos(brim), z],
      [Math.PI / 2, 0, 0],
    ),
    part(sphere(radius * 0.28), second, [x, y + radius * 1.12, z]),
  ];
};

/** How far up a figure's arms are, `since` seconds into a cheer: up fast, held, then down slowly. */
const armsUp = (since: number) =>
  since < 0 ? 0 : Math.min(1, since / 0.12) * (1 - THREE.MathUtils.smoothstep(since, 0.9, 1.5));

/** How high a figure is off the ground, `since` seconds into a jump of a given height and length. */
const jumping = (since: number, height: number, length: number) =>
  since > 0 && since < length ? Math.sin((since / length) * Math.PI) * height : 0;

/** The box a figure fills, standing still: how wide, and its bottom and top above the ground. */
export interface Bounds {
  readonly width: number;
  readonly bottom: number;
  readonly top: number;
}

/** One figure in the crowd. */
export interface Figure {
  readonly object: THREE.Object3D;
  readonly bounds: Bounds;
  /** How wide its shadow is. */
  readonly shadow: number;
  /** Poses it: `seconds` keeps it fidgeting, and `since` is how far into a cheer it is. */
  pose(seconds: number, since: number): void;
}

// --- Fans ---------------------------------------------------------------------------------------

const SKIN = [0xf2c9a0, 0xe3ae86, 0xc68a5e, 0x9a6440, 0x6d4128] as const;
const HAIR = [0x231710, 0x3d2616, 0x6e4422, 0xc9a25e, 0x9c3a18, 0x8f8f8f, 0x111111] as const;
const TROUSERS = [0x2f4466, 0x3a5580, 0x26262b, 0x6b6250, 0x4a4f57] as const;
const SHOES = [0x1c1c1c, 0xf0f0f0, 0x6b4127, 0x9a2a2a] as const;
/** What the fans who aren't in the kit wear: coats and hoodies. */
const COATS = [0x2c3e66, 0x4b5320, 0x7a1f2b, 0x3b3b40, 0xc8611c, 0x1f6f78] as const;
const EYES = 0x1d1a18;
const MOUTH = 0x6a2420;
type Hair = "short" | "long" | "bald" | "bobble" | "cap";
const STYLES: readonly [Hair, ...Hair[]] = ["short", "short", "long", "bald", "bobble", "cap"];

const FAN = { head: [0, 1.6, 0.005] as Vec3, shoulder: 1.4 };

/** A tapering piece of a limb, from one joint to another, `radii` thick at each end. */
const bone = (from: Vec3, to: Vec3, radii: readonly [number, number], paint: Paint) => {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const middle = a.clone().lerp(b, 0.5);
  return part(new THREE.CylinderGeometry(radii[1], radii[0], a.distanceTo(b), 10), paint)
    .applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      ),
    )
    .translate(middle.x, middle.y, middle.z);
};

/** A rounded lump: a ball stretched to `radii` along X, Y and Z. */
const lump = (paint: Paint, at: Vec3, radii: Vec3, turn: Vec3 = [0, 0, 0], detail = 12) =>
  part(sphere(1, detail), paint, at, turn, radii);

/**
 * A fan, about 1.75 m tall and built like the player: most in the player's kit, some in a coat,
 * some heavier round the middle than others, with a scarf, a hat or a flag. They throw their arms
 * up and jump for a header.
 */
const fan = (i: number, kit: Kit, outside: number): Figure => {
  const random = seeded(i);
  const skin = pick(random, SKIN);
  const inKit = random() < 0.75;
  const coat = pick(random, COATS);
  const [first, second] = kitColours(kit);
  const shirt = inKit ? shirtIn(kit, 0.95, 1.5) : coat;
  const trousers = pick(random, TROUSERS);
  const shoes = pick(random, SHOES);
  const hair = pick(random, HAIR);
  const style = pick(random, STYLES);
  const wearsScarf = random() < (inKit ? 0.35 : 0.8);
  const flag = random() < 0.22;
  /** How heavy round the middle. */
  const build = 0.92 + random() * 0.22;
  const { head } = FAN;
  const [, headY, headZ] = head;
  const sleeve = inKit ? first : coat;

  const body: THREE.BufferGeometry[] = [
    // From the hips up to the shoulders, flattened front to back.
    part(
      turned(
        [
          [0, 0.89],
          [0.155, 0.9],
          [0.165, 0.98],
          [0.155 * build, 1.1],
          [0.175, 1.24],
          [0.195, 1.35],
          [0.185, 1.42],
          [0.11, 1.47],
          [0.05, 1.49],
          [0, 1.5],
        ],
        24,
      ),
      (p) => (p.y < 0.96 ? trousers : paintAt(shirt, p)),
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.62],
    ),
    lump(trousers, [0, 0.9, 0], [0.16, 0.08, 0.105]),
    part(new THREE.CylinderGeometry(0.05, 0.056, 0.12, 10), skin, [0, 1.51, 0]),
    // The head, with a jaw, a nose and ears, eyes and brows and a mouth.
    lump(skin, head, [0.09, 0.115, 0.1], [0, 0, 0], 16),
    lump(skin, [0, headY - 0.055, headZ + 0.025], [0.072, 0.058, 0.078]),
    lump(skin, [0, headY - 0.012, headZ + 0.1], [0.016, 0.024, 0.02]),
    lump(MOUTH, [0, headY - 0.052, headZ + 0.093], [0.022, 0.006, 0.006], [0, 0, 0], 6),
  ];
  for (const side of [-1, 1]) {
    const x = side * 0.085;
    body.push(
      lump(skin, [side * 0.09, headY - 0.005, headZ - 0.005], [0.012, 0.026, 0.018], [0, 0, 0], 6),
      lump(EYES, [side * 0.034, headY + 0.012, headZ + 0.088], [0.011, 0.008, 0.006], [0, 0, 0], 6),
      lump(
        hair,
        [side * 0.035, headY + 0.034, headZ + 0.09],
        [0.019, 0.005, 0.006],
        [0, 0, side * -0.15],
        6,
      ),
      bone([x, 0.9, 0], [side * 0.09, 0.5, 0.01], [0.084, 0.062], trousers),
      bone([side * 0.09, 0.5, 0.01], [side * 0.09, 0.09, 0], [0.06, 0.045], trousers),
      lump(trousers, [side * 0.09, 0.5, 0.01], [0.062, 0.062, 0.062], [0, 0, 0], 8),
      lump(shoes, [side * 0.09, 0.045, 0.035], [0.052, 0.045, 0.125]),
    );
  }

  /** Hair or a hat over the top of the head, tipped back so the forehead shows. */
  const cap = (grow: number, to: number, paint: Paint) =>
    part(
      new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, to),
      paint,
      [0, headY + 0.004, headZ - 0.006],
      [-0.35, 0, 0],
      [0.09 + grow, 0.115 + grow, 0.1 + grow],
    );
  switch (style) {
    case "short":
      body.push(cap(0.008, Math.PI * 0.5, hair));
      break;
    case "long":
      body.push(
        cap(0.008, Math.PI * 0.5, hair),
        // Down the back of the head to the shoulders.
        lump(hair, [0, headY - 0.06, headZ - 0.05], [0.085, 0.13, 0.06]),
      );
      break;
    case "bald":
      break;
    case "bobble":
      body.push(...bobbleHat(kit, [0, headY + 0.02, headZ], 0.105));
      break;
    case "cap":
      body.push(
        cap(0.012, Math.PI * 0.45, first),
        part(
          new THREE.CylinderGeometry(0.07, 0.07, 0.01, 18, 1, false, -Math.PI / 2, Math.PI),
          second,
          [0, headY + 0.055, headZ + 0.09],
          [0.25, 0, 0],
          [1, 1, 1.2],
        ),
      );
      break;
  }
  if (wearsScarf) body.push(...scarf(kit, 1.48, 0.075, () => 0.125));

  /** An arm hanging from its shoulder, in a short sleeve for the kit or a long one for a coat. */
  const arm = (side: number, holding: THREE.BufferGeometry[]) =>
    limb(
      [
        lump(sleeve, [0, 0, 0], [0.058, 0.058, 0.058], [0, 0, 0], 10),
        bone([0, 0, 0], [0, -0.3, 0], [0.047, 0.04], inKit ? skin : coat),
        ...(inKit ? [bone([0, 0.02, 0], [0, -0.14, 0], [0.058, 0.053], first)] : []),
        lump(inKit ? skin : coat, [0, -0.3, 0], [0.04, 0.04, 0.04], [0, 0, 0], 8),
        bone([0, -0.3, 0], [0, -0.56, 0.02], [0.039, 0.031], inKit ? skin : coat),
        lump(skin, [0, -0.615, 0.02], [0.034, 0.055, 0.028], [0, 0, 0], 8),
        ...holding,
      ],
      [side * 0.2, FAN.shoulder, 0],
    );
  // A flag on a stick, held up and away from the pitch so it doesn't hide the lanes, and flying
  // further out.
  const flagParts = flag
    ? [
        part(new THREE.CylinderGeometry(0.01, 0.01, 0.95, 6), 0x5a4632, [0, -1.05, 0.02]),
        ...[first, second, first].map((c, k) =>
          part(new THREE.BoxGeometry(0.16, 0.34, 0.012), c, [
            -outside * (0.08 + k * 0.16),
            -1.34,
            0.02,
          ]),
        ),
      ]
    : [];
  const outer = arm(outside, flagParts);
  const inner = arm(-outside, []);

  const object = new THREE.Group();
  object.add(solid(body), outer, inner);
  const phase = random() * Math.PI * 2;
  return {
    object,
    bounds: { width: 0.6, bottom: 0, top: 1.78 },
    shadow: 0.65,
    pose: (seconds, since) => {
      const up = armsUp(since);
      object.position.y = jumping(since, 0.45, 0.42);
      object.rotation.z = Math.sin(seconds * 1.3 + phase) * 0.02;
      const pump = Math.sin(since * 16) * 0.2 * up;
      // Hanging a little out from the sides, then thrown up into a V. Turning an arm about Z by a
      // positive angle swings it out to +X.
      const rest = 0.1 + Math.sin(seconds * 1.1 + phase) * 0.03;
      inner.rotation.z = -outside * (rest + (2.6 - rest) * up + pump);
      // A flag's held up all the time, and waved for a header.
      outer.rotation.z =
        outside *
        (flag
          ? 2.3 + Math.sin(seconds * 2 + phase) * 0.08 + Math.sin(since * 14) * 0.35 * up
          : rest + (2.6 - rest) * up - pump);
    },
  };
};

// --- Penguins -----------------------------------------------------------------------------------

const PENGUIN = {
  back: 0x1f232b,
  belly: 0xf7f7f2,
  chest: 0xfbe6a2,
  ears: 0xf6a623,
  beak: 0xef8a26,
  tip: 0x2a2626,
  feet: 0xf0902a,
};
const CHICK = { down: 0x9aa3ad, belly: 0xc6cdd4, mask: 0xf4f4f2, cap: 0x1f232b, feet: 0x5b5f66 };

/**
 * An emperor penguin, about 1.2 m tall: black back, white belly, golden patches by its ears. Some
 * wrap up in a scarf or a bobble hat in the kit's colours, and one in four is a grey chick. They
 * waddle on the spot, and flap and hop for a header.
 */
const penguin = (i: number, kit: Kit): Figure => {
  const random = seeded(i);
  const chick = i % 4 === 3;
  const dressed = random();

  const paint = (p: THREE.Vector3) => {
    const front = facing(p);
    if (chick) {
      if (p.y > 0.9) return front > 0.2 && p.y < 1.13 ? CHICK.mask : CHICK.cap;
      return front > 0.3 ? CHICK.belly : CHICK.down;
    }
    const side = Math.abs(p.x) / (Math.hypot(p.x, p.z) || 1);
    if (p.y > 0.84 && p.y < 1.0 && side > 0.62 && p.z > -0.04) return PENGUIN.ears;
    // The belly narrows towards the neck, and stops under the chin.
    if (p.y < 0.96 && front > 0.12 + 0.72 * THREE.MathUtils.smoothstep(p.y, 0.68, 0.95)) {
      return p.y > 0.7 ? PENGUIN.chest : PENGUIN.belly;
    }
    return PENGUIN.back;
  };

  const body: THREE.BufferGeometry[] = [
    part(
      turned(
        [
          [0, 0],
          [0.2, 0.02],
          [0.3, 0.1],
          [0.34, 0.26],
          [0.33, 0.45],
          [0.28, 0.64],
          [0.22, 0.8],
          [0.19, 0.9],
          [0.2, 1.01],
          [0.18, 1.12],
          [0.11, 1.2],
          [0, 1.22],
        ],
        24,
      ),
      paint,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.9],
    ),
    part(
      new THREE.ConeGeometry(0.045, 0.17, 12),
      (p) => (p.y > 0.03 ? PENGUIN.tip : chick ? PENGUIN.tip : PENGUIN.beak),
      [0, 1.0, 0.24],
      [Math.PI / 2 + 0.25, 0, 0],
      [1, 1, 0.8],
    ),
  ];
  for (const side of [-1, 1]) {
    body.push(
      // White rings round the eyes, so they show on the black head.
      part(
        sphere(0.042),
        chick ? CHICK.mask : PENGUIN.belly,
        [side * 0.08, 1.07, 0.158],
        [0, side * 0.4, 0],
        [1, 1, 0.5],
      ),
      part(sphere(0.024), EYES, [side * 0.086, 1.072, 0.176]),
      part(
        sphere(),
        chick ? CHICK.feet : PENGUIN.feet,
        [side * 0.1, 0.02, 0.2],
        [0, side * 0.3, 0],
        [0.09, 0.035, 0.13],
      ),
    );
  }
  // The end of the scarf lies on the belly, which bulges out lower down.
  if (!chick && dressed < 0.35)
    body.push(...scarf(kit, 0.87, 0.2, (y) => 0.225 + (0.8 - y) * 0.3, 5));
  else if (!chick && dressed < 0.6) body.push(...bobbleHat(kit, [0, 1.09, 0], 0.2));

  const flipper = (side: number) =>
    limb(
      [
        part(
          sphere(1, 10),
          chick ? CHICK.down : PENGUIN.back,
          [0, -0.26, 0],
          [0, 0, 0],
          [0.04, 0.3, 0.11],
        ),
      ],
      [side * 0.27, 0.8, 0],
    );
  const left = flipper(1);
  const right = flipper(-1);

  const object = new THREE.Group();
  object.add(solid(body), left, right);
  if (chick) object.scale.setScalar(0.62);
  const phase = random() * Math.PI * 2;
  return {
    object,
    bounds: chick ? { width: 0.5, bottom: 0, top: 0.82 } : { width: 0.8, bottom: 0, top: 1.3 },
    shadow: chick ? 0.5 : 0.85,
    pose: (seconds, since) => {
      const up = armsUp(since);
      object.position.y = jumping(since, 0.35, 0.32);
      object.rotation.z = Math.sin(seconds * 2.4 + phase) * 0.05;
      const flap =
        0.3 + Math.sin(seconds * 1.7 + phase) * 0.05 + up * (0.7 + Math.sin(since * 30) * 0.45);
      left.rotation.z = flap;
      right.rotation.z = -flap;
    },
  };
};

// --- Aliens -------------------------------------------------------------------------------------

const ALIEN_SKIN = [0x7ed957, 0x5fd6ae, 0xae8cf0, 0xa6e03c, 0x6fc3ff] as const;
const ANTENNAE = [0xfff36b, 0xff7ae0, 0x7ef9ff, 0xb6ff6b] as const;
const SUIT = { silver: 0xc7ced8, belt: 0x3b4250 };
const EYE_WHITE = 0xf4f4ee;
type Eyes = "almond" | "cyclops" | "three";
type Outfit = "none" | "suit" | "kit";

/**
 * A little alien, about 1.45 m tall with a big bulb of a head: big black eyes, or one huge one, or
 * three, and two antennae with glowing tips. Some wear a silver suit, some the player's kit. They
 * wave their arms, their antennae boing, and they jump high and slow, as if on the Moon.
 */
const alien = (i: number, kit: Kit): Figure => {
  const random = seeded(i);
  const skin = new THREE.Color(pick(random, ALIEN_SKIN));
  const dark = skin.clone().multiplyScalar(0.7);
  const glow = pick(random, ANTENNAE);
  const eyes = pick<Eyes>(random, ["almond", "almond", "cyclops", "three"]);
  const outfit = pick<Outfit>(random, ["none", "suit", "kit"]);

  const shirt: Paint =
    outfit === "suit"
      ? (p) => (p.y > 0.47 && p.y < 0.51 ? SUIT.belt : SUIT.silver)
      : outfit === "kit"
        ? (p) => (p.y < 0.47 ? kit.shorts : paintAt(shirtIn(kit, 0.47, 0.84), p))
        : skin;

  const head = (p: THREE.Vector3) =>
    skin.clone().lerp(new THREE.Color(0xffffff), Math.max(0, p.y - 1.25) * 0.8);
  const body: THREE.BufferGeometry[] = [
    part(
      turned([
        [0, 0.36],
        [0.12, 0.38],
        [0.155, 0.47],
        [0.15, 0.6],
        [0.13, 0.7],
        [0.09, 0.78],
        [0.04, 0.83],
        [0, 0.84],
      ]),
      shirt,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.85],
    ),
    part(new THREE.CylinderGeometry(0.035, 0.045, 0.1, 10), skin, [0, 0.86, 0]),
    part(
      turned([
        [0, 0.88],
        [0.07, 0.895],
        [0.13, 0.95],
        [0.2, 1.05],
        [0.26, 1.17],
        [0.285, 1.27],
        [0.26, 1.36],
        [0.18, 1.43],
        [0, 1.46],
      ]),
      head,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.88],
    ),
    part(sphere(), 0x1d3020, [0, 0.99, 0.136], [0, 0, 0], [0.045, 0.014, 0.012]),
  ];
  for (const side of [-1, 1]) {
    body.push(
      part(new THREE.CapsuleGeometry(0.045, 0.28, 3, 6), skin, [side * 0.075, 0.22, 0]),
      part(sphere(), dark, [side * 0.08, 0.035, 0.03], [0, 0, 0], [0.065, 0.045, 0.1]),
    );
  }
  switch (eyes) {
    case "almond":
      for (const side of [-1, 1]) {
        body.push(
          // Tilted up at the outside corners, and turned to follow the curve of the head.
          part(
            sphere(1, 12),
            0x0c0c12,
            [side * 0.105, 1.16, 0.194],
            [0, side * 0.4, side * 0.42],
            [0.1, 0.06, 0.04],
          ),
          part(sphere(0.016, 6), 0xffffff, [side * 0.085, 1.185, 0.228]),
        );
      }
      break;
    case "cyclops":
      body.push(
        part(sphere(0.11, 16), EYE_WHITE, [0, 1.2, 0.2], [0, 0, 0], [1, 1, 0.55]),
        part(sphere(0.06, 12), 0x7b3fc4, [0, 1.19, 0.24], [0, 0, 0], [1, 1, 0.5]),
        part(sphere(0.03, 8), 0x0c0c12, [0, 1.19, 0.262], [0, 0, 0], [1, 1, 0.5]),
      );
      break;
    case "three":
      for (const [x, y] of [
        [-0.12, 1.17],
        [0, 1.24],
        [0.12, 1.17],
      ] as const) {
        // Set into the head, which is wider higher up.
        const radius = 0.255 + (y - 1.17) * 0.35;
        const z = Math.sqrt(radius ** 2 - x * x) * 0.88 - 0.02;
        body.push(
          part(sphere(0.055), EYE_WHITE, [x, y, z]),
          part(sphere(0.028), 0x0c0c12, [x, y, z + 0.045], [0, 0, 0], [1, 1, 0.6]),
        );
      }
      break;
  }

  const antennae = new THREE.Group();
  antennae.position.set(0, 1.42, 0);
  const stalks: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const lean = 0.38;
    const along = (d: number): Vec3 => [side * (0.06 + Math.sin(lean) * d), Math.cos(lean) * d, 0];
    stalks.push(
      part(new THREE.CylinderGeometry(0.01, 0.014, 0.3, 6), dark, along(0.15), [
        0,
        0,
        -side * lean,
      ]),
      part(sphere(0.042, 8), glow, along(0.31)),
    );
  }
  antennae.add(solid(stalks, GLOW));

  // A sleeve on arms this thin looks like a wristband, so the kit's worn sleeveless.
  const arm = (side: number) =>
    limb(
      [
        part(new THREE.CapsuleGeometry(0.032, 0.34, 3, 6), outfit === "suit" ? SUIT.silver : skin),
        part(sphere(0.048), skin, [0, -0.22, 0]),
      ].map((g) => g.translate(0, -0.2, 0)),
      [side * 0.15, 0.74, 0],
    );
  const left = arm(1);
  const right = arm(-1);

  const object = new THREE.Group();
  object.add(solid(body), antennae, left, right);
  const phase = random() * Math.PI * 2;
  return {
    object,
    bounds: { width: 0.62, bottom: 0, top: 1.78 },
    shadow: 0.6,
    pose: (seconds, since) => {
      const up = armsUp(since);
      object.position.y = jumping(since, 0.8, 0.9);
      const boing =
        since > 0 && since < 2 ? Math.sin(since * 26) * 0.4 * Math.exp(-since * 2.5) : 0;
      antennae.rotation.z = Math.sin(seconds * 3.1 + phase) * 0.1 + boing;
      const wiggle = Math.sin(since * 24) * 0.3 * up;
      const rest = 0.25 + Math.sin(seconds * 1.4 + phase) * 0.05;
      left.rotation.z = rest + (2.7 - rest) * up + wiggle;
      right.rotation.z = -(rest + (2.7 - rest) * up - wiggle);
    },
  };
};

// --- Robots -------------------------------------------------------------------------------------

/** A robot's paintwork: enamel on metal, with a soft shine that the fans' clothes don't have. */
const ENAMEL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 });
/** Muted, as working machines are: off-white, silver, gunmetal, and a dusty orange or sand. */
const ROBOT_PAINT = [0xd8dbde, 0xaab0b8, 0x6c737c, 0xc48a45, 0xd6c6a2] as const;
const ROBOT = { joint: 0x4d535c, dark: 0x262a31, screen: 0x0f131a, eyes: 0x8ff3ff };
/** The red dust of Mars, worked up its legs. */
const DUST = new THREE.Color(0x9a5638);
const ROBOT_LIGHTS = [0xff5a4a, 0xffc94a, 0x5fe88a] as const;

/**
 * A robot, about 1.6 m tall and built like a person: armoured thighs and upper arms over jointed
 * limbs, a chest with a panel of lights, and a head with a dark visor and two round lenses that
 * glow, under an aerial with a red light. Some are painted in the player's kit, and some wear a
 * scarf in it, and all have Mars's red dust worked up their legs. They throw their arms up and
 * jump for a header, and their aerials boing.
 */
const robot = (i: number, kit: Kit): Figure => {
  const random = seeded(i);
  const paint = pick(random, ROBOT_PAINT);
  const inKit = random() < 0.45;
  const wearsScarf = !inKit && random() < 0.6;
  // Indexed, as the other shapes are, so they all merge.
  const rounded = (width: number, height: number, depth: number, radius: number, segments = 1) =>
    mergeVertices(new RoundedBoxGeometry(width, height, depth, segments, radius));
  /** A colour with dust worked into it, thickest at the feet and gone by the knees. */
  const dusty = (colour: THREE.ColorRepresentation, height: number) => {
    const clean = new THREE.Color(colour);
    return (p: THREE.Vector3) =>
      clean.clone().lerp(DUST, 0.6 * (1 - THREE.MathUtils.smoothstep(p.y + height, 0.05, 0.45)));
  };

  const body: THREE.BufferGeometry[] = [
    // The chest, flattened front to back, turned finely enough round for a striped kit's edges.
    part(
      turned(
        [
          [0, 0.76],
          [0.15, 0.77],
          [0.175, 0.84],
          [0.18, 0.98],
          [0.2, 1.1],
          [0.19, 1.18],
          [0.11, 1.22],
          [0, 1.23],
        ],
        40,
      ),
      inKit ? shirtIn(kit, 0.8, 1.22) : paint,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.75],
    ),
    // A seam round the waist, and the panel of lights.
    part(
      new THREE.TorusGeometry(0.178, 0.008, 4, 24),
      ROBOT.dark,
      [0, 0.95, 0],
      [Math.PI / 2, 0, 0],
      [1, 0.75, 1],
    ),
    part(rounded(0.16, 0.08, 0.03, 0.012), ROBOT.screen, [0, 1.06, 0.145]),
    part(rounded(0.3, 0.12, 0.2, 0.04), ROBOT.joint, [0, 0.74, 0]),
    part(new THREE.CylinderGeometry(0.045, 0.055, 0.08, 12), ROBOT.joint, [0, 1.25, 0]),
    // The head: a rounded box with a visor across the front.
    part(rounded(0.28, 0.23, 0.25, 0.06, 2), paint, [0, 1.37, 0]),
    part(rounded(0.24, 0.1, 0.03, 0.03), ROBOT.screen, [0, 1.38, 0.118]),
  ];
  for (const side of [-1, 1]) {
    const x = side * 0.09;
    body.push(
      part(
        new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12),
        ROBOT.joint,
        [side * 0.145, 1.37, 0],
        [0, 0, Math.PI / 2],
      ),
      // Armoured thighs over jointed shins, on heavy feet.
      part(new THREE.CylinderGeometry(0.062, 0.052, 0.3, 12), paint, [x, 0.55, 0]),
      part(sphere(0.05, 8), ROBOT.dark, [x, 0.39, 0.005]),
      part(new THREE.CylinderGeometry(0.042, 0.036, 0.32, 10), dusty(ROBOT.joint, 0.22), [
        x,
        0.22,
        0,
      ]),
      part(rounded(0.1, 0.06, 0.19, 0.025), dusty(ROBOT.dark, 0.03), [x, 0.03, 0.03]),
    );
  }
  if (wearsScarf) body.push(...scarf(kit, 1.22, 0.1, () => 0.15, 5));

  // What lights up: its lenses, and the lights on its chest.
  const lights: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    lights.push(
      part(sphere(0.026, 8), ROBOT.eyes, [side * 0.055, 1.385, 0.13], [0, 0, 0], [1, 1, 0.5]),
    );
  }
  ROBOT_LIGHTS.forEach((light, k) => {
    lights.push(part(sphere(0.013, 6), light, [(k - 1) * 0.04, 1.06, 0.162]));
  });

  // An aerial on top, which boings.
  const aerial = new THREE.Group();
  aerial.position.set(0, 1.48, 0);
  aerial.add(
    solid(
      [part(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 6), ROBOT.joint, [0, 0.06, 0])],
      ENAMEL,
    ),
    solid([part(sphere(0.022, 8), 0xff4040, [0, 0.13, 0])], GLOW),
  );

  // Arms hanging from ball joints, armoured above the elbow, with a gripper on the end of each.
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.235, 1.13, 0);
    pivot.add(
      solid(
        [
          part(sphere(0.06, 8), ROBOT.joint),
          part(new THREE.CylinderGeometry(0.046, 0.04, 0.24, 10), paint, [0, -0.14, 0]),
          part(sphere(0.04, 8), ROBOT.dark, [0, -0.28, 0]),
          part(new THREE.CylinderGeometry(0.034, 0.03, 0.22, 10), ROBOT.joint, [0, -0.4, 0]),
          // Open at the bottom, like a C on its back.
          part(
            new THREE.TorusGeometry(0.035, 0.013, 5, 9, Math.PI * 1.5),
            ROBOT.dark,
            [0, -0.55, 0],
            [0, 0, -Math.PI / 4],
          ),
        ],
        ENAMEL,
      ),
    );
    return { pivot, side };
  });

  const object = new THREE.Group();
  object.add(solid(body, ENAMEL), solid(lights, GLOW), aerial, ...arms.map((a) => a.pivot));
  const phase = random() * Math.PI * 2;
  return {
    object,
    bounds: { width: 0.66, bottom: 0, top: 1.64 },
    shadow: 0.65,
    pose: (seconds, since) => {
      const up = armsUp(since);
      object.position.y = jumping(since, 0.5, 0.45);
      object.rotation.z = Math.sin(seconds * 1.5 + phase) * 0.02;
      const boing =
        since > 0 && since < 2 ? Math.sin(since * 30) * 0.45 * Math.exp(-since * 2.5) : 0;
      aerial.rotation.z = Math.sin(seconds * 2.3 + phase) * 0.08 + boing;
      // Turning an arm about Z by a positive angle swings it out to +X.
      const rest = 0.1 + Math.sin(seconds * 1.2 + phase) * 0.03;
      const pump = Math.sin(since * 18) * 0.15 * up;
      for (const { pivot, side } of arms) {
        pivot.rotation.z = side * (rest + (2.5 - rest) * up + side * pump);
      }
    },
  };
};

/**
 * Builds one figure in a crowd: the `i`th to turn up. `outside` is the side away from the pitch,
 * +1 for +X or -1 for -X, for anything held up to stay out of the lanes.
 */
export const buildFigure = (crowd: Crowd, i: number, kit: Kit, outside: number): Figure => {
  switch (crowd) {
    case "people": {
      // Meshy's fans where there are (see ./fans.ts), the man and the woman, or one built from
      // shapes.
      const meshy = fanAt(i);
      return meshy ? meshyFan(i, kitColours(kit), meshy.model, meshy.size) : fan(i, kit, outside);
    }
    // Meshy's figure where there is one (see ./creatures.ts), or one built from shapes.
    case "penguins":
      return meshyCreature(crowd, i, kitColours(kit), outside) ?? penguin(i, kit);
    case "aliens":
      return meshyCreature(crowd, i, kitColours(kit), outside) ?? alien(i, kit);
    case "robots":
      return meshyCreature(crowd, i, kitColours(kit), outside) ?? robot(i, kit);
    case "fish":
      // In ./props, with the venues' other creatures.
      return meshyCreature(crowd, i, kitColours(kit), outside) ?? fish(i, outside);
    case "ghosts":
      return meshyCreature(crowd, i, kitColours(kit), outside) ?? ghost(i, kit);
    case "romans":
      return meshyCreature(crowd, i, kitColours(kit), outside) ?? roman(i, outside);
  }
};

// --- The crowd ----------------------------------------------------------------------------------

export const CROWD_SIZE = 28;
/**
 * The crowd are a little smaller than life, so they stay at the edges and leave the lanes clear,
 * but not so small they look like toys beside the player.
 */
const FIGURE_SCALE = 0.84;
/**
 * How far either side of the middle the lanes reach, with the things coming down them and the
 * player leaning into them. The crowd stands outside.
 */
const LANES_EDGE = 1.5;
/**
 * How far either side of the middle the crowd keeps clear, at a depth: the lanes, then from 12 m
 * out a little more, to keep the goalmouth clear behind where things are thrown from.
 */
const clearOf = (depth: number) =>
  LANES_EDGE + 0.8 * THREE.MathUtils.clamp((depth - 12) / 10, 0, 1);
/** Where the crowd can stand, in metres in front of the player, and the steps tried in between. */
const STANDS = { near: 3.5, far: 24, deeper: 0.2, further: 0.1 };
/** How much of a figure can be past the side of the screen. */
const OFF_SCREEN = 0.4;
/** The room kept between figures on the screen, where the screen is 2 across and 2 high. */
const GAP = 0.006;
/**
 * How much of a figure, from the feet up, can be hidden behind someone nearer the front, as in any
 * crowd. Their faces and bodies always show.
 */
const LEGS = 0.25;

/** Where a figure is on the screen, with the screen running from -1 to 1 each way. */
interface Rect {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  /** How far in front of the player it stands, in metres. */
  readonly depth: number;
}

const corner = new THREE.Vector3();

/** Where a figure's box would be on the screen, standing `x` across and `depth` in front. */
const onScreen = (camera: THREE.Camera, x: number, depth: number, bounds: Bounds): Rect => {
  const half = (bounds.width * FIGURE_SCALE) / 2;
  const rect = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity, depth };
  for (const dx of [-half, half]) {
    for (const y of [bounds.bottom, bounds.top]) {
      corner.set(x + dx, y * FIGURE_SCALE, -depth).project(camera);
      rect.left = Math.min(rect.left, corner.x);
      rect.right = Math.max(rect.right, corner.x);
      rect.bottom = Math.min(rect.bottom, corner.y);
      rect.top = Math.max(rect.top, corner.y);
    }
  }
  return rect;
};

/** Whether one figure hides any of another, apart from the legs of whichever is further back. */
const overlaps = (a: Rect, b: Rect) => {
  const legs = (r: Rect, behind: boolean) => (behind ? (r.top - r.bottom) * LEGS : 0);
  const aBottom = a.bottom + legs(a, a.depth > b.depth);
  const bBottom = b.bottom + legs(b, b.depth > a.depth);
  return (
    a.left < b.right + GAP &&
    b.left < a.right + GAP &&
    aBottom < b.top + GAP &&
    bBottom < a.top + GAP
  );
};

/**
 * Where a figure can stand without hiding, or being hidden by, any already placed: as near the
 * front as it can, and as near the pitch as it can at that depth, but no more than a little past
 * the side of the screen. Undefined if there's nowhere left.
 */
const findRoom = (
  camera: THREE.Camera,
  side: number,
  bounds: Bounds,
  taken: readonly Rect[],
): { x: number; depth: number; rect: Rect } | undefined => {
  const half = (bounds.width * FIGURE_SCALE) / 2;
  for (let depth = STANDS.near; depth <= STANDS.far; depth += STANDS.deeper) {
    for (let out = 0; ; out += STANDS.further) {
      const x = side * (clearOf(depth) + half + out);
      const rect = onScreen(camera, x, depth, bounds);
      const past = Math.max(0, rect.right - 1, -1 - rect.left) / (rect.right - rect.left);
      if (past > OFF_SCREEN) break;
      if (!taken.some((other) => overlaps(rect, other))) return { x, depth, rect };
    }
  }
  return undefined;
};

/** How many turn up for a streak: nobody at first, then more and more. */
export const crowdFor = (streak: number): number =>
  streak < 2 ? 0 : Math.min(CROWD_SIZE, Math.round(streak ** 1.5 / 1.5));

export interface CrowdView {
  readonly object: THREE.Object3D;
  /** Places the crowd at the edges of the view, which depends on the screen's shape. */
  layout(camera: THREE.PerspectiveCamera): void;
  cheer(seconds: number): void;
  update(seconds: number, dt: number, wanted: number): void;
}

export const buildCrowd = (crowd: Crowd, kit: Kit): CrowdView => {
  const object = new THREE.Group();
  const shadow = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  const square = new THREE.PlaneGeometry(1, 1);
  // Figures join alternating sides, each standing where layout finds room for it.
  const slots = Array.from({ length: CROWD_SIZE }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const figure = buildFigure(crowd, i, kit, side);
    const place = new THREE.Group();
    place.scale.setScalar(0);
    if (figure.shadow > 0) {
      const blob = new THREE.Mesh(square, shadow);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.02;
      blob.scale.setScalar(figure.shadow);
      place.add(blob);
    }
    place.add(figure.object);
    object.add(place);
    return {
      figure,
      place,
      side,
      /** Whether there's room for it on this screen. */
      fits: false,
      shown: 0,
      hop: (i % 5) * 0.08,
    };
  });
  let cheeredAt = -10;
  // Each figure is a few meshes and a shadow, a draw call each. Batched by material, the whole
  // crowd is a handful (see ./batch.ts).
  const batches = batchMeshes(object);

  return {
    object,
    layout: (camera) => {
      // Places them one by one on the screen, so none stands in front of another. Those nearer
      // the front come first, so they're the first to turn up.
      camera.updateMatrixWorld();
      const taken: Rect[] = [];
      for (const slot of slots) {
        const room = findRoom(camera, slot.side, slot.figure.bounds, taken);
        slot.fits = room !== undefined;
        if (!room) continue;
        taken.push(room.rect);
        slot.place.position.set(room.x, 0, -room.depth);
        // Turned in a little, to watch the player.
        slot.place.rotation.y = Math.atan2(-room.x, room.depth);
      }
    },
    cheer: (seconds) => {
      cheeredAt = seconds;
    },
    update: (seconds, dt, wanted) => {
      // Only those with room turn up, in order.
      let joined = 0;
      slots.forEach((slot) => {
        const target = slot.fits && joined++ < wanted ? 1 : 0;
        slot.shown += (target - slot.shown) * Math.min(1, dt * 8);
        slot.place.scale.setScalar(slot.shown * FIGURE_SCALE);
        slot.place.visible = slot.shown > 0.01;
        if (slot.place.visible) slot.figure.pose(seconds, seconds - cheeredAt - slot.hop);
      });
      batches.sync();
    },
  };
};
