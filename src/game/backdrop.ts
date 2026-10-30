import * as THREE from "three";
import type { Venue, VenueId } from "../venues";

// Each venue's backdrop: everything beyond the pitch that stays put while a round's played, its
// sky, its hills and trees, its stands and their crowds, drawn as one picture. The pictures are made
// for each venue and fitted to the card (see ASSETS.md), and kept in ./backdrops. In the game each
// is a flat card standing on the ground just behind the goal, unlit, drawn before anything else, so
// the whole backdrop costs one draw and no shading. Seen from where the camera stands, the card
// looks just like the scenery in its picture, and the camera only ever moves a little from there.
// What moves stays live in front of it: the candles, the emperor, the flares, the crowd that
// turns out for a streak.

/** Where the camera stands between moves, which the backdrops are painted from (see scene.ts). */
export const EYE = new THREE.Vector3(0, 2.8, 6.4);

/** How far down the pitch the card stands: just behind the back of the net. */
export const BACKDROP_Z = -34;

/**
 * The card's parts, as where each is on the card, in metres across and up, and where it's painted
 * on the picture, in pixels. The middle's fine enough for a phone held upright to show a texel to
 * every pixel; the sides, which only a wider screen shows, are about half as fine. The card is wide
 * enough for a wide screen, and tall enough to reach past the top of a tall phone's.
 */
export const REGIONS = [
  { x: [-11, 11], y: [-0.5, 14.5], at: [0, 0], size: [1300, 880] },
  { x: [-40, -11], y: [-0.5, 14.5], at: [1308, 0], size: [740, 380] },
  { x: [11, 40], y: [-0.5, 14.5], at: [1308, 388], size: [740, 380] },
] as const;

/** How big a picture is, in pixels: every part, with a little room between them. */
export const PICTURE = { width: 2048, height: 880 };

/**
 * How far below the card's foot its floor picture reaches, in metres on the card. The floor picture
 * is the backdrop picture's own ground, which runs on below the card's foot, over the ground in
 * front of it (see floorShape): 20 m down the card is the ground just behind the player, past the
 * bottom of the screen.
 */
export const FLOOR_DEPTH = 20;

/** The floor picture's parts, as the card's: across the same spans, as finely, from the card's foot. */
export const FLOOR_REGIONS = [
  { x: [-11, 11], at: [0, 0], size: [1300, 1174] },
  { x: [-40, -11], at: [1308, 0], size: [740, 507] },
  { x: [11, 40], at: [1308, 515], size: [740, 507] },
] as const;

/** How big a floor picture is, in pixels. */
export const FLOOR_PICTURE = { width: 2048, height: 1174 };

/** How high the floor lies: over the pitch, under its chalk and the player's shadow (see ground.ts). */
const FLOOR_Y = 0.004;

const URLS = import.meta.glob<string>("./backdrops/*.webp", {
  query: "?url",
  import: "default",
  eager: true,
});

const loading = new Map<VenueId, Promise<THREE.Texture | undefined>>();
const loaded = new Map<VenueId, THREE.Texture>();
const floors = new Map<VenueId, THREE.Texture>();
const fars = new Map<VenueId, THREE.Texture>();

const loadPicture = async (url: string): Promise<THREE.Texture> => {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * A backdrop picture's own colours: its sky at the top, the haze along its horizon, and its ground
 * at the card's foot. The venue's light, reflections and haze are taken from them (see
 * ./scenery.ts), so what's drawn in 3D sits in the picture rather than on it.
 */
export interface PictureColours {
  readonly sky: THREE.Color;
  readonly horizon: THREE.Color;
  readonly ground: THREE.Color;
}

const colours = new Map<VenueId, PictureColours>();

/** The picture's colours, each the average of a band across the middle part of the card. */
const sampleColours = (image: CanvasImageSource): PictureColours | undefined => {
  const [middle] = REGIONS;
  const scale = 10;
  const canvas = document.createElement("canvas");
  canvas.width = middle.size[0] / scale;
  canvas.height = middle.size[1] / scale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(image, 0, 0, middle.size[0], middle.size[1], 0, 0, canvas.width, canvas.height);
  /** The average colour of the picture between two heights up the card, in metres. */
  const band = (from: number, to: number) => {
    const [bottom, top] = middle.y;
    const row = (y: number) =>
      THREE.MathUtils.clamp(
        Math.round(((top - y) / (top - bottom)) * canvas.height),
        0,
        canvas.height - 1,
      );
    const y0 = row(to);
    const { data } = ctx.getImageData(0, y0, canvas.width, Math.max(1, row(from) - y0));
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0);
    }
    const n = data.length / 4;
    return new THREE.Color().setRGB(
      (sum[0] ?? 0) / n / 255,
      (sum[1] ?? 0) / n / 255,
      (sum[2] ?? 0) / n / 255,
      THREE.SRGBColorSpace,
    );
  };
  return {
    sky: band(12.5, 14.5),
    horizon: band(EYE.y - 0.4, EYE.y + 0.4),
    ground: band(-0.5, 0.8),
  };
};

