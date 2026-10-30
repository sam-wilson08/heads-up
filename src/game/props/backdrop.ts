import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { glowTexture } from "../textures";
import { seeded } from "./shapes";

// What stands far off round a venue, beyond where anything's thrown: lines of trees, ranges of
// hills and mountains, the netting behind a park pitch's goal, the stars and the sea. They're
// painted into the venues' backdrops by tools/venues/backdrops.html (see ../backdrop.ts), and the
// game itself never builds them. The trees and hills are too far off to model in the round, so
// each is a picture painted on a canvas, as a painter would, lit from the side the venue's sun is
// on, on flat cards facing the pitch. Cards that share a picture are merged, so a whole line of
// trees is one draw call. The haze fades them as it fades the ground in front of them. Units are
// metres; the goal is down -Z, 30 m away.

/** A canvas `width` by `height`, drawn on by `draw`, as a colour texture. */
const painted = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

// --- Trees ----------------------------------------------------------------------------------

/**
 * The kinds of tree: summer broadleaves, tall poplars, bushes for the undergrowth beneath them,
 * pines, and pines laden with snow.
 */
export type TreeKind = "broadleaf" | "poplar" | "bush" | "pine" | "snowyPine";
const KINDS: readonly TreeKind[] = ["broadleaf", "poplar", "bush", "pine", "snowyPine"];

/** Each tree's picture is one cell of a sheet, side by side. */
const CELL = { width: 128, height: 256 };
/**
 * How much finer the trees are worked out than they're painted: they're designed on a cell twice
 * the size, and painted every other point of it, which is plenty for trees this far off.
 */
const FINE = 2;

const FOLIAGE: Record<TreeKind, { light: string; mid: string; dark: string }> = {
  broadleaf: { light: "#a9c46e", mid: "#56763a", dark: "#1a2e17" },
  poplar: { light: "#b0c873", mid: "#5c7e3c", dark: "#1d3219" },
  bush: { light: "#9cbb62", mid: "#4f7034", dark: "#172a15" },
  pine: { light: "#6d8f58", mid: "#2f4c32", dark: "#0f2016" },
  snowyPine: { light: "#5f8458", mid: "#2a4632", dark: "#0d1d15" },
};

