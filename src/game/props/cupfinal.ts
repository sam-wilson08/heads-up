import * as THREE from "three";
import { glowTexture } from "../textures";
import { part, type Prop, seeded, solid, type Vec3 } from "./shapes";
import { crowdTexture, PER_ROW, ROWS, SEAT } from "./stands";

// The Cup Final: the biggest night of the season, in a packed bowl of a stadium. Two tiers of fans
// rise round the far end, one end in red and white and the other in blue and yellow, under a ring
// of floodlights. Banners hang from the upper tier, flares burn red in the stands, ticker tape
// drifts down behind the goal, and the trophy waits on its plinth beside it. No real clubs, badges
// or sponsors. The stadium's painted into the venue's backdrop (see ../backdrop.ts); what moves is
// drawn live over it. Units are metres; the goal is down -Z, 30 m away.

/** Where the bowl's centred, and how far round it goes either way from straight ahead. */
const BOWL = { centre: new THREE.Vector3(0, 0, -6), reach: THREE.MathUtils.degToRad(105) };
/** Each tier, as its front edge and back edge: distance from the bowl's centre, and height. */
const TIERS = [
  { front: [33, 1.2], back: [52, 13] },
  { front: [54, 15], back: [72, 29] },
] as const;
const ENDS = {
  home: ["#d8202f", "#f4f1ea", "#b0101e"],
  away: ["#2b6fe0", "#ffd23f", "#1d4fb0"],
} as const;

/** A point on the bowl, `angle` round from straight ahead, `distance` out and `height` up. */
const onBowl = (angle: number, distance: number, height: number) =>
  new THREE.Vector3(
    BOWL.centre.x + Math.sin(angle) * distance,
    height,
    BOWL.centre.z - Math.cos(angle) * distance,
  );

/**
 * A tier of seats: a sloping band round the bowl, from `from` to `to` radians round it, with a
 * crowd's picture rowed along it, a row of the picture to each row of seats.
 */
const tier = (
  front: readonly [number, number],
  back: readonly [number, number],
  material: THREE.Material,
  from: number,
  to: number,
) => {
  const segments = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const slope = Math.hypot(back[0] - front[0], back[1] - front[1]);
  const rows = slope / Math.hypot(SEAT.depth, SEAT.rise);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = from + t * (to - from);
    for (const [[distance, height], v] of [
      [front, 0],
      [back, 1],
    ] as const) {
      const p = onBowl(angle, distance, height);
      positions.push(p.x, p.y, p.z);
      // Seats along the front edge, which is shorter than the back, so the back's seats are wider.
      uvs.push((t * (to - from) * front[0]) / (SEAT.width * PER_ROW), (v * rows) / ROWS);
    }
  }
  for (let i = 0; i < segments; i++)
    index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
};

/** A wall round the bowl, from `from` to `to` high at `distance` out: the tiers' fronts and the roof's edge. */
const band = (distance: number, from: number, to: number, colour: number) => {
  const segments = 40;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = -BOWL.reach + (i / segments) * BOWL.reach * 2;
    for (const height of [from, to]) {
      const p = onBowl(angle, distance, height);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < segments; i++)
    index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return part(geometry, colour);
};

/** A banner: a canvas painted by `draw`, hung `width` by `height` facing the pitch. */
const banner = (
  at: THREE.Vector3,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * 24);
  canvas.height = Math.round(height * 24);
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, side: THREE.DoubleSide }),
  );
  mesh.position.copy(at);
  mesh.lookAt(BOWL.centre.x, at.y, BOWL.centre.z);
  return mesh;
};

/** Stripes down a banner in turn colours, with a white star in the middle. */
const striped =
  (colours: readonly string[]) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const stripe = w / colours.length;
    colours.forEach((colour, i) => {
      ctx.fillStyle = colour;
      ctx.fillRect(i * stripe, 0, stripe + 1, h);
    });
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = (i % 2 ? 0.2 : 0.45) * w * 0.5;
      ctx.lineTo(w / 2 + Math.cos(angle) * r, h * 0.35 + Math.sin(angle) * r);
    }
    ctx.fill();
  };

