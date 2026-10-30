import * as THREE from "three";
import type { Venue } from "../venues";
import { BACKDROP_Z, hasFloor } from "./backdrop";
import { directionOf, lookOf } from "./look";
import grassColourUrl from "./textures/grass-colour.jpg";
import grassNormalUrl from "./textures/grass-normal.jpg";
import grassRoughnessUrl from "./textures/grass-roughness.jpg";

// The ground: the pitch, drawn with mown stripes and chalk markings and the goal's shadow, and
// given the detail of real grass up close, and the plain ground round it running off to the
// horizon. Beyond the backdrop's card the ground's in the backdrop's picture (see ./backdrop.ts),
// and where that picture has a floor, its ground running on in front of the card, it covers the
// pitch, and only the chalk, the goal's shadow and the player's are drawn over it, so the picture
// and the ground are one. Units are metres; the player stands on the origin facing the goal, -Z.

export const GOAL_Z = -30;
export const GOAL_WIDTH = 7.32;

/** The pitch: 68 m across, from just behind the goal line to just behind the player. */
const PITCH = { width: 68, back: GOAL_Z - 2, front: 6 };
/** Where the pitch ends behind the player. */
export const PITCH_FRONT = PITCH.front;
const PIXELS_PER_METRE = 20;
const STRIPE = 4.5;
const LINE_WIDTH = 0.14;
/** How much pitch one tile of the grass photo covers. */
const GRASS_TILE = 2.5;
/** How high over a backdrop's floor its chalk lies, and the player's shadow over that. */
const OVER_FLOOR = { chalk: 0.008, shadow: 0.012 };

/** A repeatable random source, so the pitch comes out the same every time. */
const seeded = (start: number) => {
  let seed = start;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
};

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Smooth random values over a grid, for patches a few metres across. `u` and `v` run 0 to 1. A
 * periodic one matches at opposite edges, so it can tile.
 */
const valueNoise = (columns: number, rows: number, random: () => number, periodic = false) => {
  const grid = Array.from({ length: (columns + 1) * (rows + 1) }, () => random() * 2 - 1);
  const at = (c: number, r: number) =>
    grid[(periodic ? r % rows : r) * (columns + 1) + (periodic ? c % columns : c)] ?? 0;
  return (u: number, v: number) => {
    const x = u * columns;
    const y = v * rows;
    const c = Math.min(Math.floor(x), columns - 1);
    const r = Math.min(Math.floor(y), rows - 1);
    const fx = smooth(x - c);
    const fy = smooth(y - r);
    const top = at(c, r) + (at(c + 1, r) - at(c, r)) * fx;
    const bottom = at(c, r + 1) + (at(c + 1, r + 1) - at(c, r + 1)) * fx;
    return top + (bottom - top) * fy;
  };
};

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The worn, sandy grass in the goalmouth and on the penalty spot. */
const WORN = rgb("#8c8455");

/**
 * What of the pitch to draw: all of it, the grass alone, for under a backdrop's floor whose own
 * chalk lies over it, or the chalk alone, for over that floor.
 */
type Layer = "all" | "grass" | "chalk";

/**
 * The pitch's colour: soft-edged mown stripes, uneven patches and, on grass, wear where the keeper
 * and penalty takers stand. It blends into the ground beyond just behind the goal line. The chalk
 * markings are drawn on top, where mipmapping keeps them steady even far off. The chalk alone has
 * the goal's shadow too, clear between. A venue without a goal has none of either, nor the wear:
 * its pitch is open ground.
 */
const drawPitch = (venue: Venue, layer: Layer = "all"): HTMLCanvasElement => {
  const width = PITCH.width * PIXELS_PER_METRE;
  const height = (PITCH.front - PITCH.back) * PIXELS_PER_METRE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  if (layer !== "chalk") paintGrass(ctx, venue, width, height);
  if (layer !== "grass" && venue.goal !== false) drawChalk(ctx, venue);
  return canvas;
};

