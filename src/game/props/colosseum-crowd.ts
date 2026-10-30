import * as THREE from "three";
import type { Figure } from "../crowd";
import { type Paint, part, seeded, solid, turned, type Vec3 } from "./shapes";

// The crowd at the Colosseum: Romans, built like the fans elsewhere. Four kinds take turns turning
// up: citizens in white togas and laurel wreaths, legionaries in red
// with crested helmets and shields, senators with the broad purple stripe, and ladies in coloured
// stolas. They throw their arms up and jump for a header, like any crowd.

const SKIN = [0xf0c9a0, 0xe0b088, 0xc68a5e, 0x9a6440, 0x6d4128] as const;
const HAIR = [0x231710, 0x3d2616, 0x111111, 0x6e4422, 0x8f8f8f] as const;
const TOGA = 0xf1ead8;
const SANDAL = 0x6b4527;
const BRONZE = 0xc08a36;
const RED = 0xa8211c;
const PURPLE = 0x5a1f6e;
const LAUREL = 0x6f8f2a;
const STOLAS = [0xd8902c, 0x2f7f7a, 0xc0506a, 0x6a5aa8, 0x9a6a2a] as const;
const EYES = 0x1d1a18;
const MOUTH = 0x6a2420;

const HEAD_SIZE = 0.125;
/** The middle of the head, on its neck. Its features are placed in head sizes from it. */
const HEAD: Vec3 = [0, 1.32 + HEAD_SIZE, 0];
const R = HEAD_SIZE;
const SHOULDER = 1.13;

const pick = <T>(random: () => number, from: readonly [T, ...T[]]): T =>
  from[Math.floor(random() * from.length)] ?? from[0];

const sphere = (radius = 1, detail = 10) => new THREE.SphereGeometry(radius, detail, detail * 0.75);

/** An arm hanging from its shoulder, which is where it pivots. */
const limb = (parts: THREE.BufferGeometry[], at: Vec3): THREE.Group => {
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  pivot.add(solid(parts.map((g) => g.translate(0, -0.24, 0))));
  return pivot;
};

/** How far up a figure's arms are, `since` seconds into a cheer: up fast, held, then down slowly. */
const armsUp = (since: number) =>
  since < 0 ? 0 : Math.min(1, since / 0.12) * (1 - THREE.MathUtils.smoothstep(since, 0.9, 1.5));

const jumping = (since: number, height: number, length: number) =>
  since > 0 && since < length ? Math.sin((since / length) * Math.PI) * height : 0;

type Kind = "citizen" | "legionary" | "senator" | "lady";
const KINDS: readonly [Kind, ...Kind[]] = ["citizen", "legionary", "senator", "lady"];

/**
 * Builds the `i`th Roman to turn up. `outside` is the side away from the pitch, +1 for +X or -1
 * for -X, so a legionary's shield is held out of the lanes.
 */