/** The trophy: a big two-handled cup in gold on a draped plinth, with ribbons in both ends' colours. */
const trophy = (at: Vec3): THREE.Object3D => {
  // Polished gold, reflecting the floodlit bowl round it.
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 1, roughness: 0.22 });
  const cup = new THREE.Group();
  const outline = [
    [0.3, 0],
    [0.3, 0.08],
    [0.16, 0.14],
    [0.08, 0.4],
    [0.1, 0.5],
    [0.3, 0.62],
    [0.4, 0.9],
    [0.42, 1.15],
    [0.38, 1.18],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  cup.add(new THREE.Mesh(new THREE.LatheGeometry(outline, 20), gold));
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 12, Math.PI * 1.2), gold);
    handle.position.set(side * 0.42, 0.9, 0);
    handle.rotation.z = side > 0 ? -Math.PI * 0.6 : Math.PI * 1.6;
    cup.add(handle);
  }
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), gold);
  lid.position.y = 1.3;
  cup.add(lid);
  cup.position.y = 1.1;
  const plinth = solid([
    part(new THREE.BoxGeometry(1, 1.1, 1), 0x13204a, [0, 0.55, 0]),
    part(new THREE.BoxGeometry(1.06, 0.08, 1.06), 0xe0ac3a, [0, 1.1, 0]),
    part(new THREE.BoxGeometry(1.04, 0.06, 1.04), 0xe0ac3a, [0, 0.05, 0]),
    // Ribbons from the handles, one each end's colour.
    part(new THREE.BoxGeometry(0.06, 0.5, 0.02), 0xd8202f, [-0.5, 1.75, 0.02], [0, 0, 0.2]),
    part(new THREE.BoxGeometry(0.06, 0.5, 0.02), 0x2b6fe0, [0.5, 1.75, 0.02], [0, 0, -0.2]),
  ]);
  const object = new THREE.Group();
  object.add(plinth, cup);
  object.position.set(...at);
  object.scale.setScalar(1.15);
  return object;
};

let glow: THREE.Texture | undefined;
let puffTexture: THREE.Texture | undefined;

/** A soft puff of smoke, for the flares. */
const puff = (): THREE.Texture => {
  if (puffTexture) return puffTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const random = seeded(5);
    for (let i = 0; i < 7; i++) {
      const x = size / 2 + (random() - 0.5) * size * 0.35;
      const y = size / 2 + (random() - 0.5) * size * 0.3;
      const r = size * (0.2 + random() * 0.15);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.6)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
  }
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
};

/** Where flares burn in the stands, as an angle round the bowl and a place on a tier. */
const STAND_FLARES = [
  [-0.75, 40, 5.5],
  [-0.4, 46, 9],
  [0.35, 44, 8],
  [0.8, 38, 4],
  [-0.15, 62, 21],
  [0.55, 66, 24],
] as const;
const TAPE = 260;

/**
 * The stadium, for the venue's backdrop (see ../backdrop.ts): its two tiers of fans, the
 * floodlights round its roof, and the banners.
 */