/** Smooth noise from 0 to 1 over a cell's pixels, varying over about `scale` pixels. */
const leafNoise = (seed: number) => {
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (x: number, y: number) => {
    const [ix, iy] = [Math.floor(x), Math.floor(y)];
    const [fx, fy] = [x - ix, y - iy];
    const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
    const [a, b, c, d] = [hash(ix, iy), hash(ix + 1, iy), hash(ix, iy + 1), hash(ix + 1, iy + 1)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  return (x: number, y: number, scale: number) =>
    smooth(x / scale, y / scale) * 0.6 + smooth((x * 2.1) / scale, (y * 2.1) / scale) * 0.4;
};

/** The light on a tree's leaves, from the upper right and a little in front, as a unit vector. */
const LIGHT = new THREE.Vector3(0.55, 0.6, 0.58).normalize();

/**
 * One tree's picture, filling its cell from its foot at the bottom, painted pixel by pixel into
 * `image` at `left`. A broadleaf's crown is heaped from rounded masses of leaves, each shaded as a
 * ball lit from the upper right, darkening into the gaps between them, with the leaves' own
 * flicker of light and dark over it and its edge frayed into sky. Its trunk shows beneath. A pine
 * is tiers of drooping boughs, lit on the right, and a snowy one has snow lying along each.
 */
const paintTree = (image: ImageData, left: number, kind: TreeKind, seed: number) => {
  const [w, h] = [CELL.width * FINE, CELL.height * FINE];
  const random = seeded(seed);
  const noise = leafNoise(seed);
  const leaves = FOLIAGE[kind];
  const dark = new THREE.Color(leaves.dark);
  const mid = new THREE.Color(leaves.mid);
  const light = new THREE.Color(leaves.light);
  const colour = new THREE.Color();
  const bark = new THREE.Color("#3e3226");
  const snow = new THREE.Color("#f1f5fb");
  const snowShade = new THREE.Color("#9fb0c8");
  const shade = (t: number) =>
    t < 0.5 ? colour.copy(dark).lerp(mid, t * 2) : colour.copy(mid).lerp(light, t * 2 - 1);
  const put = (x: number, y: number, c: THREE.Color, alpha: number) => {
    const i = ((y / FINE) * image.width + left + x / FINE) * 4;
    image.data[i] = Math.round(c.r * 255);
    image.data[i + 1] = Math.round(c.g * 255);
    image.data[i + 2] = Math.round(c.b * 255);
    image.data[i + 3] = Math.round(alpha * 255);
  };
  const normal = new THREE.Vector3();

  if (kind === "pine" || kind === "snowyPine") {
    const tiers = 10;
    for (let y = 0; y < h; y += FINE) {
      for (let x = 0; x < w; x += FINE) {
        const u = x / w - 0.5;
        const v = y / h;
        // The trunk, at the foot.
        let alpha = 0;
        let lit = 0;
        let snowy = 0;
        if (Math.abs(u) < 0.02 && v > 0.86) {
          put(x, y, bark, 1);
          continue;
        }
        for (let t = 0; t < tiers; t++) {
          const k = t / (tiers - 1);
          const top = 0.04 + k * 0.8;
          const bottom = top + 0.11 + k * 0.02;
          if (v < top || v > bottom + 0.03) continue;
          const half = (0.06 + k * 0.38) * ((v - top) / (bottom - top)) ** 0.8;
          const ragged = (noise(x, y * 0.6, 5) - 0.5) * 0.05;
          if (Math.abs(u) > half + ragged || v > bottom + ragged * 0.6) continue;
          alpha = 1;
          // Lit on the right, and darker underneath each tier.
          lit = THREE.MathUtils.clamp(
            0.42 + (u / Math.max(half, 0.01)) * 0.28 - ((v - top) / (bottom - top)) * 0.25,
            0,
            1,
          );
          lit += (noise(x, y, 2.2) - 0.5) * 0.35;
          // Snow along the top of each tier's boughs.
          if (kind === "snowyPine") {
            const depth = v - top - Math.abs(u) * 0.24;
            snowy = depth < 0.028 + noise(x, y, 4) * 0.02 ? 1 : 0;
          }
        }
        if (alpha === 0) continue;
        if (snowy)
          put(x, y, colour.copy(snowShade).lerp(snow, THREE.MathUtils.clamp(lit + 0.35, 0, 1)), 1);
        else put(x, y, shade(THREE.MathUtils.clamp(lit, 0, 1)), 1);
      }
    }
    return;
  }

  // The masses of leaves the crown is heaped from: a broadleaf's a wide dome, a poplar's a tall
  // flame, a bush's a mound down to the ground.
  const crown =
    kind === "poplar"
      ? { x: 0.5, y: 0.44, rx: 0.2, ry: 0.4, masses: 16 }
      : kind === "bush"
        ? { x: 0.5, y: 0.68, rx: 0.44, ry: 0.3, masses: 12 }
        : { x: 0.5, y: 0.42, rx: 0.42, ry: 0.36, masses: 22 };
  const masses = Array.from({ length: crown.masses }, () => {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 0.78;
    return {
      x: (crown.x + Math.cos(a) * r * crown.rx) * w,
      y: (crown.y + Math.sin(a) * r * crown.ry) * h,
      r: w * (kind === "poplar" ? 0.1 + random() * 0.06 : 0.12 + random() * 0.09),
    };
  });
  // The trunk and the lower branches, behind the leaves.
  const trunkFrom = kind === "bush" ? 2 : crown.y + crown.ry * 0.6;
  for (let y = 0; y < h; y += FINE) {
    for (let x = 0; x < w; x += FINE) {
      const u = x / w - 0.5;
      const v = y / h;
      // Which mass of leaves this pixel's in, nearest its middle, and how far in.
      let best = -Infinity;
      let mass = masses[0];
      for (const m of masses) {
        const inside = 1 - Math.hypot(x - m.x, y - m.y) / m.r;
        if (inside > best) [best, mass] = [inside, m];
      }
      const fray = (noise(x, y, 6) - 0.5) * 0.4 + (noise(x, y, 2.6) - 0.5) * 0.22;
      const covered = best + fray;
      if (covered > 0.02 && mass) {
        // Shaded as a ball of leaves, lit from the upper right, darker into the gaps.
        const nx = (x - mass.x) / mass.r;
        const ny = -(y - mass.y) / mass.r;
        normal.set(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))).normalize();
        const diffuse = Math.max(0, normal.dot(LIGHT));
        const hollow = THREE.MathUtils.smoothstep(best, 0, 0.45);
        const lower = THREE.MathUtils.smoothstep(v, crown.y - crown.ry, crown.y + crown.ry);
        let lit = 0.16 + diffuse * 0.8 * (0.5 + 0.5 * hollow) - lower * 0.12;
        // The leaves' own light and dark.
        lit += (noise(x, y, 2.4) - 0.5) * 0.45;
        put(
          x,
          y,
          shade(THREE.MathUtils.clamp(lit, 0, 1)),
          THREE.MathUtils.smoothstep(covered, 0.02, 0.08),
        );
        continue;
      }
      const trunk = 0.028 * (1 + (v - trunkFrom) * 0.8);
      if (v > trunkFrom - 0.05 && Math.abs(u + Math.sin(v * 9) * 0.006) < trunk) {
        put(x, y, colour.copy(bark).multiplyScalar(0.8 + (u / trunk) * 0.25), 1);
      }
    }
  }
};

