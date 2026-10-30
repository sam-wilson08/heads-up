import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BACKDROP_Z } from "../backdrop";
import { glowTexture } from "../textures";
import { PAINTED_THIN, part, type Prop, seeded, solid, turned, type Vec3 } from "./shapes";

// The Haunted Castle: a ruined great hall open to the night sky, its far wall pierced by tall
// arched windows full of moonlight, with towers at its corners. Torches burn on the walls and
// candelabras stand either side of the pitch, suits of armour keep watch by the goal, ancestors
// glower from their portraits, cobwebs hang in the corners, bats wheel overhead and mist creeps
// along the floor. The hall's backdrop is a picture made for it (see ../backdrop.ts), its windows
// moonlit in it, which the lightning flashes with the rest of the backdrop; what moves is drawn live
// over it. The candles and torches are named for the twist, which snuffs them out (see
// twists/haunted.ts). Units are metres; the goal is down -Z, 30 m away.

const BACK = { z: -42, width: 26, height: 16 };
const SIDE = { x: 11, from: -10, height: 13 };
const STONE = { light: 0x6f6a72, dark: 0x3e3b44 };
const IRON = 0x24242a;

let stoneTexture: THREE.Texture | undefined;
let mistTexture: THREE.Texture | undefined;
let flameTexture: THREE.Texture | undefined;

/** Courses of rough-cut stone blocks, each its own shade, with dark mortar between. */
const stone = (): THREE.Texture => {
  if (stoneTexture) return stoneTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const random = seeded(21);
    ctx.fillStyle = "#26232a";
    ctx.fillRect(0, 0, size, size);
    const course = 32;
    for (let row = 0; row < size / course; row++) {
      const offset = row % 2 ? 32 : 0;
      for (let x = -offset; x < size; x += 64) {
        const shade = 150 + Math.round(random() * 60);
        ctx.fillStyle = `rgb(${shade}, ${shade - 6}, ${shade + 4})`;
        ctx.fillRect(x + 2, row * course + 2, 60, course - 4);
        // A darker chip or two, so no block's flat.
        ctx.fillStyle = `rgba(0, 0, 0, ${0.08 + random() * 0.12})`;
        ctx.fillRect(x + 4 + random() * 40, row * course + 4 + random() * 14, 12, 8);
      }
    }
  }
  stoneTexture = new THREE.CanvasTexture(canvas);
  stoneTexture.colorSpace = THREE.SRGBColorSpace;
  stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
  return stoneTexture;
};

/** Soft wisps of mist, thick along the bottom and thinning upwards, wrapping left to right. */
const mist = (): THREE.Texture => {
  if (mistTexture) return mistTexture;
  const width = 256;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = (x / width) * Math.PI * 2;
        const v = y / height;
        let n = 0.5;
        for (const [k, weight, phase] of [
          [1, 0.3, 0.4],
          [2, 0.2, 2.1],
          [3, 0.14, 4.4],
          [5, 0.08, 1.2],
        ] as const) {
          n += weight * Math.sin(k * a + phase + Math.sin(v * 5 + k)) * Math.cos(v * k * 4 + phase);
        }
        // Thick at the floor (the bottom of the picture), gone by the top.
        const low =
          THREE.MathUtils.smoothstep(v, 0.1, 0.95) * (1 - THREE.MathUtils.smoothstep(v, 0.96, 1));
        const grey = Math.round(255 * THREE.MathUtils.clamp(n * low, 0, 1));
        image.data.set([grey, grey, grey, 255], (y * width + x) * 4);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  mistTexture = new THREE.CanvasTexture(canvas);
  mistTexture.wrapS = THREE.RepeatWrapping;
  return mistTexture;
};

/** A wall of stone blocks, `width` by `height`, its texture repeating every 4 m. */
const wall = (width: number, height: number, material: THREE.Material) => {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (uv.getX(i) * width) / 4, (uv.getY(i) * height) / 4);
  return new THREE.Mesh(geometry, material);
};

