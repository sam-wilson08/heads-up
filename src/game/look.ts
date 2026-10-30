import * as THREE from "three";
import type { Venue, VenueId } from "../venues";
import type { PictureColours } from "./backdrop";

// How each venue is lit and how its light reaches the screen: the sun (or floodlights, candles,
// lava) that shapes the player and casts the shadows, the light from the sky and ground all
// round, a light from in front that edges the player against the background, the haze, and the
// camera's exposure. The game and the menus' venue pictures both light a venue from here, so they
// match. Units are metres; the player stands on the origin facing the goal, down -Z.

/** A light from a direction: `height` degrees above the horizon, `across` degrees round from
 * straight behind the player (the camera's side) to their right. 90 is from their right, 180 from
 * the goal, -90 from their left. */
export interface Beam {
  readonly colour: string;
  readonly intensity: number;
  readonly height: number;
  readonly across: number;
}

export interface Look {
  /** How bright the picture is overall, before the tone mapping rolls off the highlights. */
  readonly exposure: number;
  /**
   * The light that shapes the player and casts the shadows. It comes from behind and to one side,
   * high enough to model their shoulders and back without flattening them, so their name and
   * number stay readable, and low enough to throw a shadow across the grass.
   */
  readonly key: Beam;
  /** Light from in front, edging the player's head and shoulders against what's behind them. */
  readonly rim?: Beam;
  /** The sky's light from overhead and the ground's bounced back up, for what isn't shiny. */
  readonly fill: { readonly sky: string; readonly ground: string; readonly intensity: number };
  /** How strongly the venue's surroundings light and reflect in everything that's shiny. */
  readonly environment: number;
  /** How dark the shadows are, from 0 (none) to 1 (black where the key light can't reach). */
  readonly shadow: number;
  /** Where the haze starts and where it's complete, in metres from the camera. */
  readonly haze: readonly [number, number];
  /**
   * How dark the corners of the picture are, as a camera's lens darkens them, drawing the eye to
   * the middle. A venue whose twist darkens them itself has none of its own.
   */
  readonly vignette: number;
  /**
   * Bright shapes round the venue for shiny things to reflect, as well as its sky: floodlight
   * banks, a lit hall, a volcano's glow. Each is a colour, how bright it is, and where it is.
   */
  readonly glows?: readonly {
    readonly colour: string;
    readonly intensity: number;
    readonly height: number;
    readonly across: number;
    /** How wide it is, in degrees. */
    readonly size: number;
  }[];
}

/**
 * Every venue's light. Intensities are tuned for the tone mapping below, which rolls highlights off
 * gently, so a sunlit white shirt keeps its folds and grass in the sun isn't neon. A venue without
 * a look of its own yet is lit like the park (see lookOf).
 */
const PARK: Look = {
  exposure: 1,
  // From behind on the left, as the backdrop picture is lit, its shadows falling right.
  key: { colour: "#fff0d8", intensity: 3.1, height: 42, across: -55 },
  rim: { colour: "#d8e8ff", intensity: 0.6, height: 25, across: -160 },
  fill: { sky: "#bcd8ff", ground: "#4f6b33", intensity: 0.55 },
  environment: 0.85,
  shadow: 0.85,
  haze: [70, 600],
  vignette: 0.28,
};