/** The pitch's mown stripes, patches and wear, `width` by `height` pixels. */
const paintGrass = (
  ctx: CanvasRenderingContext2D,
  venue: Venue,
  width: number,
  height: number,
): void => {
  const image = ctx.createImageData(width, height);
  const random = seeded(3);
  const patches = valueNoise(14, 8, random);
  const tufts = valueNoise(136, 76, random);
  const [one, two] = venue.pitch.map(rgb);
  const beyond = rgb(venue.surround);
  const grass = venue.surface === "grass";
  for (let py = 0; py < height; py++) {
    const z = PITCH.back + (py + 0.5) / PIXELS_PER_METRE;
    // A square wave with soft edges, as the mower leaves the stripes.
    const stripe =
      0.5 + 0.5 * Math.min(Math.max(Math.sin((Math.PI * (z - GOAL_Z)) / STRIPE) * 8, -1), 1);
    const offPitch = clamp01((GOAL_Z - 0.4 - z) / 1.4);
    for (let px = 0; px < width; px++) {
      const x = (px + 0.5) / PIXELS_PER_METRE - PITCH.width / 2;
      const u = px / width;
      const v = py / height;
      const variation = 1 + patches(u, v) * 0.06 + tufts(u, v) * 0.04 + (random() - 0.5) * 0.05;
      const mouth = Math.exp(-((x / 2.6) ** 2) - ((z - GOAL_Z - 1.2) / 1.4) ** 2);
      const spot = Math.exp(-(x ** 2 + (z - GOAL_Z - 11) ** 2) / 0.9);
      const wear =
        grass && venue.goal !== false
          ? Math.min((mouth * 0.5 + spot * 0.45) * (0.8 + tufts(u, v)), 0.75)
          : 0;
      const i = (py * width + px) * 4;
      for (let k = 0; k < 3; k++) {
        const a = one?.[k] ?? 0;
        const mown = a + ((two?.[k] ?? 0) - a) * stripe;
        const worn = mown + ((WORN[k] ?? 0) - mown) * Math.max(wear, 0);
        const value = worn * variation;
        image.data[i + k] = Math.round(value + ((beyond[k] ?? 0) - value) * offPitch);
      }
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

/** The chalk, and the goal's shadow across it, on the pitch's picture. */
const drawChalk = (ctx: CanvasRenderingContext2D, venue: Venue): void => {
  // The chalk: the goal line, the six-yard box, the penalty area, the spot and the D.
  const at = (x: number, z: number): [number, number] => [
    (x + PITCH.width / 2) * PIXELS_PER_METRE,
    (z - PITCH.back) * PIXELS_PER_METRE,
  ];
  ctx.strokeStyle = venue.lines;
  ctx.fillStyle = venue.lines;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = LINE_WIDTH * PIXELS_PER_METRE;
  const path = (points: [number, number][]) => {
    ctx.beginPath();
    points.forEach(([x, z], i) => {
      if (i === 0) ctx.moveTo(...at(x, z));
      else ctx.lineTo(...at(x, z));
    });
    ctx.stroke();
  };
  path([
    [-PITCH.width / 2, GOAL_Z],
    [PITCH.width / 2, GOAL_Z],
  ]);
  for (const [out, half] of [
    [5.5, GOAL_WIDTH / 2 + 5.5],
    [16.5, GOAL_WIDTH / 2 + 16.5],
  ] as const) {
    path([
      [-half, GOAL_Z],
      [-half, GOAL_Z + out],
      [half, GOAL_Z + out],
      [half, GOAL_Z],
    ]);
  }
  const [spotX, spotY] = at(0, GOAL_Z + 11);
  ctx.beginPath();
  ctx.arc(spotX, spotY, 0.12 * PIXELS_PER_METRE, 0, Math.PI * 2);
  ctx.fill();
  // The D: the part of the 9.15 m circle round the spot that's outside the penalty area.
  const reach = Math.asin(5.5 / 9.15);
  ctx.beginPath();
  ctx.arc(spotX, spotY, 9.15 * PIXELS_PER_METRE, reach, Math.PI - reach);
  ctx.stroke();

  // The goal's shadow, cast by the venue's sun across the grass, soft-edged. The goal never moves,
  // so it's painted here rather than cast each frame.
  const look = lookOf(venue.id);
  const sun = directionOf(look.key);
  /** Where a point's shadow falls on the ground, on the picture. */
  const shadowOf = ([x, y, z]: readonly [number, number, number]) =>
    at(x - (sun.x * y) / sun.y, z - (sun.z * y) / sun.y);
  const half = GOAL_WIDTH / 2;
  const top = 2.44;
  const bars: readonly (readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    number,
  ])[] = [
    // The posts and the bar, then the supports running back from the posts' tops to the ground.
    [[-half, 0, GOAL_Z], [-half, top, GOAL_Z], 0.06],
    [[half, 0, GOAL_Z], [half, top, GOAL_Z], 0.06],
    [[-half, top, GOAL_Z], [half, top, GOAL_Z], 0.06],
    [[-half, top, GOAL_Z], [-half, top, GOAL_Z - 0.9], 0.025],
    [[half, top, GOAL_Z], [half, top, GOAL_Z - 0.9], 0.025],
    [[-half, top, GOAL_Z - 0.9], [-half, 0, GOAL_Z - 2], 0.025],
    [[half, top, GOAL_Z - 0.9], [half, 0, GOAL_Z - 2], 0.025],
  ];
  ctx.globalAlpha = 0.5 * look.shadow;
  ctx.strokeStyle = "#000000";
  ctx.lineCap = "round";
  ctx.filter = "blur(1px)";
  for (const [from, to, radius] of bars) {
    ctx.lineWidth = Math.max(radius * 2 * PIXELS_PER_METRE, 1.5);
    ctx.beginPath();
    ctx.moveTo(...shadowOf(from));
    ctx.lineTo(...shadowOf(to));
    ctx.stroke();
  }
  ctx.filter = "none";
  ctx.globalAlpha = 1;
};

const drawn = new Map<string, HTMLCanvasElement>();

interface Photos {
  readonly colour: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly roughness: THREE.Texture;
  /** The colour photo's average, in linear light, and its brightness. */
  readonly mean: THREE.Vector3;
  readonly luma: number;
}

const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);

/** An image's average colour in linear light, for evening out a detail texture around 1. */
const meanColour = (image: CanvasImageSource): THREE.Vector3 => {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Vector3(0.18, 0.18, 0.18);
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const sum = new THREE.Vector3();
  for (let i = 0; i < data.length; i += 4) {
    sum.x += linear(data[i] ?? 0);
    sum.y += linear(data[i + 1] ?? 0);
    sum.z += linear(data[i + 2] ?? 0);
  }
  return sum.divideScalar(size * size);
};

let photos: Promise<Photos | undefined> | undefined;

/** Loads the grass photos once (see textures/README.md), or resolves undefined if they fail. */
const loadPhotos = (): Promise<Photos | undefined> => {
  photos ??= (async () => {
    try {
      const loader = new THREE.TextureLoader();
      const [colour, normal, roughness] = await Promise.all(
        [grassColourUrl, grassNormalUrl, grassRoughnessUrl].map((url) => loader.loadAsync(url)),
      );
      if (!colour || !normal || !roughness) return undefined;
      for (const texture of [colour, normal, roughness]) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(PITCH.width / GRASS_TILE, (PITCH.front - PITCH.back) / GRASS_TILE);
      }
      colour.colorSpace = THREE.SRGBColorSpace;
      const mean = meanColour(colour.image);
      return { colour, normal, roughness, mean, luma: Math.max(mean.dot(LUMA), 1e-4) };
    } catch (error) {
      console.warn("Couldn't load the grass photos, so the pitch is plain", error);
      return undefined;
    }
  })();
  return photos;
};