/** Battlements along the top of a wall, `length` long, along X. */
const battlements = (length: number, y: number): THREE.BufferGeometry[] => {
  const parts: THREE.BufferGeometry[] = [
    part(new THREE.BoxGeometry(length, 0.8, 1), STONE.dark, [0, y, 0]),
  ];
  for (let x = -length / 2 + 0.6; x < length / 2; x += 2.2) {
    parts.push(part(new THREE.BoxGeometry(1.2, 1.2, 1), STONE.light, [x, y + 1, 0]));
  }
  return parts;
};

/** A round tower with a pointed slate roof, standing at a corner. */
const tower = (at: Vec3, height: number): THREE.BufferGeometry[] => [
  part(
    turned(
      [
        [3, 0],
        [2.8, height * 0.6],
        [2.7, height],
      ],
      12,
      6,
    ),
    (p) => (Math.floor(p.y / 1.2) % 2 ? STONE.light : 0x5f5a63),
    at,
  ),
  part(new THREE.ConeGeometry(3.3, 7, 12), 0x2a2838, [at[0], at[1] + height + 3.5, at[2]]),
];

/** A suit of armour, standing to attention with a halberd, about 2 m tall. */
const armour = (at: Vec3, turn: number): THREE.Object3D => {
  const steel = (p: THREE.Vector3) => (p.y > 1.2 && p.z > 0.1 ? 0xc9ced8 : 0x9aa1ae);
  const parts: THREE.BufferGeometry[] = [
    part(
      turned(
        [
          [0.22, 0.95],
          [0.3, 1.15],
          [0.34, 1.45],
          [0.26, 1.6],
          [0.12, 1.66],
        ],
        10,
        8,
      ),
      steel,
    ),
    part(new THREE.SphereGeometry(0.17, 10, 8), steel, [0, 1.82, 0]),
    part(new THREE.BoxGeometry(0.2, 0.025, 0.04), 0x111116, [0, 1.84, 0.16]),
    part(new THREE.ConeGeometry(0.05, 0.2, 6), 0xb32a2a, [0, 2.05, -0.02]),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      part(new THREE.CylinderGeometry(0.08, 0.07, 0.9, 6), steel, [side * 0.12, 0.5, 0]),
      part(new THREE.BoxGeometry(0.14, 0.08, 0.26), 0x7d8390, [side * 0.12, 0.04, 0.05]),
      part(new THREE.SphereGeometry(0.11, 8, 6), steel, [side * 0.36, 1.55, 0]),
      part(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6), steel, [side * 0.4, 1.2, 0.04]),
    );
  }
  // The halberd: a tall pole with an axe head, held at its side.
  parts.push(
    part(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 5), 0x5a4030, [0.42, 1.3, 0.12]),
    part(new THREE.ConeGeometry(0.05, 0.3, 4), 0xc9ced8, [0.42, 2.75, 0.12]),
    part(new THREE.BoxGeometry(0.03, 0.26, 0.28), 0xc9ced8, [0.42, 2.45, 0.24]),
  );
  const object = solid(parts);
  object.position.set(...at);
  object.rotation.y = turn;
  object.scale.setScalar(1.3);
  return object;
};

/** A dark ancestor glowering out of a gilt frame, painted on a canvas once for every portrait. */
const portrait = (at: Vec3, width: number, height: number, seed: number): THREE.Object3D => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const random = seeded(seed);
    const background = ctx.createLinearGradient(0, 0, 0, 96);
    background.addColorStop(0, "#2a1a14");
    background.addColorStop(1, "#120a08");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 64, 96);
    // Dark clothes, a pale face and eyes that follow you round the room.
    ctx.fillStyle = ["#3a1420", "#14243a", "#1e2a14"][Math.floor(random() * 3)] ?? "#3a1420";
    ctx.beginPath();
    ctx.ellipse(32, 92, 30, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9b79a";
    ctx.beginPath();
    ctx.ellipse(32, 40, 13, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8e2c8";
    ctx.fillRect(25, 37, 5, 3);
    ctx.fillRect(34, 37, 5, 3);
    ctx.fillStyle = "#111";
    ctx.fillRect(27, 37, 2, 3);
    ctx.fillRect(36, 37, 2, 3);
    ctx.fillStyle = "#5a2a1e";
    ctx.fillRect(28, 50, 8, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 }),
  );
  painting.position.z = 0.07;
  const group = new THREE.Group();
  group.add(
    solid([part(new THREE.BoxGeometry(width + 0.4, height + 0.4, 0.12), 0xb8862e)]),
    painting,
  );
  group.position.set(...at);
  return group;
};

