import * as THREE from "three";
import { glowTexture } from "../textures";
import { PAINTED_THIN, part, type Prop, seeded, solid, turned, type Vec3 } from "./shapes";

// The Funfair round the pitch on a summer evening: a Ferris wheel turning off to the left behind
// the goal, a helter-skelter, a carousel going round on the right, striped tents, and bunting and
// strings of lights between them, all in candy colours. Everything's kept out to the sides, so
// nothing coming at the player is lost against it. The fair's painted into the venue's backdrop
// (see ../backdrop.ts), caught as it turns. Out on the pitch, a trampoline is set into each lane,
// which the twist bounces balls off (see twists/funfair.ts). Units are metres; the goal is down -Z,
// 30 m away.

const CANDY = [0xff5fa2, 0xffd23f, 0x3fc5ff, 0x7be36a, 0xb57bff, 0xff7a3f] as const;
const WHITE = 0xfdf7ee;
const RED = 0xe8323f;
const STEEL = 0xd9dde6;

/** Paints a round shape in `count` stripes round it, alternating two colours. */
const stripes =
  (count: number, one: THREE.ColorRepresentation, two: THREE.ColorRepresentation) =>
  (p: THREE.Vector3) =>
    Math.floor(((Math.atan2(p.z, p.x) / (Math.PI * 2) + 1) % 1) * count) % 2 ? one : two;

/** A rod from one point to another, for spokes, legs and poles. */
const rod = (
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  paint: THREE.ColorRepresentation,
) => {
  const geometry = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 6, 1);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    ),
  );
  const middle = from.clone().lerp(to, 0.5);
  return part(geometry, paint, [middle.x, middle.y, middle.z]);
};

let bulbTexture: THREE.Texture | undefined;
/** A warm bulb's glow, shared by every string of lights. */
const bulbMaterial = (colour: THREE.ColorRepresentation) => {
  bulbTexture ??= glowTexture();
  return new THREE.SpriteMaterial({
    map: bulbTexture,
    color: colour,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
};

/** A string of bulbs along a sagging line from `a` to `b`, `count` of them, in turn colours. */
const lights = (a: Vec3, b: Vec3, count: number, sag: number, size = 0.5): THREE.Object3D => {
  const group = new THREE.Group();
  const materials = [bulbMaterial(0xfff1b8), bulbMaterial(0xffb3d9), bulbMaterial(0xb8f0ff)];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const bulb = new THREE.Sprite(materials[i % materials.length]);
    bulb.position.set(
      THREE.MathUtils.lerp(a[0], b[0], t),
      THREE.MathUtils.lerp(a[1], b[1], t) - sag * 4 * t * (1 - t),
      THREE.MathUtils.lerp(a[2], b[2], t),
    );
    bulb.scale.setScalar(size);
    group.add(bulb);
  }
  return group;
};

/** Bunting: triangular flags in turn colours, hung along a sagging line from `a` to `b`. */
const bunting = (a: Vec3, b: Vec3, count: number, sag: number, size: number) => {
  const parts: THREE.BufferGeometry[] = [];
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const along = to.clone().sub(from);
  const yaw = Math.atan2(-along.z, along.x);
  const at = (t: number) =>
    from
      .clone()
      .lerp(to, t)
      .add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = at(t);
    const flag = new THREE.BufferGeometry();
    flag.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-size / 2, 0, 0, size / 2, 0, 0, 0, -size * 1.3, 0], 3),
    );
    flag.setIndex([0, 1, 2]);
    flag.computeVertexNormals();
    parts.push(part(flag, CANDY[i % CANDY.length] ?? WHITE, [p.x, p.y, p.z], [0, yaw, 0]));
  }
  for (let i = 0; i < 12; i++) {
    parts.push(rod(at(i / 12), at((i + 1) / 12), 0.015, 0x6b5a4a));
  }
  return parts;
};

/**
 * What's drawn live in front of the fair's picture: two tall poles either side of the goal, with
 * bunting and strings of lights hung out from them to the sides, and one string sagging across
 * over the goal, high enough to be clear of everything thrown. The lights twinkle.
 */