export const cupFinalStands = (): THREE.Object3D => {
  const object = new THREE.Group();
  // Each end of the ground in its own colours, home on the left and away on the right.
  const [home, away] = [
    { colours: ENDS.home, seats: "#8a1420", seed: 21 },
    { colours: ENDS.away, seats: "#123a8a", seed: 22 },
  ].map(
    (fans) =>
      new THREE.MeshStandardMaterial({
        map: crowdTexture({ ...fans, full: 0.97 }),
        // Under the roofs' shadow, so as not to compete with what's thrown in front.
        color: new THREE.Color(0.62, 0.62, 0.62),
        roughness: 0.92,
      }),
  );
  for (const { front, back } of TIERS) {
    object.add(
      tier(front, back, home ?? new THREE.MeshStandardMaterial(), -BOWL.reach, 0),
      tier(front, back, away ?? new THREE.MeshStandardMaterial(), 0, BOWL.reach),
    );
  }
  object.add(
    solid([
      // The front walls of the tiers, and the roof's edge over the top.
      band(33, 0, 1.2, 0x23293a),
      band(54, 13, 15, 0x23293a),
      band(72, 29, 33, 0xd9dde6),
    ]),
  );

  // Floodlights all round the roof's edge.
  glow ??= glowTexture();
  const lamp = new THREE.SpriteMaterial({
    map: glow,
    color: 0xf2f6ff,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i <= 30; i++) {
    const angle = -BOWL.reach + (i / 30) * BOWL.reach * 2;
    const sprite = new THREE.Sprite(lamp);
    sprite.position.copy(onBowl(angle, 71, 33.5));
    sprite.scale.setScalar(5);
    object.add(sprite);
  }

  // Banners hanging from the upper tier, and one across the front of the lower tier behind the goal.
  for (const [angle, colours] of [
    [-0.55, ["#d8202f", "#f4f1ea", "#d8202f"]],
    [-0.28, ["#f4f1ea", "#d8202f", "#f4f1ea"]],
    [0.28, ["#2b6fe0", "#ffd23f", "#2b6fe0"]],
    [0.55, ["#ffd23f", "#2b6fe0", "#ffd23f"]],
  ] as const) {
    object.add(banner(onBowl(angle, 53.6, 9.5), 3.2, 7, striped(colours)));
  }
  object.add(
    banner(onBowl(0, 32.8, 3.4), 18, 2.6, (ctx, w, h) => {
      ctx.fillStyle = "#13204a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e0ac3a";
      ctx.fillRect(0, h * 0.08, w, h * 0.05);
      ctx.fillRect(0, h * 0.87, w, h * 0.05);
      ctx.font = `800 ${Math.round(h * 0.55)}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★ CUP FINAL ★", w / 2, h * 0.53);
    }),
  );

  return object;
};

/**
 * What moves in the stadium, drawn live over its backdrop: the flares burning in the stands, the
 * ticker tape coming down, and the trophy by the goal, which stands in front of the backdrop.
 */
export const cupFinalLive = (): Prop => {
  const object = new THREE.Group();
  glow ??= glowTexture();
  object.add(trophy([-5.8, 0, -31]));

  // Flares burning in the stands, each throwing up red smoke.
  const smoke = puff();
  const flares = STAND_FLARES.map(([angle, distance, height], k) => {
    const at = onBowl(angle, distance, height);
    const light = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow ?? null,
        color: 0xff3a2a,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    light.position.copy(at);
    light.scale.setScalar(3);
    object.add(light);
    // Two puffs of smoke each, swelling as they rise: enough to read as smoke, and few to draw.
    const puffs = Array.from({ length: 2 }, () => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: smoke, color: 0xc0383a, depthWrite: false, opacity: 0 }),
      );
      object.add(sprite);
      return sprite;
    });
    return { at, light, puffs, phase: k * 1.37 };
  });

  // Ticker tape, drifting down over the far end in the two ends' colours, gold and silver.
  const positions = new Float32Array(TAPE * 3);
  const colours = new Float32Array(TAPE * 3);
  const random = seeded(19);
  const palette = [0xd8202f, 0xf4f1ea, 0x2b6fe0, 0xffd23f, 0xe0ac3a, 0xc8ccd6].map(
    (c) => new THREE.Color(c),
  );
  for (let i = 0; i < TAPE; i++) {
    positions.set([(random() - 0.5) * 30, random() * 14, -31 - random() * 22], i * 3);
    (palette[i % palette.length] ?? new THREE.Color()).toArray(colours, i * 3);
  }
  const tapeGeometry = new THREE.BufferGeometry();
  const tapePositions = new THREE.BufferAttribute(positions, 3);
  tapeGeometry.setAttribute("position", tapePositions);
  tapeGeometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const tape = new THREE.Points(
    tapeGeometry,
    new THREE.PointsMaterial({ size: 0.22, vertexColors: true }),
  );
  object.add(tape);
  const from = Float32Array.from(positions);

  return {
    object,
    update: (seconds) => {
      for (let i = 0; i < TAPE; i++) {
        const fall = (seconds * (0.6 + (i % 7) * 0.08) + (from[i * 3 + 1] ?? 0)) % 14;
        positions[i * 3] = (from[i * 3] ?? 0) + Math.sin(seconds * 1.3 + i) * 0.4;
        positions[i * 3 + 1] = 14 - fall;
      }
      tapePositions.needsUpdate = true;
      for (const { at, light, puffs, phase } of flares) {
        light.material.opacity =
          0.75 + Math.sin(seconds * 17 + phase) * 0.15 + Math.sin(seconds * 29 + phase) * 0.1;
        puffs.forEach((sprite, k) => {
          const age = (seconds / 3 + k / puffs.length + phase) % 1;
          sprite.position.set(at.x + age * 2.5, at.y + 0.5 + age * 7, at.z + age * 1.5);
          sprite.scale.setScalar(2 + age * 6);
          sprite.material.opacity = Math.sin(Math.PI * age) * 0.55;
        });
      }
    },
  };
};