let treeSheet: THREE.Texture | undefined;

/** Every kind of tree's picture, side by side on one sheet, drawn the first time it's needed. */
const trees = (): THREE.Texture => {
  treeSheet ??= painted(CELL.width * KINDS.length, CELL.height, (ctx) => {
    const image = ctx.createImageData(CELL.width * KINDS.length, CELL.height);
    KINDS.forEach((kind, i) => paintTree(image, i * CELL.width, kind, 7 + i * 13));
    ctx.putImageData(image, 0, 0);
  });
  return treeSheet;
};

/** A tree to stand somewhere: what kind, where its foot is, how tall, and darker or lighter. */
export interface Planting {
  readonly kind: TreeKind;
  readonly at: readonly [number, number];
  readonly height: number;
  /** How much its colour's scaled, to vary a line of them. 1 if not given. */
  readonly tone?: number;
  /** Mirrored left to right, so neighbours aren't twins. */
  readonly flip?: boolean;
}

/** How the air between the camera and something far off pales it: its colour, and how fast. */
export interface Air {
  readonly colour: THREE.ColorRepresentation;
  /** How far off, in metres, it has paled halfway to the air's colour. */
  readonly half: number;
}

/**
 * Trees on cards facing the pitch, all one mesh. `tint` scales every tree's colour, for the
 * venue's light: a cold winter's day, or a summer evening. The `air` pales each with distance, as
 * it does real trees, so a line of them sits back behind what's thrown in front of it.
 */
export const treeCards = (
  plantings: readonly Planting[],
  tint: THREE.ColorRepresentation = "#ffffff",
  air?: Air,
) => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colours: number[] = [];
  const hazes: number[] = [];
  const index: number[] = [];
  const colour = new THREE.Color();
  plantings.forEach(({ kind, at: [x, z], height, tone = 1, flip = false }, i) => {
    const width = (height * CELL.width) / CELL.height;
    const cell = KINDS.indexOf(kind);
    const [u0, u1] = [cell / KINDS.length, (cell + 1) / KINDS.length];
    const [left, right] = flip ? [u1, u0] : [u0, u1];
    positions.push(
      ...[x - width / 2, 0, z],
      ...[x + width / 2, 0, z],
      ...[x + width / 2, height, z],
      ...[x - width / 2, height, z],
    );
    uvs.push(left, 0, right, 0, right, 1, left, 1);
    colour.set(tint).multiplyScalar(tone);
    const far = Math.hypot(x, z);
    const haze = air ? 1 - 0.5 ** (far / air.half) : 0;
    for (let k = 0; k < 4; k++) {
      colours.push(colour.r, colour.g, colour.b);
      hazes.push(haze);
    }
    const v = i * 4;
    index.push(v, v + 1, v + 2, v, v + 2, v + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute("haze", new THREE.Float32BufferAttribute(hazes, 1));
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({
    map: trees(),
    vertexColors: true,
    alphaTest: 0.45,
    alphaToCoverage: true,
  });
  const hazeColour = new THREE.Color(air?.colour ?? "#ffffff");
  material.customProgramCacheKey = () => "tree-cards";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hazeColour = { value: hazeColour };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float haze;\nvarying float vHaze;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHaze = haze;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 hazeColour;\nvarying float vHaze;",
      )
      .replace(
        "#include <opaque_fragment>",
        "outgoingLight = mix(outgoingLight, hazeColour, vHaze);\n#include <opaque_fragment>",
      );
  };
  return new THREE.Mesh(geometry, material);
};