export const funfairLive = (): Prop => {
  const object = new THREE.Group();
  const poles: Vec3[] = [
    [-5.6, 0, -32],
    [5.6, 0, -32],
  ];
  const top = 8.4;
  const parts: THREE.BufferGeometry[] = poles.map(([x, , z]) =>
    part(new THREE.CylinderGeometry(0.07, 0.09, top, 8), STEEL, [x, top / 2, z]),
  );
  parts.push(
    ...bunting([-5.6, 8, -32], [5.6, 8, -32], 16, 1.1, 0.42),
    ...bunting([-5.6, 8, -32], [-12, 7.2, -27], 11, 0.8, 0.42),
    ...bunting([5.6, 8, -32], [12, 7.2, -27], 11, 0.8, 0.42),
  );
  object.add(solid(parts, PAINTED_THIN));
  const strings = [
    lights([-5.6, 7.5, -31.9], [5.6, 7.5, -31.9], 18, 1.4, 0.42),
    lights([-5.6, 7.5, -31.9], [-12, 6.8, -26.9], 12, 1, 0.42),
    lights([5.6, 7.5, -31.9], [12, 6.8, -26.9], 12, 1, 0.42),
  ];
  object.add(...strings);
  const bulbs = strings.flatMap((s) => s.children as THREE.Sprite[]);
  return {
    object,
    update: (seconds) => {
      // Each bulb's glow flickers a little, on its own beat.
      bulbs.forEach((bulb, i) => {
        bulb.scale.setScalar(0.42 * (0.85 + 0.15 * Math.sin(seconds * (2.1 + (i % 5) * 0.7) + i)));
      });
    },
  };
};

// --- The rides ----------------------------------------------------------------------------------

const WHEEL = { centre: [-18, 15, -80] as Vec3, radius: 12, cars: 12 };

/**
 * A Ferris wheel: two rims on spokes round a hub, on an A-frame, with a car hanging from each
 * spoke that stays upright as the wheel turns, and bulbs round the rims.
 */
const ferrisWheel = (): Prop => {
  const { radius, cars } = WHEEL;
  const object = new THREE.Group();
  object.position.set(...WHEEL.centre);
  // The frame, standing on the ground.
  const frame: THREE.BufferGeometry[] = [];
  const foot = -WHEEL.centre[1];
  for (const z of [-1.4, 1.4]) {
    for (const x of [-5, 5]) {
      frame.push(rod(new THREE.Vector3(0, 0, z * 0.6), new THREE.Vector3(x, foot, z), 0.22, STEEL));
    }
  }
  frame.push(rod(new THREE.Vector3(0, 0, -1.4), new THREE.Vector3(0, 0, 1.4), 0.4, 0x9aa3b5));
  object.add(solid(frame));

  const wheel = new THREE.Group();
  const spokes: THREE.BufferGeometry[] = [];
  for (const z of [-0.8, 0.8]) {
    spokes.push(part(new THREE.TorusGeometry(radius, 0.16, 6, 48), WHITE, [0, 0, z]));
    spokes.push(part(new THREE.TorusGeometry(radius * 0.55, 0.08, 6, 36), CANDY[0], [0, 0, z]));
    for (let k = 0; k < cars; k++) {
      const a = (k / cars) * Math.PI * 2;
      spokes.push(
        rod(
          new THREE.Vector3(0, 0, z),
          new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, z),
          0.07,
          STEEL,
        ),
      );
    }
  }
  wheel.add(solid(spokes));
  // Bulbs round the front rim, in turn colours.
  const bulbs = [bulbMaterial(0xfff1b8), bulbMaterial(0xffb3d9), bulbMaterial(0xb8f0ff)];
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2;
    const bulb = new THREE.Sprite(bulbs[k % bulbs.length]);
    bulb.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0.9);
    bulb.scale.setScalar(1.1);
    wheel.add(bulb);
  }
  object.add(wheel);

  // The cars: a seat under a striped canopy, each in its own colour, hung below its spoke's end.
  const carGeometry = (colour: number) =>
    solid([
      part(new THREE.CylinderGeometry(0.9, 0.7, 1, 8), colour, [0, -1.6, 0]),
      part(new THREE.ConeGeometry(1.1, 0.7, 8), stripes(8, WHITE, colour), [0, -0.6, 0]),
      part(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), STEEL, [0, -0.6, 0]),
    ]);
  const hanging = Array.from({ length: cars }, (_, k) => {
    const car = carGeometry(CANDY[k % CANDY.length] ?? WHITE);
    object.add(car);
    return car;
  });
  return {
    object,
    update: (seconds) => {
      const turn = seconds * 0.12;
      wheel.rotation.z = turn;
      hanging.forEach((car, k) => {
        const a = (k / cars) * Math.PI * 2 + turn;
        car.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        car.rotation.z = Math.sin(seconds * 0.8 + k) * 0.04;
      });
    },
  };
};