/**
 * Resolves once the grass photos have loaded, or failed to, by when a pitch already built has
 * them laid over it. Called early, it starts fetching them.
 */
export const groundReady = (): Promise<void> => loadPhotos().then(() => undefined);

/**
 * Adds the grass photos' detail to the drawn pitch once they've loaded: their bumps catch the
 * light, and their colour adds texture rather than replacing the stripes, sampled at two sizes so
 * the tiling doesn't show. Grass gets the photo's colour too; sand, snow and the rest only its
 * light and shade, more gently.
 */
const addDetail = (material: THREE.MeshStandardMaterial, venue: Venue, anisotropy: number) => {
  void loadPhotos().then((loaded) => {
    if (!loaded) return;
    const grass = venue.surface === "grass";
    for (const texture of [loaded.colour, loaded.normal, loaded.roughness]) {
      texture.anisotropy = anisotropy;
    }
    material.normalMap = loaded.normal;
    material.normalScale.setScalar(grass ? 1 : 0.4);
    material.roughnessMap = loaded.roughness;
    material.customProgramCacheKey = () => `pitch-${venue.surface}`;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassPhoto = { value: loaded.colour };
      shader.uniforms.grassPhotoMean = { value: loaded.mean };
      shader.uniforms.grassPhotoLuma = { value: loaded.luma };
      shader.uniforms.photoColour = { value: grass ? 0.5 : 0 };
      shader.uniforms.photoStrength = { value: grass ? 1 : 0.5 };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D grassPhoto;
          uniform vec3 grassPhotoMean;
          uniform float grassPhotoLuma;
          uniform float photoColour;
          uniform float photoStrength;`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 photo = 0.6 * texture2D(grassPhoto, vNormalMapUv).rgb
            + 0.4 * texture2D(grassPhoto, vNormalMapUv * 0.23 + 0.37).rgb;
          // The photo's light and shade, and some of its colour, evened out around 1.
          vec3 detail = mix(
            vec3(dot(photo, vec3(0.2126, 0.7152, 0.0722)) / grassPhotoLuma),
            photo / grassPhotoMean,
            photoColour
          );
          diffuseColor.rgb *= mix(vec3(1.0), detail, photoStrength);`,
        );
    };
    material.needsUpdate = true;
  });
};