export const roman = (i: number, outside: number): Figure => {
  const random = seeded(i * 7 + 3);
  const kind = KINDS[i % KINDS.length] ?? "citizen";
  const skin = pick(random, SKIN);
  const hair = pick(random, HAIR);
  const stola = pick(random, STOLAS);
  const trim = pick(random, [RED, PURPLE, 0x2f4f7f, 0xc8962e] as const);
  const [, headY] = HEAD;
  const headScale: Vec3 = [1, 1.04, 0.95];

  // What they wear from the waist down to the knees or the ankles, and above.
  const garment: Paint = (p: THREE.Vector3) => {
    switch (kind) {
      case "citizen":
        // A fold of toga across the chest, from the left shoulder, edged in colour.
        return Math.abs(p.x * 0.8 + p.y - 1.05) < 0.04 ? trim : TOGA;
      case "senator":
        // The broad purple stripe down the front.
        return Math.abs(p.x) < 0.05 && p.z > 0 ? PURPLE : TOGA;
      case "legionary":
        // A red tunic under a bronze breastplate.
        return p.y > 0.8 && p.y < 1.18 ? BRONZE : RED;
      case "lady":
        return p.y > 1.0 && p.x * outside < 0.02 ? 0xf3ead6 : stola;
    }
  };
  const hem = kind === "lady" ? 0.12 : kind === "legionary" ? 0.5 : 0.36;

  const body: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    body.push(
      part(sphere(), SANDAL, [side * 0.1, 0.045, 0.04], [0, 0, 0], [0.075, 0.05, 0.12]),
      part(new THREE.CapsuleGeometry(0.07, 0.42, 3, 8), skin, [side * 0.1, 0.33, 0]),
      part(
        sphere(R * 0.2, 6),
        skin,
        [side * R * 0.98, headY - R * 0.04, 0],
        [0, 0, 0],
        [0.5, 1, 0.8],
      ),
      part(
        sphere(R * 0.11, 6),
        EYES,
        [side * R * 0.34, headY + R * 0.12, R * 0.88],
        [0, 0, 0],
        [1, 1.2, 0.6],
      ),
    );
  }
  body.push(
    part(
      turned([
        [0, hem],
        [0.24, hem],
        [0.22, 0.6],
        [0.21, 0.8],
        [0.22, 0.95],
        [0.24, 1.08],
        [0.21, 1.16],
        [0.12, 1.21],
        [0, 1.22],
      ]),
      garment,
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0.8],
    ),
    part(new THREE.CylinderGeometry(0.055, 0.065, 0.14, 12), skin, [0, 1.26, 0]),
    part(new THREE.SphereGeometry(HEAD_SIZE, 18, 14), skin, HEAD, [0, 0, 0], headScale),
    // A jaw, a nose and a mouth.
    part(
      sphere(R * 0.75, 10),
      skin,
      [0, headY - R * 0.45, R * 0.22],
      [0, 0, 0],
      [0.85, 0.75, 0.85],
    ),
    part(sphere(R * 0.14, 6), skin, [0, headY - R * 0.06, R * 0.98]),
    part(
      new THREE.TorusGeometry(R * 0.22, R * 0.05, 4, 10, Math.PI),
      MOUTH,
      [0, headY - R * 0.36, R * 0.86],
      [0.25, 0, Math.PI],
    ),
  );

  const cap = (radius: number, to: number, paint: Paint) =>
    part(
      new THREE.SphereGeometry(radius, 18, 8, 0, Math.PI * 2, 0, to),
      paint,
      HEAD,
      [-0.3, 0, 0],
      headScale,
    );
  const wreath = () =>
    part(
      new THREE.TorusGeometry(HEAD_SIZE * 0.96, R * 0.13, 6, 22),
      LAUREL,
      [0, headY + R * 0.32, 0],
      [Math.PI / 2 - 0.25, 0, 0],
    );

  switch (kind) {
    case "citizen":
      body.push(cap(HEAD_SIZE + 0.008, Math.PI / 2, hair), wreath());
      break;
    case "senator":
      // Greying, and thinning on top.
      body.push(cap(HEAD_SIZE + 0.007, Math.PI / 2, 0x9a9a96), wreath());
      break;
    case "legionary":
      body.push(
        // A bronze helmet with cheek guards and a red crest, front to back.
        cap(HEAD_SIZE + 0.016, Math.PI * 0.55, BRONZE),
        ...[-1, 1].map((side) =>
          part(new THREE.BoxGeometry(0.02, R * 0.7, R * 0.5), BRONZE, [
            side * R * 0.98,
            headY - R * 0.3,
            R * 0.25,
          ]),
        ),
        part(sphere(), RED, [0, headY + R * 1.25, -0.01], [0, 0, 0], [0.035, R * 0.5, R * 1.1]),
        // A red cape hanging behind the shoulders.
        part(new THREE.BoxGeometry(0.5, 0.75, 0.03), RED, [0, 0.78, -0.2]),
      );
      break;
    case "lady":
      body.push(
        cap(HEAD_SIZE + 0.008, Math.PI / 2, hair),
        // Her hair up in a bun.
        part(sphere(R * 0.45, 10), hair, [0, headY + R * 0.3, -R * 0.88]),
      );
      break;
  }

  const sleeve = kind === "legionary" ? RED : kind === "lady" ? stola : TOGA;
  const arm = (side: number, holding: THREE.BufferGeometry[]) =>
    limb(
      [
        part(new THREE.CapsuleGeometry(0.06, 0.4, 3, 8), skin),
        part(new THREE.CylinderGeometry(0.075, 0.07, 0.2, 10), sleeve, [0, 0.17, 0]),
        part(sphere(0.068), skin, [0, -0.27, 0]),
        ...holding,
      ],
      [side * 0.245, SHOULDER, 0],
    );
  // A legionary's shield: red, with a bronze boss, held out on the side away from the pitch.
  const shield =
    kind === "legionary"
      ? [
          part(new THREE.BoxGeometry(0.06, 0.62, 0.42), RED, [outside * 0.06, -0.3, 0.05]),
          part(sphere(0.08, 8), BRONZE, [outside * 0.1, -0.3, 0.05]),
        ]
      : [];
  const outer = arm(outside, shield);
  const inner = arm(-outside, []);

  const object = new THREE.Group();
  object.add(solid(body), outer, inner);
  const phase = random() * Math.PI * 2;
  return {
    object,
    bounds: { width: 0.62, bottom: 0, top: kind === "legionary" ? 1.78 : 1.6 },
    shadow: 0.75,
    pose: (seconds, since) => {
      const up = armsUp(since);
      object.position.y = jumping(since, 0.6, 0.45);
      object.rotation.z = Math.sin(seconds * 1.3 + phase) * 0.03;
      const pump = Math.sin(since * 16) * 0.2 * up;
      const rest = 0.12 + Math.sin(seconds * 1.1 + phase) * 0.03;
      inner.rotation.z = -outside * (rest + (2.6 - rest) * up + pump);
      // A legionary keeps his shield down and raises his free arm; everyone else both.
      outer.rotation.z = outside * (kind === "legionary" ? rest : rest + (2.6 - rest) * up - pump);
    },
  };
};