/** A cobweb in a corner: threads fanning out from it, and rings of silk across them. */
const cobweb = (at: Vec3, size: number, turn: number): THREE.Object3D => {
  const points: number[] = [];
  const spokes = 6;
  const angle = (k: number) => (k / (spokes - 1)) * (Math.PI / 2);
  for (let k = 0; k < spokes; k++) {
    points.push(0, 0, 0, Math.cos(angle(k)) * size, -Math.sin(angle(k)) * size, 0);
  }
  for (const r of [0.3, 0.55, 0.8]) {
    for (let k = 0; k < spokes - 1; k++) {
      // Sagging a little between the threads.
      const sag = 0.9;
      points.push(
        Math.cos(angle(k)) * size * r,
        -Math.sin(angle(k)) * size * r,
        0,
        Math.cos(angle(k + 1)) * size * r * sag,
        -Math.sin(angle(k + 1)) * size * r * sag,
        0,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const web = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xdad8e6, transparent: true, opacity: 0.55 }),
  );
  web.position.set(...at);
  web.rotation.z = turn;
  return web;
};

/** A candle flame, glowing, for the candles and torches. One material, for the twist to dim. */
const flames = () => {
  flameTexture ??= glowTexture();
  return new THREE.SpriteMaterial({
    map: flameTexture,
    color: 0xffb04a,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
};

/** A candelabra on a tall iron stand: three arms, each with a candle. Returns it, and its flames' places. */
const candelabra = (at: Vec3): { object: THREE.Object3D; flames: THREE.Vector3[] } => {
  const parts: THREE.BufferGeometry[] = [
    part(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), IRON, [0, 1.1, 0]),
    part(new THREE.CylinderGeometry(0.35, 0.4, 0.08, 8), IRON, [0, 0.04, 0]),
    part(new THREE.TorusGeometry(0.4, 0.035, 4, 12, Math.PI), IRON, [0, 2.2, 0], [0, 0, Math.PI]),
  ];
  const places: THREE.Vector3[] = [];
  for (const x of [-0.4, 0, 0.4]) {
    const y = x === 0 ? 2.25 : 2.2;
    parts.push(
      part(new THREE.CylinderGeometry(0.08, 0.06, 0.08, 6), IRON, [x, y, 0]),
      part(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 6), 0xf2ead2, [x, y + 0.22, 0]),
    );
    places.push(new THREE.Vector3(at[0] + x, at[1] + y + 0.48, at[2]));
  }
  const object = solid(parts);
  object.position.set(...at);
  return { object, flames: places };
};

/** A torch in an iron bracket on a wall. Its flame is half a metre up and 40 cm out from it. */
const torch = (at: Vec3): THREE.Object3D => {
  const object = solid([
    part(new THREE.CylinderGeometry(0.07, 0.05, 0.7, 6), 0x5a4030, [0, 0, 0.25], [0.4, 0, 0]),
    part(new THREE.BoxGeometry(0.14, 0.3, 0.06), IRON, [0, -0.15, 0.03]),
  ]);
  object.position.set(...at);
  return object;
};

/** A bat: a dark body and two wings that flap, each wing hinged at the body. */
const bat = () => {
  const object = new THREE.Group();
  object.add(
    solid([
      part(new THREE.SphereGeometry(0.18, 6, 5), 0x15121a, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.4]),
    ]),
  );
  const wingShape = new THREE.BufferGeometry();
  wingShape.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0.12, 0.9, 0.1, 0, 0.7, 0, -0.1, 0.4, -0.05, -0.2, 0, 0, -0.15],
      3,
    ),
  );
  wingShape.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
  wingShape.computeVertexNormals();
  const wings = [-1, 1].map((side) => {
    const wing = solid(
      [part(wingShape.clone(), 0x221c2a, [0, 0, 0], [0, 0, 0], [side, 1, 1])],
      PAINTED_THIN,
    );
    object.add(wing);
    return { wing, side };
  });
  wingShape.dispose();
  return {
    object,
    flap: (t: number) => {
      for (const { wing, side } of wings) wing.rotation.z = side * Math.sin(t) * 0.8;
    },
  };
};

