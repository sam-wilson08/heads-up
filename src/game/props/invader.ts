import * as THREE from "three";
import { part, solid, type Vec3 } from "./shapes";

// The people on the pitch at the Cup Final: a pitch invader in a fan's shirt and jeans, and the
// stewards chasing them in hi-vis. Each is a cartoon figure about 1.75 m tall, standing on its
// origin facing +Z, with arms and legs that swing as it runs (see twists/cupfinal.ts).

export interface Runner {
  readonly object: THREE.Object3D;
  /**
   * Poses it: `stride` is how far through its running stride it is, in radians, and `crouch` how
   * far it's bent down to plant something, from 0 to 1.
   */
  pose(stride: number, crouch: number): void;
  /** Where the hand that carries things is, to hang a flare from. */
  readonly hand: THREE.Object3D;
}

interface Dress {
  readonly top: number;
  /** Stripes across the top, if any: hi-vis bands, or a fan's hoops. */
  readonly bands?: number;
  readonly legs: number;
  readonly skin: number;
  readonly hair: number;
}

export const DRESS = {
  invader: { top: 0xd8202f, bands: 0xf4f1ea, legs: 0x2f4466, skin: 0xe3ae86, hair: 0x3d2616 },
  steward: { top: 0xd6f21a, bands: 0xd9dde6, legs: 0x1c1c22, skin: 0xc68a5e, hair: 0x111111 },
} as const satisfies Record<string, Dress>;

/** A limb hanging from a pivot at `at`: the pivot turns to swing it. */
const limb = (length: number, radius: number, colour: number, end: number, at: Vec3) => {
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  pivot.add(
    solid([
      part(new THREE.CapsuleGeometry(radius, length, 3, 6), colour, [0, -length / 2 - radius, 0]),
      part(new THREE.SphereGeometry(radius * 1.15, 6, 5), end, [0, -length - radius * 2, 0]),
    ]),
  );
  return pivot;
};

export const runner = (dress: Dress): Runner => {
  const object = new THREE.Group();
  const body = new THREE.Group();
  const bands = dress.bands;
  const top = (p: THREE.Vector3) =>
    bands !== undefined && Math.abs(((p.y - 1.05) / 0.13) % 2) < 0.45 ? bands : dress.top;
  body.add(
    solid([
      part(new THREE.CapsuleGeometry(0.2, 0.42, 4, 8), top, [0, 1.15, 0], [0, 0, 0], [1, 1, 0.75]),
      part(new THREE.SphereGeometry(0.17, 10, 8), dress.skin, [0, 1.62, 0]),
      part(
        new THREE.SphereGeometry(0.175, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        dress.hair,
        [0, 1.65, -0.01],
        [-0.3, 0, 0],
      ),
    ]),
  );
  const legs = [-1, 1].map((side) =>
    limb(0.62, 0.08, dress.legs, 0x1c1c1c, [side * 0.11, 0.86, 0]),
  );
  const arms = [-1, 1].map((side) =>
    limb(0.5, 0.06, dress.top, dress.skin, [side * 0.27, 1.38, 0]),
  );
  body.add(...legs, ...arms);
  object.add(body);
  const hand = new THREE.Group();
  hand.position.set(0, -0.68, 0.05);
  arms[1]?.add(hand);
  return {
    object,
    hand,
    pose: (stride, crouch) => {
      const swing = Math.sin(stride) * 0.9 * (1 - crouch);
      legs.forEach((leg, i) => {
        leg.rotation.x = (i ? swing : -swing) - crouch * 1.1;
      });
      arms.forEach((arm, i) => {
        arm.rotation.x = (i ? -swing : swing) * 0.9 - crouch * 0.9;
      });
      // Leaning into the run, bobbing with each stride, and bent right over to plant.
      body.rotation.x = 0.25 * (1 - crouch) + crouch * 0.7;
      body.position.y = Math.abs(Math.cos(stride)) * 0.08 * (1 - crouch) - crouch * 0.35;
    },
  };
};