const LOOKS: Partial<Record<VenueId, Look>> = {
  park: PARK,
  beach: {
    exposure: 1,
    // From the left, as the backdrop picture is lit, its palms' shadows falling right.
    key: { colour: "#fff3dc", intensity: 3.3, height: 52, across: -45 },
    rim: { colour: "#e6f4ff", intensity: 0.5, height: 20, across: -165 },
    fill: { sky: "#a9d2ff", ground: "#d9bf8a", intensity: 0.65 },
    environment: 0.95,
    shadow: 0.8,
    haze: [80, 650],
    vignette: 0.28,
  },
  snow: {
    exposure: 0.95,
    // A low winter sun through thin cloud, and the snow all round bouncing it back.
    key: { colour: "#f6f2ea", intensity: 2.3, height: 30, across: 50 },
    rim: { colour: "#e8f0ff", intensity: 0.6, height: 18, across: -160 },
    fill: { sky: "#dfe8f4", ground: "#eef3fa", intensity: 0.9 },
    environment: 1.05,
    shadow: 0.7,
    haze: [40, 380],
    vignette: 0.28,
  },
  moon: {
    exposure: 1.05,
    // No air to scatter it: a hard white sun and black shadows, with only the Earth's glow to fill.
    key: { colour: "#ffffff", intensity: 4, height: 26, across: 62 },
    rim: { colour: "#9fb8ff", intensity: 0.5, height: 20, across: -150 },
    fill: { sky: "#1c2233", ground: "#5a5a5a", intensity: 0.18 },
    environment: 0.35,
    shadow: 0.95,
    haze: [90, 760],
    vignette: 0.28,
  },
  underwater: {
    exposure: 1.05,
    // The sun high through the surface, scattered by the water, so shadows are soft and faint.
    key: { colour: "#c8f6ff", intensity: 2.2, height: 62, across: 30 },
    rim: { colour: "#7fe6f5", intensity: 0.8, height: 35, across: 175 },
    fill: { sky: "#4fd0de", ground: "#1b6a63", intensity: 0.95 },
    environment: 0.85,
    shadow: 0.38,
    haze: [12, 85],
    vignette: 0.28,
  },
  volcano: {
    exposure: 1.1,
    // The lava fields' glow behind the player, and the volcano's own ahead on the right, where
    // the backdrop picture has it.
    key: { colour: "#ffd2b0", intensity: 2, height: 34, across: 48 },
    rim: { colour: "#ff6a26", intensity: 1.9, height: 14, across: 160 },
    fill: { sky: "#3e2018", ground: "#140a08", intensity: 0.5 },
    environment: 0.4,
    shadow: 0.85,
    haze: [90, 620],
    vignette: 0.3,
    glows: [{ colour: "#ff7a2a", intensity: 6, height: 10, across: -165, size: 22 }],
  },
  mars: {
    exposure: 1,
    // The backdrop picture's sun is low on the left, ahead: lit from that side, edged from there.
    key: { colour: "#ffe3c8", intensity: 2.9, height: 36, across: -52 },
    rim: { colour: "#b8d0ff", intensity: 0.5, height: 15, across: -165 },
    fill: { sky: "#d99a72", ground: "#7a3416", intensity: 0.6 },
    environment: 0.75,
    shadow: 0.85,
    haze: [55, 520],
    vignette: 0.28,
  },
  space: {
    exposure: 1.05,
    // The stadium's lights, cold and violet, and the neon round the pitch edging the player.
    key: { colour: "#ece4ff", intensity: 2.7, height: 46, across: -45 },
    rim: { colour: "#6ff0ff", intensity: 1.7, height: 25, across: 170 },
    fill: { sky: "#4a3092", ground: "#170b3a", intensity: 0.5 },
    environment: 0.6,
    shadow: 0.8,
    haze: [50, 450],
    vignette: 0.28,
    glows: [
      { colour: "#d9c8ff", intensity: 18, height: 30, across: 160, size: 9 },
      { colour: "#d9c8ff", intensity: 18, height: 30, across: -160, size: 9 },
      { colour: "#6ff0ff", intensity: 6, height: 4, across: 180, size: 30 },
    ],
  },
  funfair: {
    exposure: 1,
    // A summer evening: the low sun behind the rides in front, and its warm light on the player.
    key: { colour: "#ffd9ae", intensity: 2.5, height: 26, across: 58 },
    rim: { colour: "#ffb070", intensity: 2.2, height: 9, across: -165 },
    fill: { sky: "#9fb6f0", ground: "#5c7d3e", intensity: 0.6 },
    environment: 0.85,
    shadow: 0.8,
    haze: [60, 520],
    vignette: 0.28,
  },
  castle: {
    exposure: 1.1,
    // The torches on the wall behind the player; the moonlight through the windows is the twist's.
    key: { colour: "#ffb067", intensity: 2.8, height: 36, across: 42 },
    fill: { sky: "#2c2744", ground: "#241b1f", intensity: 0.6 },
    environment: 0.5,
    shadow: 0.8,
    haze: [35, 260],
    vignette: 0,
    glows: [
      { colour: "#9fb4ff", intensity: 5, height: 18, across: 170, size: 16 },
      { colour: "#ff9a4a", intensity: 8, height: 12, across: 120, size: 6 },
      { colour: "#ff9a4a", intensity: 8, height: 12, across: -120, size: 6 },
    ],
  },
  final: {
    exposure: 1.05,
    key: { colour: "#f3f6ff", intensity: 3, height: 50, across: 38 },
    rim: { colour: "#e6edff", intensity: 1.8, height: 34, across: -168 },
    fill: { sky: "#2b3b66", ground: "#173a1c", intensity: 0.45 },
    environment: 0.6,
    shadow: 0.8,
    haze: [55, 520],
    vignette: 0.28,
    glows: [
      { colour: "#fff8ea", intensity: 30, height: 24, across: 165, size: 8 },
      { colour: "#fff8ea", intensity: 30, height: 24, across: -165, size: 8 },
      { colour: "#fff8ea", intensity: 22, height: 34, across: 60, size: 8 },
      { colour: "#fff8ea", intensity: 22, height: 34, across: -60, size: 8 },
    ],
  },
  colosseum: {
    exposure: 1,
    key: { colour: "#fff0d4", intensity: 3.3, height: 48, across: -50 },
    rim: { colour: "#fff2dc", intensity: 0.6, height: 20, across: 160 },
    fill: { sky: "#bcd6ee", ground: "#c99c5c", intensity: 0.7 },
    environment: 0.95,
    shadow: 0.85,
    haze: [70, 600],
    vignette: 0.28,
  },
  fuji: {
    exposure: 1,
    // A low golden-hour sun from behind on the left, as the backdrop picture's lit, warm on the
    // player's back, under the mountain air's clear blue.
    key: { colour: "#ffd8a6", intensity: 3, height: 26, across: -50 },
    rim: { colour: "#ffe4c8", intensity: 0.7, height: 15, across: -165 },
    fill: { sky: "#a9c5ec", ground: "#5b7431", intensity: 0.55 },
    environment: 0.9,
    shadow: 0.8,
    haze: [70, 600],
    vignette: 0.28,
  },
};