/** A venue's picture's colours, once its backdrop's loaded, or undefined. */
export const pictureColours = (venue: VenueId): PictureColours | undefined => colours.get(venue);

/**
 * Loads a venue's backdrop picture, and its floor and far pictures if it has them, once. Undefined
 * if it hasn't a backdrop, or it can't be loaded: then there's only the haze behind the pitch.
 */
export const backdropReady = (venue: VenueId): Promise<THREE.Texture | undefined> => {
  let pending = loading.get(venue);
  if (!pending) {
    const url = URLS[`./backdrops/${venue}.webp`];
    const floorUrl = URLS[`./backdrops/${venue}-floor.webp`];
    const farUrl = URLS[`./backdrops/${venue}-far.webp`];
    const optional = (extra: string | undefined) =>
      extra ? loadPicture(extra).catch(() => undefined) : undefined;
    pending = url
      ? Promise.all([loadPicture(url), optional(floorUrl), optional(farUrl)]).then(
          ([texture, floor, far]) => {
            loaded.set(venue, texture);
            if (floor) floors.set(venue, floor);
            if (far) fars.set(venue, far);
            // With a far picture, the sky and the horizon are its; the ground is the near one's.
            const near = sampleColours(texture.image as CanvasImageSource);
            const beyond = far && sampleColours(far.image as CanvasImageSource);
            const sampled = near && beyond ? { ...beyond, ground: near.ground } : near;
            if (sampled) colours.set(venue, sampled);
            return texture;
          },
          (error: unknown) => {
            console.warn(`Couldn't load ${venue}'s backdrop`, error);
            loading.delete(venue);
            return undefined;
          },
        )
      : Promise.resolve(undefined);
    loading.set(venue, pending);
  }
  return pending;
};

/**
 * How far down the pitch a venue's far picture stands, if it has one: its sky and its distance,
 * behind the near picture's nearer scenery, which is cut out round them. It's the card made bigger
 * about the eye, so from there it covers just what the card does, but as the camera moves, the near
 * scenery slides across it, as near things do across far ones.
 */
const FAR_Z = -300;

/**
 * The card's shape: a part for each region of the picture, side by side, each mapping its region
 * of the picture a little inside its edges, so no neighbour's pixels bleed in.
 */