/**
 * A carousel: a round platform under a striped canopy, horses on brass poles going round and up
 * and down, and bulbs round the canopy's rim.
 */
const carousel = (): Prop => {
  const object = new THREE.Group();
  object.position.set(11, 0, -48);
  const base: THREE.BufferGeometry[] = [
    part(new THREE.CylinderGeometry(4.2, 4.4, 0.6, 24), stripes(24, 0xffd23f, RED), [0, 0.3, 0]),
    part(new THREE.CylinderGeometry(0.5, 0.5, 4.2, 10), 0xffe9a8, [0, 2.7, 0]),
  ];
  object.add(solid(base));
  const spinning = new THREE.Group();
  const canopy: THREE.BufferGeometry[] = [
    part(new THREE.ConeGeometry(5, 2, 24, 1), stripes(16, WHITE, RED), [0, 5.8, 0]),
    part(
      new THREE.CylinderGeometry(4.9, 4.9, 0.6, 24, 1, true),
      stripes(24, 0xffd23f, 0x3fc5ff),
      [0, 4.6, 0],
    ),
    part(new THREE.SphereGeometry(0.3, 8, 6), 0xffd23f, [0, 7, 0]),
  ];
  spinning.add(solid(canopy, PAINTED_THIN));
  const rim = new THREE.Group();
  const material = bulbMaterial(0xfff1b8);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const bulb = new THREE.Sprite(material);
    bulb.position.set(Math.cos(a) * 5, 4.3, Math.sin(a) * 5);
    bulb.scale.setScalar(0.6);
    rim.add(bulb);
  }
  spinning.add(rim);
  // A horse: a body, neck and head, legs out as if galloping, on a brass pole.
  const horse = (colour: number) =>
    solid([
      part(new THREE.CapsuleGeometry(0.32, 0.9, 3, 8), colour, [0, 0, 0], [0, 0, Math.PI / 2]),
      part(new THREE.CapsuleGeometry(0.16, 0.5, 3, 6), colour, [0.55, 0.42, 0], [0, 0, -0.6]),
      part(new THREE.BoxGeometry(0.5, 0.24, 0.24), colour, [0.85, 0.66, 0], [0, 0, -0.3]),
      part(new THREE.ConeGeometry(0.16, 0.6, 6), 0xffd23f, [-0.75, -0.05, 0], [0, 0, 2.2]),
      ...[-1, 1].flatMap((side) => [
        part(
          new THREE.CylinderGeometry(0.06, 0.05, 0.6, 5),
          colour,
          [0.4, -0.45, side * 0.15],
          [0, 0, 0.6],
        ),
        part(
          new THREE.CylinderGeometry(0.06, 0.05, 0.6, 5),
          colour,
          [-0.4, -0.45, side * 0.15],
          [0, 0, -0.6],
        ),
      ]),
      part(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 5), 0xe6b84a, [0, 0.9, 0]),
    ]);
  const horses = Array.from({ length: 8 }, (_, k) => {
    const h = horse([WHITE, CANDY[k % CANDY.length] ?? WHITE][k % 2] ?? WHITE);
    const a = (k / 8) * Math.PI * 2;
    h.position.set(Math.cos(a) * 3.2, 1.8, Math.sin(a) * 3.2);
    // Facing round the way it goes.
    h.rotation.y = -a + Math.PI;
    spinning.add(h);
    return h;
  });
  object.add(spinning);
  return {
    object,
    update: (seconds) => {
      spinning.rotation.y = seconds * 0.35;
      horses.forEach((h, k) => {
        h.position.y = 1.8 + Math.sin(seconds * 2.2 + k * 1.3) * 0.3;
      });
    },
  };
};