/**
 * A line of trees along the far side of a venue, `rows` deep from `z` back, scattered so they
 * overlap, the rows further back taller and paler. The kinds are picked from `kinds` in turn.
 */
export const treeLine = (
  kinds: readonly TreeKind[],
  {
    z,
    rows,
    from = -70,
    to = 70,
    spacing = 6,
    height = [10, 16],
    seed = 3,
    tint,
    air,
    undergrowth = false,
  }: {
    z: number;
    rows: number;
    from?: number;
    to?: number;
    spacing?: number;
    height?: readonly [number, number];
    seed?: number;
    tint?: THREE.ColorRepresentation;
    air?: Air;
    /** Bushes along the front, hiding the trunks. */
    undergrowth?: boolean;
  },
) => {
  const random = seeded(seed);
  const plantings: Planting[] = [];
  for (let row = rows - 1; row >= 0; row--) {
    for (let x = from + random() * spacing; x < to; x += spacing * (0.6 + random() * 0.8)) {
      const [low, high] = height;
      plantings.push({
        kind: kinds[Math.floor(random() * kinds.length)] ?? "broadleaf",
        at: [x, z - row * 12 - random() * 6],
        height: (low + random() * (high - low)) * (1 + row * 0.15),
        tone: 0.82 + random() * 0.3 - row * 0.05,
        flip: random() < 0.5,
      });
    }
  }
  if (undergrowth) {
    for (let x = from; x < to; x += 1.4 + random() * 1.2) {
      plantings.push({
        kind: "bush",
        at: [x, z + 1.5 - random() * 2],
        height: 3 + random() * 2.2,
        tone: 0.75 + random() * 0.3,
        flip: random() < 0.5,
      });
    }
  }
  return treeCards(plantings, tint, air);
};

// --- Hills and mountains --------------------------------------------------------------------

/** How a range is painted: its colours, lit side to shaded, with snow or trees on it if any. */
export interface Range {
  readonly lit: string;
  readonly shade: string;
  /** Snow down from the peaks, to this share of the way down. */
  readonly snow?: number;
  /** Forest, dark and textured, up to this share of the way up. */
  readonly forest?: number;
  /** How jagged: 0 for rolling hills, 1 for alpine peaks. */
  readonly rugged: number;
  readonly seed: number;
}

/**
 * A range of hills or mountains along the horizon, as a picture: a ridge line made of layers of
 * noise, with each slope lit or shaded by which way it faces the sun on the right, gullies picked
 * out, snow on the peaks and forest on the lower slopes if the range has them.
 */
const ranges = new Map<string, THREE.Texture>();