/** Where the torches are on the far wall, and the candelabras either side of the pitch. */
const TORCHES: readonly Vec3[] = [
  [-3.5, 4.5, BACK.z + 1.25],
  [3.5, 4.5, BACK.z + 1.25],
  [-10.5, 4.5, BACK.z + 1.25],
  [10.5, 4.5, BACK.z + 1.25],
];
/**
 * Where the backdrop picture's torches are on its card, in metres across and up, and how big each
 * one's flame is: three up each side wall, smaller as the walls run away. Only a screen wider than a
 * phone's sees them.
 */
const PICTURED_TORCHES = [
  { x: -15.8, y: 9, size: 1.1 },
  { x: -10.2, y: 7, size: 0.7 },
  { x: -8.5, y: 6.3, size: 0.5 },
  { x: 8.4, y: 6.3, size: 0.5 },
  { x: 10.2, y: 7, size: 0.7 },
  { x: 15.8, y: 9, size: 1.1 },
] as const;
/** Just outside the lanes and either side of the goal, where they're on even a phone's screen. */
const CANDELABRAS: readonly Vec3[] = [
  [-3.2, 0, -20],
  [3.2, 0, -20],
  [-5, 0, -30.5],
  [5, 0, -30.5],
];

/**
 * The hall, for its backdrop (see ../backdrop.ts): its walls and towers, the torches' brackets on
 * the far wall, the suits of armour, the portraits and the cobwebs up in its corners. The windows
 * aren't in it: they're drawn live, for the lightning (see castleLive).
 */
export const castleHall = (): THREE.Object3D => {
  const object = new THREE.Group();
  const masonry = new THREE.MeshStandardMaterial({
    map: stone(),
    color: 0xb8b2c0,
    roughness: 0.95,
  });

  // The far wall, and the side walls.
  const back = wall(BACK.width, BACK.height, masonry);
  back.position.set(0, BACK.height / 2, BACK.z);
  object.add(back);
  for (const side of [-1, 1]) {
    const length = BACK.z - SIDE.from;
    const sideWall = wall(-length, SIDE.height, masonry);
    sideWall.position.set(side * SIDE.x, SIDE.height / 2, (BACK.z + SIDE.from) / 2);
    sideWall.rotation.y = -side * (Math.PI / 2);
    object.add(sideWall);
  }

  // Buttresses between the windows, battlements along the top and a tower at each far corner.
  const masonryParts: THREE.BufferGeometry[] = [
    ...[-10.5, -3.5, 3.5, 10.5].map((x) =>
      part(new THREE.BoxGeometry(1.2, BACK.height, 1.2), STONE.dark, [
        x,
        BACK.height / 2,
        BACK.z + 0.6,
      ]),
    ),
    ...battlements(BACK.width, BACK.height).map((g) => g.translate(0, 0, BACK.z)),
    ...tower([-13.5, 0, BACK.z - 1], 22),
    ...tower([13.5, 0, BACK.z - 1], 20),
  ];
  for (const side of [-1, 1]) {
    for (const g of battlements(-BACK.z + SIDE.from, SIDE.height)) {
      masonryParts.push(
        g.rotateY(Math.PI / 2).translate(side * SIDE.x, 0, (BACK.z + SIDE.from) / 2),
      );
    }
  }
  object.add(solid(masonryParts));

  object.add(
    ...TORCHES.map((at) => torch(at)),
    armour([-6, 0, -37], 0.4),
    armour([6, 0, -37], -0.4),
    armour([-9.5, 0, -34], 0.6),
    armour([9.5, 0, -34], -0.6),
    portrait([-10.5, 8.5, BACK.z + 1.25], 1.4, 2, 1),
    portrait([10.5, 8.5, BACK.z + 1.25], 1.4, 2, 2),
    portrait([-3.5, 9, BACK.z + 1.25], 1.2, 1.7, 3),
    portrait([3.5, 9, BACK.z + 1.25], 1.2, 1.7, 4),
    cobweb([-SIDE.x + 0.1, SIDE.height - 0.2, BACK.z + 0.1], 3, 0),
    cobweb([SIDE.x - 0.1, SIDE.height - 0.2, BACK.z + 0.1], 3, -Math.PI / 2),
  );
  return object;
};