/** A helter-skelter: a tall striped tower with a yellow slide spiralling down round it. */
const helterSkelter = (): THREE.Object3D => {
  const height = 12;
  const parts: THREE.BufferGeometry[] = [
    part(
      turned(
        [
          [2, 0],
          [1.8, height * 0.5],
          [1.5, height],
        ],
        16,
        8,
      ),
      (p) => (Math.floor(p.y / 1.4) % 2 ? RED : WHITE),
    ),
    part(new THREE.ConeGeometry(2.2, 3, 16), stripes(12, RED, WHITE), [0, height + 1.5, 0]),
    part(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), 0x6b5a4a, [0, height + 3.6, 0]),
  ];
  const flag = new THREE.BufferGeometry();
  flag.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, -0.3, 0, 0, -0.6, 0], 3),
  );
  flag.setIndex([0, 1, 2]);
  flag.computeVertexNormals();
  parts.push(part(flag, CANDY[1], [0, height + 4.4, 0]));
  // The slide: a wide flat ribbon two and a half times round, from the top to the ground.
  const turns = 2.5;
  const steps = 60;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const y = height * 0.9 * (1 - t) + 0.3;
    const r = 1.6 + 0.4 * t;
    for (const out of [r + 0.1, r + 1.1])
      positions.push(Math.cos(a) * out, y + (out - r) * 0.15, Math.sin(a) * out);
  }
  for (let i = 0; i < steps; i++)
    index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  const slide = new THREE.BufferGeometry();
  slide.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  slide.setIndex(index);
  slide.computeVertexNormals();
  parts.push(part(slide, 0xffd23f));
  const object = solid(parts, PAINTED_THIN);
  object.position.set(-8, 0, -46);
  return object;
};

/** A striped tent: round walls under a pointed roof, with a pennant on top. */
const tent = (at: Vec3, radius: number, one: number, two: number): THREE.Object3D => {
  const height = radius * 1.1;
  const parts: THREE.BufferGeometry[] = [
    part(new THREE.CylinderGeometry(radius, radius, height, 16, 1), stripes(16, one, two), [
      0,
      height / 2,
      0,
    ]),
    part(new THREE.ConeGeometry(radius * 1.12, radius * 1.1, 16), stripes(16, one, two), [
      0,
      height + radius * 0.55,
      0,
    ]),
    part(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), 0x6b5a4a, [
      0,
      height + radius * 1.1 + 0.5,
      0,
    ]),
    // The way in, dark inside.
    part(new THREE.PlaneGeometry(radius * 0.6, height * 0.8), 0x2a1a24, [
      0,
      height * 0.4,
      radius + 0.02,
    ]),
  ];
  const flag = new THREE.BufferGeometry();
  flag.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0.8, -0.25, 0, 0, -0.5, 0], 3),
  );
  flag.setIndex([0, 1, 2]);
  flag.computeVertexNormals();
  parts.push(part(flag, one, [0, height + radius * 1.1 + 1.1, 0]));
  const object = solid(parts, PAINTED_THIN);
  object.position.set(...at);
  // Facing the pitch.
  object.rotation.y = Math.atan2(-at[0], -at[2]);
  return object;
};

// --- The trampolines ----------------------------------------------------------------------------

/** How far the trampolines are from the player, and how far apart, if the twist doesn't move them. */
const TRAMPOLINE = { z: -20.4, spacing: 0.94, radius: 0.4, height: 0.3 };

