import * as THREE from "three";
import type { Figure } from "../crowd";
import { flat, noise, type Paint, PAINTED_THIN, part, seeded, solid, turned } from "./shapes";

// The crowd at the Underwater pitch: fish, side on so they read as fish, facing in towards the
// pitch. Three kinds take turns turning up: a striped tropical fish, a plain blue one and a
// pufferfish. They hang in the water, tails going, and for a header they flip, or puff up.
// Each is about 1.2 m long, centred 1.3 m up, nose along +X before it's turned to face in.

const EYE = { white: 0xf6f6f2, pupil: 0x111216 };

/** A fish's body, turned about its length: nose at +X, tail at -X, flattened side to side. */
const body = (outline: readonly (readonly [number, number])[], depth: number, paint: Paint) =>
  part(turned(outline, 18, 28).rotateZ(-Math.PI / 2), paint, [0, 0, 0], [0, 0, 0], [1, 1, depth]);

/** An eye each side, set into the body at `x` along and `y` up, `z` out from the middle. */
const eyes = (x: number, y: number, z: number, size: number) =>
  [-1, 1].flatMap((side) => [
    part(new THREE.SphereGeometry(size, 10, 8), EYE.white, [x, y, side * z]),
    part(new THREE.SphereGeometry(size * 0.55, 8, 6), EYE.pupil, [
      x + size * 0.2,
      y,
      side * (z + size * 0.6),
    ]),
  ]);

/** How high a fish rises, `since` seconds into a cheer. */
const rising = (since: number, height: number, length: number) =>
  since > 0 && since < length ? Math.sin((since / length) * Math.PI) * height : 0;

interface Kind {
  /** What's merged into the body. */
  readonly parts: THREE.BufferGeometry[];
  /** The tail fin, hinged at its root, which is at the origin. */
  readonly tail: THREE.BufferGeometry[];
  /** Where along the body the tail is hinged. */
  readonly tailAt: number;
  readonly puffer?: boolean;
}

const STRIPES = [
  { body: 0xff7a1f, band: 0xffffff, edge: 0x1a1a1a },
  { body: 0xffc21f, band: 0x1f3fbf, edge: 0x10204f },
  { body: 0x8b4fd8, band: 0xffd23f, edge: 0x3b1a6a },
] as const;

/** A tropical fish: tall and round, in bright bands edged with a dark line, with a big fin. */
const tropical = (random: () => number): Kind => {
  const scheme = STRIPES[Math.floor(random() * STRIPES.length)] ?? STRIPES[0];
  const paint = (p: THREE.Vector3) => {
    // Bands behind the head and round the middle.
    const band = Math.min(Math.abs(p.x - 0.2), Math.abs(p.x + 0.12));
    if (band < 0.05) return scheme.band;
    if (band < 0.075) return scheme.edge;
    return scheme.body;
  };
  return {
    parts: [
      body(
        [
          [0, -0.5],
          [0.08, -0.46],
          [0.26, -0.25],
          [0.33, 0],
          [0.28, 0.28],
          [0.12, 0.47],
          [0, 0.52],
        ],
        0.42,
        paint,
      ),
      ...eyes(0.32, 0.06, 0.1, 0.06),
      part(
        flat([
          [-0.32, 0.22],
          [-0.05, 0.42],
          [0.2, 0.3],
          [0.05, 0.22],
        ]),
        scheme.edge,
      ),
      part(
        flat([
          [-0.3, -0.2],
          [-0.08, -0.36],
          [0.08, -0.22],
        ]),
        scheme.body,
      ),
    ],
    tail: [
      part(
        flat([
          [0, 0.04],
          [-0.24, 0.24],
          [-0.2, 0],
          [-0.24, -0.24],
          [0, -0.04],
        ]),
        scheme.edge,
      ),
    ],
    tailAt: -0.46,
  };
};

/** A plain fish: long and sleek, blue on top fading to silver underneath, freckled. */
const sleek = (random: () => number): Kind => {
  const back = new THREE.Color(random() < 0.5 ? 0x2f6fd0 : 0x2aa4b8);
  const belly = new THREE.Color(0xdfe9ef);
  const freckles = noise(Math.floor(random() * 100), 2);
  return {
    parts: [
      body(
        [
          [0, -0.55],
          [0.07, -0.5],
          [0.19, -0.2],
          [0.21, 0.1],
          [0.15, 0.4],
          [0.05, 0.56],
          [0, 0.58],
        ],
        0.55,
        (p) => {
          const c = belly.clone().lerp(back, THREE.MathUtils.smoothstep(p.y, -0.06, 0.1));
          return freckles(p.x * 12, p.y * 12, p.z * 12) > 0.45 ? c.multiplyScalar(0.7) : c;
        },
      ),
      ...eyes(0.4, 0.04, 0.07, 0.05),
      part(
        flat([
          [-0.15, 0.15],
          [0.0, 0.32],
          [0.14, 0.17],
        ]),
        back,
      ),
    ],
    tail: [
      part(
        flat([
          [0, 0.03],
          [-0.26, 0.2],
          [-0.16, 0],
          [-0.26, -0.2],
          [0, -0.03],
        ]),
        back,
      ),
    ],
    tailAt: -0.52,
  };
};