/**
 * How the floor picture takes the pitch's grass: how much of the grass photo's light and shade
 * it's given, behind the goal and on the pitch, how strong the stripes are, and how blurred its
 * own picture is on the pitch, as a mipmap level, and on a cliff's edge (see grassOverFloor).
 */
const OVER_FLOOR_GRASS = {
  behind: 0.5,
  onPitch: 1,
  stripes: 0.1,
  blur: 4,
  cliffBlur: 2.5,
} as const;

/** A number written into a shader, with a decimal point. */
const glsl = (x: number) => x.toFixed(2);

/**
 * Gives a backdrop's floor picture (see backdrop.ts) the pitch's own grass. On the pitch, the
 * picture's own blades, painted in a pattern that repeats, give way to the grass photo's, laid on
 * the ground just as the pitch's are, so it's sharp right up to the player, over the picture's
 * colour, blurred, with soft mown stripes across it. Behind the goal, where it meets the backdrop,
 * it's the picture still, with only a little of the photo. Its colours stay its own throughout,
 * so it still meets the backdrop without a seam. Only on grass, and on a cliff, only this side of
 * its edge: past it, the picture's the drop.
 */
export const grassOverFloor = (
  backdrop: THREE.Object3D,
  venue: Venue,
  anisotropy: number,
): void => {
  const floor = backdrop.getObjectByName("floor");
  if (venue.surface !== "grass" || !(floor instanceof THREE.Mesh)) return;
  const { ledge } = venue;
  const material = floor.material as THREE.Material;
  void loadPhotos().then((loaded) => {
    if (!loaded) return;
    loaded.colour.anisotropy = anisotropy;
    material.customProgramCacheKey = () => "floor-grass";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassPhoto = { value: loaded.colour };
      shader.uniforms.grassPhotoLuma = { value: loaded.luma };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGround;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D grassPhoto;
          uniform float grassPhotoLuma;
          varying vec3 vGround;`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          // The photo's blades, a tile every few metres and at a second size so the tiling
          // doesn't show, as light and shade evened out around 1.
          vec2 blades = vGround.xz / ${glsl(GRASS_TILE)};
          vec3 photo = 0.6 * texture2D(grassPhoto, blades).rgb
            + 0.4 * texture2D(grassPhoto, blades * 0.23 + 0.37).rgb;
          float shade = dot(photo, vec3(0.2126, 0.7152, 0.0722)) / grassPhotoLuma;
          // How far onto the pitch: none behind the goal, all of it a few metres in front.
          float pitch = smoothstep(${glsl(GOAL_Z - 1)}, ${glsl(GOAL_Z + 4)}, vGround.z)
            * (1.0 - smoothstep(${glsl(PITCH.width / 2 - 1)}, ${glsl(PITCH.width / 2)}, abs(vGround.x)));
          // On the ground at all: everywhere, but for a cliff's edge, its rocky lip and past it.
          float ground = ${ledge === undefined ? "1.0" : `smoothstep(${glsl(-ledge + 0.9)}, ${glsl(-ledge + 1.4)}, vGround.z)`};
          pitch *= ground;
          // The picture's colour, blurred, so its patches and its light stay but not its blades. Less
          // so on a cliff, whose floor picture's parts aren't all grass, so a blur that reached from
          // one into the next would streak it.
          vec3 blurred = diffuse * textureLod(map, vMapUv, ${glsl(ledge === undefined ? OVER_FLOOR_GRASS.blur : OVER_FLOOR_GRASS.cliffBlur)}).rgb;
          // The mower's stripes, soft-edged, across the pitch.
          float stripe = clamp(sin(PI * (vGround.z - ${glsl(GOAL_Z)}) / ${glsl(STRIPE)}) * 8.0, -1.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, blurred, pitch)
            * mix(1.0, shade, mix(${glsl(OVER_FLOOR_GRASS.behind)}, ${glsl(OVER_FLOOR_GRASS.onPitch)}, pitch) * ground)
            * (1.0 + ${glsl(OVER_FLOOR_GRASS.stripes)} * stripe * pitch);`,
        );
    };
    material.needsUpdate = true;
  });
};

