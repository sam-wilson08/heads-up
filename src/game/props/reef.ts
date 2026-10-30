import * as THREE from "three";
import {
  noise,
  PAINTED,
  PAINTED_THIN,
  part,
  type Prop,
  seeded,
  solid,
  strand,
  swaying,
  turned,
  type Vec3,
} from "./shapes";

// The sea floor round the Underwater pitch: an octopus drifting over the goal, and kelp and coral
// growing either side of it. Units are metres; the goal is down -Z, 30 m away.

/** Tentacles curl and uncurl, the curl travelling out to their tips. */
const TENTACLES = swaying(PAINTED, { reach: 0.55, speed: 1.6, wave: 4 });
/** Kelp sways slowly in the swell. */
const KELP = swaying(PAINTED_THIN, { reach: 0.9, speed: 0.9, wave: 2.2 });

// Bright, so it still shows pink through the murk.
const SKIN = { top: new THREE.Color(0xff3f6e), under: new THREE.Color(0xffa3b0) };
const SPOT = new THREE.Color(0xb3164a);
const EYE = { white: 0xfff1c4, pupil: 0x1a1016 };

/**
 * A tapering tube along a path, `radius(s)` thick at each point `s` from 0 to 1 along it: round
 * enough for a tentacle, from a handful of points.
 */
const tube = (
  path: (s: number) => THREE.Vector3,
  radius: (s: number) => number,
  steps: number,
  sides: number,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const index: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const at = path(s);
    const tangent = path(Math.min(s + 0.01, 1))
      .sub(path(Math.max(s - 0.01, 0)))
      .normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const over = new THREE.Vector3().crossVectors(side, tangent).normalize();
    const r = radius(s);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const p = at
        .clone()
        .addScaledVector(side, Math.cos(a) * r)
        .addScaledVector(over, Math.sin(a) * r);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      index.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * An octopus about 5 m across, drifting high over the back of the pitch: a spotted pink head
 * that swells and settles as it breathes, big sleepy eyes, and eight tentacles that curl as it
 * goes. The tentacles are all one shape, curled by their material.
 */
export const octopus = (): Prop => {
  const spots = noise(4, 2);
  const skin = (p: THREE.Vector3) =>
    SKIN.top
      .clone()
      .lerp(SPOT, THREE.MathUtils.smoothstep(spots(p.x * 3, p.y * 3, p.z * 3), 0.25, 0.4) * 0.7);

  const head = solid([
    part(
      turned(
        [
          [0, -0.2],
          [0.62, -0.05],
          [0.78, 0.45],
          [0.74, 1.05],
          [0.55, 1.55],
          [0.28, 1.82],
          [0, 1.88],
        ],
        20,
      ),
      skin,
      [0, 0, 0],
      [-0.25, 0, 0],
      [1, 1, 0.92],
    ),
    // Big eyes either side of the front, half shut under heavy lids.
    ...[-1, 1].flatMap((side) => [
      part(new THREE.SphereGeometry(0.22, 12, 10), EYE.white, [side * 0.42, 0.42, 0.56]),
      part(
        new THREE.SphereGeometry(0.1, 8, 6),
        EYE.pupil,
        [side * 0.45, 0.42, 0.75],
        [0, 0, 0],
        [1.5, 0.45, 0.6],
      ),
      part(
        new THREE.SphereGeometry(0.26, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45),
        skin,
        [side * 0.42, 0.44, 0.56],
        [0.5, 0, 0],
      ),
    ]),
  ]);

  const random = seeded(8);
  const arms: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const turn = (k / 8) * Math.PI * 2 + 0.2;
    const reach = 1.9 + random() * 0.5;
    const curl = (random() - 0.5) * 1.4;
    // Out and down from under the head, curling back up towards the tip.
    const path = (s: number) => {
      const out = 0.45 + reach * s;
      const a = turn + curl * s * s;
      return new THREE.Vector3(
        Math.cos(a) * out,
        -0.1 - 1.3 * s + 1.1 * s * s * s,
        Math.sin(a) * out * 0.9,
      );
    };
    const arm = tube(path, (s) => 0.22 * (1 - s) ** 0.8 + 0.025, 14, 7);
    strand(arm, (p) => (Math.hypot(p.x, p.z) - 0.45) / reach, k * 1.7);
    // Paler underneath, where the suckers are.
    arms.push(
      part(arm, (p) =>
        SKIN.top.clone().lerp(SKIN.under, THREE.MathUtils.smoothstep(-p.y, 0.3, 1.2) * 0.7),
      ),
    );
  }

  const body = new THREE.Group();
  body.add(head, solid(arms, TENTACLES.material));
  body.scale.setScalar(1.25);
  const object = new THREE.Group();
  object.add(body);
  object.rotation.y = 0.5;
  return {
    object,
    update: (seconds) => {
      TENTACLES.time.value = seconds;
      // It drifts about, bobbing as it pushes itself along.
      object.position.set(
        -7 + Math.sin(seconds * 0.12) * 2,
        7.5 + Math.sin(seconds * 0.8) * 0.4,
        -40,
      );
      head.scale.set(1, 1 + Math.sin(seconds * 1.6) * 0.04, 1);
      body.rotation.z = Math.sin(seconds * 0.5) * 0.08;
    },
  };
};