/** How many banks of mist creep along the floor, and how far in front of the player each is. */
const MIST = [-9, -19, -30];

/**
 * What moves in the hall, drawn live over its backdrop: the flames on the torches and the
 * candelabras by the pitch, which the twist snuffs out, the cobwebs in the goal, the bats and the
 * mist.
 */
export const castleLive = (): Prop => {
  const object = new THREE.Group();

  // Flames on the torches and the candelabras, and the candelabras themselves.
  const candles = new THREE.Group();
  candles.name = "candles";
  const flame = flames();
  const lit = [
    // The torches' own brackets are on the side walls, in the backdrop's picture.
    ...PICTURED_TORCHES.map(({ x, y, size }) => ({
      holder: undefined,
      flames: [new THREE.Vector3(x, y, BACKDROP_Z + 0.3)],
      size,
    })),
    ...CANDELABRAS.map((at) => {
      const made = candelabra(at);
      return { holder: made.object, flames: made.flames, size: 0.55 };
    }),
  ];
  const sprites = lit.flatMap(({ holder, flames: places, size }) => {
    if (holder) object.add(holder);
    return places.map((at, k) => {
      const sprite = new THREE.Sprite(flame);
      sprite.name = "flame";
      sprite.position.copy(at);
      sprite.userData.phase = k * 1.7 + at.x;
      sprite.userData.size = size;
      candles.add(sprite);
      return sprite;
    });
  });
  object.add(candles);

  // In the top corners of the goal, as if nobody's scored here in years.
  object.add(cobweb([-3.6, 2.4, -30], 0.9, 0), cobweb([3.6, 2.4, -30], 0.9, -Math.PI / 2));

  // Bats, wheeling high over the far end.
  const bats = Array.from({ length: 7 }, (_, k) => {
    const b = bat();
    object.add(b.object);
    return { ...b, k };
  });

  // Mist creeping along the floor, in banks that drift across, all one shape: each bank's drift is
  // where its strip of the picture is read from.
  const texture = mist();
  texture.wrapS = THREE.RepeatWrapping;
  const banks = MIST.map((z) => new THREE.PlaneGeometry(40, 2.2).translate(0, 1.0, z));
  const sheet = mergeGeometries(banks);
  for (const bank of banks) bank.dispose();
  const uv = sheet.getAttribute("uv");
  const flat = Float32Array.from(uv.array);
  const fog = new THREE.Mesh(
    sheet,
    new THREE.MeshBasicMaterial({
      color: 0xb8c2e0,
      alphaMap: texture,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  );
  object.add(fog);

  return {
    object,
    update: (seconds) => {
      for (const sprite of sprites) {
        const phase = sprite.userData.phase as number;
        const size = sprite.userData.size as number;
        const flicker =
          1 + Math.sin(seconds * 13 + phase) * 0.08 + Math.sin(seconds * 23 + phase * 2) * 0.05;
        sprite.scale.set(size * flicker, size * 1.4 * flicker, 1);
      }
      for (const { object: b, flap, k } of bats) {
        const a = seconds * (0.5 + k * 0.05) + k * 0.9;
        b.position.set(
          Math.sin(a) * (6 + k),
          10 + k * 0.7 + Math.sin(a * 2.3) * 0.8,
          -37 + Math.cos(a) * 3,
        );
        b.rotation.y = -a;
        flap(seconds * 14 + k);
      }
      // Each bank's picture stretched across it and drifting its own way.
      MIST.forEach((_, i) => {
        const repeat = 1.5 + i * 0.4;
        const offset = seconds * (i % 2 ? 1 : -1) * (0.006 + i * 0.002);
        for (let k = i * 4; k < i * 4 + 4; k++) {
          uv.setX(k, (flat[k * 2] ?? 0) * repeat + offset);
        }
      });
      uv.needsUpdate = true;
    },
  };
};