/** A venue's look: its own, or the park's if it hasn't one yet. */
export const lookOf = (venue: VenueId): Look => LOOKS[venue] ?? PARK;

/**
 * How light reaches the screen. Khronos's neutral tone mapping keeps colours true, as a kit or a
 * brand's colours must be, while rolling the brightest light off softly rather than clipping it.
 */
export const TONE_MAPPING: THREE.ToneMapping = THREE.NeutralToneMapping;

/** The direction a light comes from, as a unit vector from the origin towards it. */
export const directionOf = ({ height, across }: { height: number; across: number }) =>
  new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - height),
    THREE.MathUtils.degToRad(across),
  );

/**
 * Where the only shadow cast as the game's played can be: the player's, as they step across the
 * lanes, lean, jump and fall over. Everything else's shadow is soft and painted (see ground.ts and
 * scene.ts). The key light's shadow camera is fitted round this and the ground the shadow can fall
 * on, so all of its detail is spent on the player, and none of the pitch beyond needs looking up.
 */
const CASTERS = new THREE.Box3(new THREE.Vector3(-1.8, 0, -1.4), new THREE.Vector3(1.8, 2.7, 2.6));

/** The casters' box, and the ground their shadow falls on with the light from `direction`. */
const shadowed = (direction: THREE.Vector3): THREE.Box3 => {
  const box = CASTERS.clone();
  for (const x of [CASTERS.min.x, CASTERS.max.x]) {
    for (const z of [CASTERS.min.z, CASTERS.max.z]) {
      const y = CASTERS.max.y;
      box.expandByPoint(
        new THREE.Vector3(
          x - (direction.x * y) / direction.y,
          0,
          z - (direction.z * y) / direction.y,
        ),
      );
    }
  }
  return box;
};

/** Fits a directional light's shadow camera round a box, seen from the light. */
const fitShadow = (light: THREE.DirectionalLight, box: THREE.Box3) => {
  const camera = light.shadow.camera;
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  camera.position.copy(light.position);
  camera.lookAt(light.target.position);
  camera.updateMatrixWorld();
  const view = camera.matrixWorldInverse;
  const bounds = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(view));
      }
    }
  }
  camera.left = bounds.min.x;
  camera.right = bounds.max.x;
  camera.bottom = bounds.min.y;
  camera.top = bounds.max.y;
  camera.near = Math.max(0.1, -bounds.max.z - 1);
  camera.far = -bounds.min.z + 1;
  camera.updateProjectionMatrix();
};

/** How far the key light is from what it lights. Only its direction matters, and its shadow. */
const KEY_DISTANCE = 60;

/** The lights a venue's lit by. The key light is the only one that casts shadows. */
export interface Lights {
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight | undefined;
  readonly fill: THREE.HemisphereLight;
}

/**
 * Where the haze starts and where it's complete, in metres from the camera, before a backdrop
 * picture: the goal, 37 m off, is about a fifth of the way into it, and the crowd halfway down
 * the pitch a tenth.
 */