/** Gentle patches for the ground beyond the pitch, as grey to tint with its colour. */
const patchTexture = (): THREE.Texture => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(size, size);
    const random = seeded(9);
    const large = valueNoise(4, 4, random, true);
    const small = valueNoise(16, 16, random, true);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const grey = 235 + large(u, v) * 14 + small(u, v) * 8;
        const i = (y * size + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(grey);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

/**
 * How much of the ground to make: what's in front of the backdrop's card, the pitch and the ground
 * round it (`near`), what's beyond it, for painting into the backdrop (`far`), or all of it.
 */
export type Reach = "near" | "far" | "all";

/** The surround's extent for each reach: how far either side, and from and to down the pitch. */
const SURROUND: Record<Reach, { half: number; from: number; to: number }> = {
  near: { half: 150, from: 40, to: BACKDROP_Z },
  far: { half: 700, from: BACKDROP_Z, to: -1300 },
  all: { half: 700, from: 100, to: -1300 },
};

/** The pitch, and the ground round it out to the horizon, or the part of it `reach` says. */
export const buildGround = (
  venue: Venue,
  anisotropy: number,
  reach: Reach = "all",
): THREE.Object3D => {
  const group = new THREE.Group();

  const { half, from, to } = SURROUND[reach];
  const patches = patchTexture();
  patches.repeat.set((half * 2) / 30, (from - to) / 30);
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, from - to),
    new THREE.MeshStandardMaterial({ color: venue.surround, map: patches, roughness: 1 }),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, -0.03, (from + to) / 2);
  group.add(surround);
  if (reach === "far") return group;

  const picture = (layer: Layer) => {
    const key = `${venue.id}-${layer}`;
    let canvas = drawn.get(key);
    if (!canvas) {
      canvas = drawPitch(venue, layer);
      drawn.set(key, canvas);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    return map;
  };
  /** A sheet the pitch's size, or out to the cliff's edge, lying on the ground `y` up. */
  const back = venue.ledge === undefined ? PITCH.back : -venue.ledge;
  const sheet = (material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.width, PITCH.front - back), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, y, (PITCH.front + back) / 2);
    // Only the player casts a shadow as they play, and only on the pitch round them (see look.ts).
    mesh.receiveShadow = true;
    return mesh;
  };

  // Where a backdrop's floor covers the pitch, its chalk is laid over it, lit as the pitch is, so it
  // dims with the candles, and the player's shadow is cast over that. Where the floor gives way to
  // the pitch (see backdrop.ts), those lie over the pitch too, so it has neither of its own.
  const floored = reach === "near" && hasFloor(venue.id);
  const material = new THREE.MeshStandardMaterial({
    map: picture(floored ? "grass" : "all"),
    roughness: 1,
  });
  addDetail(material, venue, anisotropy);
  const pitch = sheet(material, 0);
  pitch.receiveShadow = !floored;
  group.add(pitch);

  if (floored) {
    group.add(
      sheet(
        new THREE.MeshStandardMaterial({
          map: picture("chalk"),
          roughness: 1,
          transparent: true,
          depthWrite: false,
        }),
        OVER_FLOOR.chalk,
      ),
      sheet(
        new THREE.ShadowMaterial({ opacity: 0.45 * lookOf(venue.id).shadow, depthWrite: false }),
        OVER_FLOOR.shadow,
      ),
    );
  }
  return group;
};