const card = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  REGIONS.forEach(({ x: [left, right], y: [bottom, top], at: [px, py], size: [w, h] }, i) => {
    const u0 = (px + 0.5) / PICTURE.width;
    const u1 = (px + w - 0.5) / PICTURE.width;
    // The picture's first row is its top; a texture's v runs up from its bottom.
    const v1 = 1 - (py + 0.5) / PICTURE.height;
    const v0 = 1 - (py + h - 0.5) / PICTURE.height;
    positions.push(
      ...[left, bottom, BACKDROP_Z],
      ...[right, bottom, BACKDROP_Z],
      ...[right, top, BACKDROP_Z],
      ...[left, top, BACKDROP_Z],
    );
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const k = i * 4;
    index.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
};

/** Where a point on the card below its foot lies on the floor: on the line from the eye through it. */
const onFloor = (x: number, y: number): THREE.Vector3 => {
  const t = (EYE.y - FLOOR_Y) / (EYE.y - y);
  return new THREE.Vector3(EYE.x + (x - EYE.x) * t, FLOOR_Y, EYE.z + (BACKDROP_Z - EYE.z) * t);
};

/** How finely the floor's parts are cut, across and down, so it follows the eye's perspective. */
const FLOOR_CUTS = { across: 16, down: 48 };

/**
 * The floor's shape: the ground in front of the card, cut into a grid whose every point is where
 * the eye sees a point of the card below its foot. Seen from the eye, the floor picture lies on it
 * just as it would on the card, so the two meet without a seam.
 */
const floorShape = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const { across, down } = FLOOR_CUTS;
  FLOOR_REGIONS.forEach(({ x: [left, right], at: [px, py], size: [w, h] }) => {
    const first = positions.length / 3;
    for (let row = 0; row <= down; row++) {
      for (let column = 0; column <= across; column++) {
        const point = onFloor(
          left + ((right - left) * column) / across,
          -FLOOR_DEPTH * (row / down),
        );
        positions.push(point.x, point.y, point.z);
        uvs.push(
          (px + 0.5 + ((w - 1) * column) / across) / FLOOR_PICTURE.width,
          1 - (py + 0.5 + ((h - 1) * row) / down) / FLOOR_PICTURE.height,
        );
      }
    }
    // Each row nearer the eye than the last; wound to face up.
    for (let row = 0; row < down; row++) {
      for (let column = 0; column < across; column++) {
        const a = first + row * (across + 1) + column;
        const b = a + 1;
        const c = a + across + 1;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
};

/**
 * A venue's backdrop on its card, once its picture has loaded (see backdropReady), or undefined.
 * It's named "backdrop", for the twist that dims and flashes it: the castle's candles and its
 * lightning. Its colours are the screen's, already lit and tone mapped, and already hazed as far
 * as they are, so the venue's haze, which fades what's drawn in 3D into the picture's horizon,
 * leaves it alone. Its floor, if it has one, lies on the ground in front of it, under the pitch,
 * and shares its colour, so it dims and flashes too.
 */
export const buildBackdrop = (venue: Venue, anisotropy: number): THREE.Mesh | undefined => {
  const map = loaded.get(venue.id);
  if (!map) return undefined;
  map.anisotropy = anisotropy;
  const material = new THREE.MeshBasicMaterial({
    map,
    toneMapped: false,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(card(), material);
  mesh.name = "backdrop";
  // Behind everything, as a sky is: drawn first, and covered by whatever's in front.
  mesh.renderOrder = -1;
  const farMap = fars.get(venue.id);
  if (farMap) {
    // The near picture's cut out round its scenery, and its far picture shows through, further
    // off, drawn before it.
    material.alphaTest = 0.5;
    material.alphaToCoverage = true;
    farMap.anisotropy = anisotropy;
    const farMaterial = new THREE.MeshBasicMaterial({
      map: farMap,
      toneMapped: false,
      depthWrite: false,
      fog: false,
    });
    farMaterial.color = material.color;
    const scale = (EYE.z - FAR_Z) / (EYE.z - BACKDROP_Z);
    const far = new THREE.Mesh(
      card()
        .translate(-EYE.x, -EYE.y, -EYE.z)
        .scale(scale, scale, scale)
        .translate(EYE.x, EYE.y, EYE.z),
      farMaterial,
    );
    far.name = "far";
    far.renderOrder = -2;
    mesh.add(far);
  }
  const floorMap = floors.get(venue.id);
  if (floorMap) {
    floorMap.anisotropy = anisotropy;
    const floorMaterial = new THREE.MeshBasicMaterial({
      map: floorMap,
      toneMapped: false,
      fog: false,
    });
    floorMaterial.color = material.color;
    const floor = new THREE.Mesh(floorShape(), floorMaterial);
    floor.name = "floor";
    mesh.add(floor);
  }
  return mesh;
};

/** Whether a venue's backdrop has a floor picture, for the pitch to fade into (see ground.ts). */
export const hasFloor = (venue: VenueId): boolean => floors.has(venue);

/**
 * The cameras the backdrop's parts are painted from: at the eye, looking straight down the pitch,
 * each framing exactly its part of the card, so the picture lies flat on it.
 */
export const paintingCameras = (): { camera: THREE.Camera; region: (typeof REGIONS)[number] }[] =>
  REGIONS.map((region) => {
    const distance = EYE.z - BACKDROP_Z;
    const near = 0.1;
    const scale = near / distance;
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(EYE);
    camera.projectionMatrix.makePerspective(
      (region.x[0] - EYE.x) * scale,
      (region.x[1] - EYE.x) * scale,
      (region.y[1] - EYE.y) * scale,
      (region.y[0] - EYE.y) * scale,
      near,
      1000,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    return { camera, region };
  });