/** A pufferfish: a round, spiny, sandy ball with a pale belly, brown spots and big eyes. */
const puffer = (): Kind => {
  const sand = new THREE.Color(0xe8c46a);
  const belly = new THREE.Color(0xfaf1d6);
  const spots = noise(9, 2);
  const skin = (p: THREE.Vector3) => {
    const c = belly.clone().lerp(sand, THREE.MathUtils.smoothstep(p.y, -0.15, 0.05));
    return spots(p.x * 9, p.y * 9, p.z * 9) > 0.35 && p.y > -0.05 ? c.multiplyScalar(0.55) : c;
  };
  const spines: THREE.BufferGeometry[] = [];
  // Spread evenly over the ball on a golden-angle spiral, skipping the face.
  for (let i = 0; i < 40; i++) {
    const y = 1 - ((i + 0.5) / 40) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const out = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (out.x > 0.75) continue;
    spines.push(
      part(new THREE.ConeGeometry(0.025, 0.11, 5), 0xc99a46)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out))
        .translate(out.x * 0.36, out.y * 0.36, out.z * 0.36),
    );
  }
  return {
    parts: [
      part(new THREE.SphereGeometry(0.36, 18, 14), skin),
      ...eyes(0.24, 0.12, 0.2, 0.08),
      ...spines,
      // A little pursed mouth.
      part(
        new THREE.TorusGeometry(0.035, 0.015, 5, 10),
        0x9c5a2a,
        [0.36, -0.04, 0],
        [0, Math.PI / 2, 0],
      ),
    ],
    tail: [
      part(
        flat([
          [0, 0.03],
          [-0.18, 0.13],
          [-0.15, 0],
          [-0.18, -0.13],
          [0, -0.03],
        ]),
        0xd8a84a,
      ),
    ],
    tailAt: -0.33,
    puffer: true,
  };
};

/**
 * The `i`th fish in the crowd, facing in from its side of the pitch, `outside` being +1 for +X.
 */
export const fish = (i: number, outside: number): Figure => {
  const random = seeded(i + 40);
  const kind = [tropical, sleek, puffer][i % 3] ?? tropical;
  const { parts, tail, tailAt, puffer: puffs } = kind(random);

  const fin = new THREE.Group();
  fin.position.x = tailAt;
  fin.add(solid(tail, PAINTED_THIN));
  const swimmer = new THREE.Group();
  swimmer.add(solid(parts, PAINTED_THIN), fin);
  // Turned side on to the player, facing in towards the pitch.
  swimmer.rotation.y = outside > 0 ? Math.PI : 0;
  const object = new THREE.Group();
  object.add(swimmer);
  const size = 0.9 + random() * 0.3;
  swimmer.scale.setScalar(size);
  const phase = random() * Math.PI * 2;

  return {
    object,
    // Up to 1.35 m long, nose to tail, and 1 m from fin tip to belly, puffed up, round its 1.3 m
    // middle, plus the 0.2 it bobs.
    bounds: { width: 1.35, bottom: 0.65, top: 2 },
    shadow: 0,
    pose: (seconds, since) => {
      const up = rising(since, 0.45, 0.6);
      object.position.y = 1.3 + Math.sin(seconds * 2 + i) * 0.2 + up;
      fin.rotation.y = Math.sin(seconds * (since > 0 && since < 1 ? 22 : 9) + phase) * 0.45;
      const tilt = Math.sin(seconds * 1.3 + phase) * 0.06;
      if (puffs) {
        // Puffs up for a header, then slowly lets it out.
        const puff = since > 0 && since < 2 ? Math.min(since / 0.12, 1) * (1 - since / 2) : 0;
        swimmer.scale.setScalar(size * (1 + puff * 0.45));
        swimmer.rotation.z = tilt;
      } else {
        // A loop for a header, nose up and over.
        const loop = since > 0 && since < 0.6 ? THREE.MathUtils.smoothstep(since, 0, 0.6) : 0;
        swimmer.rotation.z = tilt + loop * Math.PI * 2;
      }
    },
  };
};