const rangeTexture = (range: Range) =>
  painted(2048, 256, (ctx) => {
    const width = 2048;
    const height = 256;
    const random = seeded(range.seed);
    const octaves = Array.from({ length: 6 }, (_, k) => ({
      phase: random() * 1000,
      frequency: 2 ** k * (1.5 + random()),
      weight: 0.55 ** k * (k === 0 ? 1 : 1 + range.rugged),
    }));
    const ridge = (x: number) => {
      let y = 0;
      for (const { phase, frequency, weight } of octaves) {
        // Sharpened into peaks the more rugged it is.
        const wave = Math.sin((x / width) * Math.PI * 2 * frequency + phase);
        y += weight * (range.rugged > 0.5 ? 1 - Math.abs(wave) * 2 : wave);
      }
      return y;
    };
    const tops = Array.from({ length: width }, (_, x) => ridge(x));
    const [low, high] = [Math.min(...tops), Math.max(...tops)];
    const image = ctx.createImageData(width, height);
    const lit = new THREE.Color(range.lit);
    const shade = new THREE.Color(range.shade);
    const snow = new THREE.Color("#f2f5fa");
    const snowShade = new THREE.Color("#a9b6c9");
    const forest = new THREE.Color("#1f3324");
    const colour = new THREE.Color();
    for (let x = 0; x < width; x++) {
      const top = height * (0.92 - (((tops[x] ?? 0) - low) / (high - low)) * 0.85);
      // Facing the sun on the right where the ridge falls away to the right.
      const slope =
        ((tops[Math.min(x + 3, width - 1)] ?? 0) - (tops[Math.max(x - 3, 0)] ?? 0)) * 18;
      for (let y = Math.max(0, Math.floor(top)); y < height; y++) {
        const down = (y - top) / (height - top + 1);
        // Gullies running down the slopes, darker.
        const gully = Math.sin(x * 0.09 + Math.sin(y * 0.05 + x * 0.002) * 3) * 0.5 + 0.5;
        const sunny = THREE.MathUtils.clamp(
          0.5 - slope * 0.5 + (gully - 0.5) * 0.3 * range.rugged,
          0,
          1,
        );
        colour.copy(shade).lerp(lit, sunny * (1 - down * 0.4));
        const depth = (y - top) / height;
        if (range.snow && depth < range.snow * (0.6 + gully * 0.6)) {
          colour.copy(snowShade).lerp(snow, sunny);
        } else if (range.forest && y > height * (1 - range.forest) + Math.sin(x * 0.05) * 8) {
          colour.copy(forest).lerp(colour, 0.25 + (random() - 0.5) * 0.15);
        }
        const i = (y * width + x) * 4;
        image.data[i] = Math.round(colour.r * 255);
        image.data[i + 1] = Math.round(colour.g * 255);
        image.data[i + 2] = Math.round(colour.b * 255);
        // Softened along the ridge line.
        image.data[i + 3] = Math.round(255 * Math.min(1, (y - top + 1) / 1.5));
      }
    }
    ctx.putImageData(image, 0, 0);
  });

/**
 * A range along the horizon, `distance` away and `height` tall, curving round in front of the
 * pitch from `from` to `to` degrees right of straight ahead, so it stays the same distance off
 * across a wide screen. The haze fades it with distance, as it does the ground. A range that
 * `tapers` dwindles to nothing at each end, like a headland.
 */
export const range = (
  look: Range,
  {
    distance,
    height,
    from = -70,
    to = 70,
    sink = 2,
    tapers = false,
  }: {
    distance: number;
    height: number;
    from?: number;
    to?: number;
    sink?: number;
    tapers?: boolean;
  },
) => {
  const segments = 32;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = THREE.MathUtils.degToRad(from + t * (to - from));
    const x = Math.sin(angle) * distance;
    const z = -Math.cos(angle) * distance;
    // The picture repeats every 70 degrees round.
    const u = (t * (to - from)) / 70;
    const fall = tapers
      ? 0.05 +
        0.95 * THREE.MathUtils.smoothstep(t, 0, 0.25) * THREE.MathUtils.smoothstep(1 - t, 0, 0.25)
      : 1;
    positions.push(x, -sink, z, x, height * fall - sink, z);
    uvs.push(u, 0, u, 1);
    if (i < segments) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  // Painted once for each look, and shared by every game after.
  const key = JSON.stringify(look);
  let map = ranges.get(key);
  if (!map) {
    map = rangeTexture(look);
    map.wrapS = THREE.RepeatWrapping;
    ranges.set(key, map);
  }
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
};

// --- Netting --------------------------------------------------------------------------------

/**
 * Tall netting on posts behind a park pitch's goal, to stop the balls that miss: dark green mesh
 * on galvanised posts, with a kickboard along the bottom. It shows the trees through it.
 */