const PICTURE_HAZE = [8, 170] as const;

/** A colour the hue and strength of `from`, but as light or dark as `tuned`. */
const tinted = (tuned: string, from: THREE.Color): THREE.Color => {
  const own = new THREE.Color(tuned).getHSL({ h: 0, s: 0, l: 0 });
  const theirs = from.getHSL({ h: 0, s: 0, l: 0 });
  return new THREE.Color().setHSL(theirs.h, theirs.s, own.l);
};

/**
 * Lights a venue, adding its lights and haze to the scene. With its backdrop picture's colours
 * (see ./backdrop.ts), the light from the sky and the ground is the picture's colour, as bright as
 * the look has it, and the haze is its horizon's, so what's drawn in 3D sits in the picture.
 */
export const lightVenue = (
  venue: Venue,
  scene: THREE.Scene,
  shadows: boolean,
  picture?: PictureColours,
): Lights => {
  const look = lookOf(venue.id);
  const fill = new THREE.HemisphereLight(
    picture ? tinted(look.fill.sky, picture.sky) : look.fill.sky,
    picture ? tinted(look.fill.ground, picture.ground) : look.fill.ground,
    look.fill.intensity,
  );
  scene.add(fill);

  const key = new THREE.DirectionalLight(look.key.colour, look.key.intensity);
  key.target.position.set(0, 0, -14);
  key.position.copy(key.target.position).addScaledVector(directionOf(look.key), KEY_DISTANCE);
  scene.add(key, key.target);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.intensity = look.shadow;
    // Soft-edged, as the sun's are, and nudged off the surfaces so they don't shadow themselves.
    key.shadow.radius = 3;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    fitShadow(key, shadowed(directionOf(look.key)));
  }

  let rim: THREE.DirectionalLight | undefined;
  if (look.rim) {
    rim = new THREE.DirectionalLight(look.rim.colour, look.rim.intensity);
    rim.position.copy(directionOf(look.rim)).multiplyScalar(KEY_DISTANCE);
    scene.add(rim);
  }

  // Thick enough, with a picture, that what's round the goal fades a little into its horizon, as
  // the picture's own nearest things do. Round the player there's none.
  scene.fog = picture
    ? new THREE.Fog(
        picture.horizon,
        Math.min(look.haze[0], PICTURE_HAZE[0]),
        Math.min(look.haze[1], PICTURE_HAZE[1]),
      )
    : new THREE.Fog(venue.haze, look.haze[0], look.haze[1]);
  return { key, rim, fill };
};

/** Sets a renderer up to draw a venue: its tone mapping and exposure, and soft shadows. */
export const prepareRenderer = (renderer: THREE.WebGLRenderer, venue: Venue) => {
  renderer.toneMapping = TONE_MAPPING;
  renderer.toneMappingExposure = lookOf(venue.id).exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
};

/**
 * The venue's surroundings as light from every direction, for shiny and rough things alike to
 * reflect and be lit by: its sky (`sky`, a copy of the dome the game draws), the ground stretching
 * away round it in its colour, lit by its sun and sky, and any bright shapes round it, like
 * floodlight banks. It's blurred into an environment map once, when the venue's built.
 */
export const venueEnvironment = (
  renderer: THREE.WebGLRenderer,
  venue: Venue,
  sky: THREE.Object3D,
): THREE.WebGLRenderTarget => {
  const look = lookOf(venue.id);
  const scene = new THREE.Scene();
  scene.add(sky);

  // The ground's colour as its own light: its colour in the sun and the sky's light together.
  const lit = new THREE.Color(venue.surround).multiplyScalar(
    (look.key.intensity * Math.sin(THREE.MathUtils.degToRad(look.key.height)) +
      look.fill.intensity) /
      Math.PI,
  );
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(400, 32),
    new THREE.MeshBasicMaterial({ color: lit, side: THREE.DoubleSide }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  for (const glow of look.glows ?? []) {
    const size = 2 * 200 * Math.tan(THREE.MathUtils.degToRad(glow.size / 2));
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * 0.6),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(glow.colour).multiplyScalar(glow.intensity),
        side: THREE.DoubleSide,
      }),
    );
    panel.position.copy(directionOf(glow)).multiplyScalar(200);
    panel.lookAt(0, 0, 0);
    scene.add(panel);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.03, 0.1, 1000, {
    size: 128,
    position: new THREE.Vector3(0, 1.5, 0),
  });
  pmrem.dispose();
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o === sky) return;
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  return target;
};