const KELP_COLOURS = [0x5f7d2a, 0x7a8f2c, 0x4f6d2e] as const;

/** A frond of kelp: a ribbon, wavy at the edges, from the sea floor up towards the light. */
const frond = (height: number, width: number, random: () => number) => {
  const steps = 18;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const ripple = 1 + Math.sin(s * 22 + random()) * 0.25;
    const half = width * ripple * Math.sin(Math.PI * Math.min(0.15 + s * 0.9, 1)) * 0.5;
    const lean = Math.sin(s * 2.4) * 0.3;
    positions.push(lean - half, s * height, 0, lean + half, s * height, 0);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

const UP = new THREE.Vector3(0, 1, 0);

/** A clump of coral: knobbly branches, like fingers, in one bright colour. */
const coral = (colour: number, random: () => number): THREE.BufferGeometry[] => {
  const branches: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2;
    const tilt = 0.2 + random() * 0.6;
    const length = 0.6 + random() * 0.7;
    const towards = new THREE.Vector3(
      Math.cos(a) * Math.sin(tilt),
      Math.cos(tilt),
      Math.sin(a) * Math.sin(tilt),
    );
    const middle = towards.clone().multiplyScalar(length / 2);
    branches.push(
      part(new THREE.CapsuleGeometry(0.11, length, 3, 7), colour)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, towards))
        .translate(middle.x, middle.y, middle.z),
    );
  }
  branches.push(
    part(new THREE.SphereGeometry(0.5, 10, 8), colour, [0, 0, 0], [0, 0, 0], [1, 0.5, 1]),
  );
  return branches;
};

const CORAL = [0xff7a59, 0xc95bd6, 0xffc23d, 0xff5c8a] as const;

/**
 * Kelp in tall clumps either side of the pitch, and coral round their feet, thickening into a
 * reef behind the goal. Kept out of the lanes, so nothing coming at the player is lost in it.
 */
export const reef = (): Prop => {
  const random = seeded(21);
  const fronds: THREE.BufferGeometry[] = [];
  const corals: THREE.BufferGeometry[] = [];
  const clumps: readonly Vec3[] = [
    [-8, 0, -24],
    [-11, 0, -36],
    [-6.5, 0, -44],
    [8.5, 0, -27],
    [11, 0, -40],
    [6.8, 0, -47],
    [-15, 0, -30],
    [15, 0, -33],
  ];
  clumps.forEach(([x, , z], c) => {
    for (let i = 0; i < 5; i++) {
      const height = 3 + random() * 4;
      const blade = frond(height, 0.4 + random() * 0.25, random);
      strand(blade, (p) => p.y / height, c * 2.1 + i * 0.9);
      fronds.push(
        part(
          blade,
          KELP_COLOURS[Math.floor(random() * KELP_COLOURS.length)] ?? 0x5f7d2a,
          [x + (random() - 0.5) * 1.6, 0, z + (random() - 0.5) * 1.6],
          [0, random() * Math.PI, 0],
        ),
      );
    }
    const colour = CORAL[c % CORAL.length] ?? 0xff7a59;
    for (const g of coral(colour, random)) {
      corals.push(g.translate(x + (random() - 0.5) * 2, 0, z + 1 + random()));
    }
  });
  const object = new THREE.Group();
  object.add(solid(fronds, KELP.material), solid(corals));
  return {
    object,
    update: (seconds) => {
      KELP.time.value = seconds;
    },
  };
};