export const ballStop = ({
  z,
  from,
  to,
  height,
}: {
  z: number;
  from: number;
  to: number;
  height: number;
}) => {
  const group = new THREE.Group();
  const mesh = painted(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = "rgba(26, 46, 30, 0.95)";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, 64, 64);
  });
  mesh.wrapS = mesh.wrapT = THREE.RepeatWrapping;
  // A 10 cm square mesh.
  mesh.repeat.set((to - from) / 0.1, height / 0.1);
  const netting = new THREE.Mesh(
    new THREE.PlaneGeometry(to - from, height),
    new THREE.MeshStandardMaterial({
      map: mesh,
      transparent: true,
      roughness: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  netting.position.set((from + to) / 2, height / 2, z);
  group.add(netting);
  const steel = new THREE.MeshStandardMaterial({
    color: "#8d9499",
    metalness: 0.7,
    roughness: 0.45,
  });
  // The posts and the rail along their tops, merged to draw at once.
  const frame: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.035, 0.035, to - from, 8)
      .rotateZ(Math.PI / 2)
      .translate((from + to) / 2, height, z + 0.03),
  ];
  for (let x = from; x <= to + 0.01; x += 4) {
    frame.push(
      new THREE.CylinderGeometry(0.045, 0.05, height + 0.2, 8).translate(x, height / 2, z + 0.03),
    );
  }
  const posts = new THREE.Mesh(mergeGeometries(frame), steel);
  for (const part of frame) part.dispose();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(to - from, 0.4, 0.05),
    new THREE.MeshStandardMaterial({ color: "#2f4632", roughness: 0.8 }),
  );
  board.position.set((from + to) / 2, 0.2, z + 0.05);
  group.add(posts, board);
  return group;
};

// --- The sky at night, and the sea ----------------------------------------------------------

/** A dome of stars, over a venue at night. */
export const stars = (count: number, colour = 0xffffff): THREE.Object3D => {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    // A golden-angle spiral spreads them evenly without a random source.
    const t = (i + 0.5) / count;
    const angle = i * 2.39996;
    const x = Math.cos(angle) * 160 * Math.sqrt(t);
    const y = 8 + 90 * (1 - Math.sqrt(t)) * ((i % 7) / 7 + 0.3);
    positions.push(x, y, -140 - (i % 5) * 10);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: colour,
      size: 1.4,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
};

/** The sea's colour going out from the sand: turquoise shallows, deepening to blue. */
const SEA = [
  { out: 0, colour: new THREE.Color(0x4fd0cf) },
  { out: 14, colour: new THREE.Color(0x2a9bd6) },
  { out: 60, colour: new THREE.Color(0x1f74c2) },
];

/**
 * The sea, from the edge of the sand out to the horizon, glossy, turquoise in the shallows and
 * deepening further out, with a wavy line of white surf along the shore and a fainter one beyond.
 */
export const sea = (): THREE.Object3D => {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(800, 400, 1, 40);
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    // The plane's top edge, at +200 before it's laid flat, is the shore.
    const out = 200 - position.getY(i);
    const [near, middle, far] = SEA;
    if (near && middle && far) {
      if (out < middle.out) colour.copy(near.colour).lerp(middle.colour, out / middle.out);
      else colour.copy(middle.colour).lerp(far.colour, Math.min(1, (out - middle.out) / far.out));
    }
    colour.toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const water = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.02, -45 - 200);
  group.add(water);

  // Surf: ribbons along the shore, wavy on their seaward edge.
  for (const [from, depth, opacity] of [
    [0, 1.6, 0.9],
    [4, 0.7, 0.45],
  ] as const) {
    const points: number[] = [];
    const index: number[] = [];
    const steps = 240;
    for (let s = 0; s <= steps; s++) {
      const x = -300 + (600 * s) / steps;
      const wave = depth * (0.7 + 0.3 * Math.sin(x * 0.45 + from) + 0.15 * Math.sin(x * 1.3));
      points.push(x, 0.03, -45 - from, x, 0.03, -45 - from - wave);
      if (s < steps) index.push(s * 2, s * 2 + 2, s * 2 + 1, s * 2 + 1, s * 2 + 2, s * 2 + 3);
    }
    const ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    ribbon.setIndex(index);
    ribbon.computeVertexNormals();
    const foam = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(ribbon, foam));
  }
  return group;
};