/**
 * A trampoline set into each lane out on the pitch: a padded rim on short legs round a dark mat.
 * The group's named "trampolines", and each one "trampoline-<lane>", with its mat named "mat", for
 * the twist to find, put in line with the balls and flex (see twists/funfair.ts). The mat is a
 * shallow bowl, flat until it's stretched down.
 */
export const trampolines = (): THREE.Object3D => {
  const group = new THREE.Group();
  group.name = "trampolines";
  const { radius, height } = TRAMPOLINE;
  const frame = solid([
    // Padding in turn colours round the rim.
    ...Array.from({ length: 6 }, (_, k) =>
      part(
        new THREE.TorusGeometry(radius, 0.06, 5, 6, Math.PI / 3),
        k % 2 ? 0x3fc5ff : 0xffd23f,
        [0, height, 0],
        [Math.PI / 2, 0, (k * Math.PI) / 3],
      ),
    ),
    ...Array.from({ length: 4 }, (_, k) => {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      return part(new THREE.CylinderGeometry(0.03, 0.03, height, 4), 0x30343c, [
        Math.cos(a) * radius * 0.9,
        height / 2,
        Math.sin(a) * radius * 0.9,
      ]);
    }),
  ]);
  const bowl = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, -1),
      new THREE.Vector2(radius * 0.5, -0.75),
      new THREE.Vector2(radius, 0),
    ],
    16,
  );
  for (const lane of [-1, 0, 1]) {
    const trampoline = new THREE.Group();
    trampoline.name = `trampoline-${lane}`;
    trampoline.position.set(lane * TRAMPOLINE.spacing, 0, TRAMPOLINE.z);
    const mat = solid([part(bowl.clone(), 0x1d2a4a)], PAINTED_THIN);
    mat.name = "mat";
    mat.position.y = height;
    mat.scale.y = 0.02;
    trampoline.add(frame.clone(), mat);
    group.add(trampoline);
  }
  bowl.dispose();
  return group;
};

// --- Everything ---------------------------------------------------------------------------------

/**
 * The fair round the pitch, for the venue's backdrop (see ../backdrop.ts): the rides, the tents,
 * the bunting and the lights. The trampolines out on the pitch are the twist's own.
 */
export const funfair = (): Prop => {
  const object = new THREE.Group();
  const wheel = ferrisWheel();
  const ride = carousel();
  object.add(wheel.object, ride.object, helterSkelter());
  const random = seeded(11);
  for (const [at, radius] of [
    [[-12.5, 0, -40], 2.6],
    [[7.5, 0, -40], 2.2],
    [[16, 0, -36], 3],
    [[-17, 0, -52], 3.2],
  ] as const) {
    const one = CANDY[Math.floor(random() * CANDY.length)] ?? RED;
    object.add(tent([...at], radius, one, WHITE));
  }
  // Bunting and lights strung between poles out to either side, clear of where things fly.
  const poles: Vec3[] = [
    [-5.5, 0, -36],
    [-11, 0, -34],
    [5.5, 0, -36],
    [11, 0, -34],
  ];
  const strings: THREE.BufferGeometry[] = poles.map(([x, , z]) =>
    part(new THREE.CylinderGeometry(0.08, 0.1, 8, 6), STEEL, [x, 4, z]),
  );
  strings.push(
    ...bunting([-5.5, 7.6, -36], [-11, 7.6, -34], 9, 0.8, 0.5),
    ...bunting([5.5, 7.6, -36], [11, 7.6, -34], 9, 0.8, 0.5),
  );
  object.add(solid(strings, PAINTED_THIN));
  object.add(
    lights([-5.5, 7.2, -36.1], [-11, 7.2, -34.1], 10, 0.9),
    lights([5.5, 7.2, -36.1], [11, 7.2, -34.1], 10, 0.9),
  );
  return {
    object,
    update: (seconds, dt) => {
      wheel.update(seconds, dt);
      ride.update(seconds, dt);
    },
  };
};
