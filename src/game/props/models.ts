import * as THREE from "three";
import type { VenueId } from "../../venues";
import { gltfLoader } from "../gltf";
import type { Scenery } from "../scenery";
import { shadowTexture } from "../textures";

// Each venue's own Meshy model, where it has one: a tree at the park, palms at the beach, pines in
// the snow, a lunar lander on the Moon. Each is made in Meshy at about 5,000
// triangles and built 1 m tall by tools/props/build.html into ../models as prop-<name>.glb (see
// ASSETS.md). Copies of it stand behind the goal line either side, framing the goal at the edges
// of a phone held upright, with more further out for a wider screen: clear of the lanes, and of
// the crowd, which stands no further than 24 m out. Each is a draw call, with a soft shadow under
// it. Without its file, a venue's as it was. Units are metres; the goal is down -Z, 30 m away.

const FILES = import.meta.glob<string>("../models/prop-*.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

/** Where a copy stands: across and down the pitch, how tall, and turned how far round. */
interface Spot {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly turn: number;
}

interface Placing {
  /** The prop's name: its file is prop-<name>.glb. */
  readonly prop: string;
  readonly spots: readonly Spot[];
  /** How wide its shadow is, for each metre it stands. */
  readonly shadow: number;
  /** A colour its own is multiplied by, to sit with the backdrop's: Meshy's can be too bright. */
  readonly tint?: number;
  /** How far it sways in the breeze (or the current), in radians, if it's a growing thing. */
  readonly sway?: number;
}

/**
 * Four copies of something that grows, like trees: either side of the goal, then out wider and a
 * little nearer, as the beach's palms stand.
 */
const flanks = (heights: readonly [number, number, number, number]): readonly Spot[] => [
  { x: -6.2, z: -31.5, height: heights[0], turn: 0.4 },
  { x: 6.6, z: -32.5, height: heights[1], turn: 2.3 },
  { x: -10.5, z: -27.5, height: heights[2], turn: 4.1 },
  { x: 10.8, z: -28, height: heights[3], turn: 1.2 },
];

/**
 * Four copies of something small, like rocks or coral: just outside the posts, where a phone held
 * upright sees them whole, then out wider.
 */
const nearFlanks = (heights: readonly [number, number, number, number]): readonly Spot[] => [
  { x: -4.9, z: -31, height: heights[0], turn: 0.4 },
  { x: 5.2, z: -31.8, height: heights[1], turn: 2.3 },
  { x: -8.2, z: -28, height: heights[2], turn: 4.1 },
  { x: 8.6, z: -28.5, height: heights[3], turn: 1.2 },
];

/**
 * More copies along the backdrop's foot, out to the sides from `from` metres every `step`, one each
 * side for each height: they stand where the floor meets the backdrop, and hide the join where a
 * wider screen sees it, and at the edges of one held upright.
 */
const alongFoot = (heights: readonly number[], from = 8, step = 4): readonly Spot[] =>
  heights.flatMap((height, i) =>
    [-1, 1].map((side) => ({
      x: side * (from + i * step),
      z: -33.4,
      height,
      turn: i * 1.7 + side,
    })),
  );

/**
 * A pair either side of the goal, turned in a little towards it. Tall ones are short enough that
 * what's at the top, like a tower's lamps, shows under the score on a phone held upright.
 */
const pair = (height: number, x = 5.7, z = -32.5): readonly Spot[] => [
  { x: -x, z, height, turn: 0.3 },
  { x, z, height, turn: -0.3 },
];

const PLACES: Partial<Record<VenueId, Placing>> = {
  park: {
    prop: "park-tree",
    sway: 0.012,
    // Irregular along the foot, as trees grow, rather than in a row.
    spots: [
      ...flanks([7.5, 8.2, 6.8, 7.2]),
      { x: -8.6, z: -33.2, height: 6.4, turn: 2.2 },
      { x: 9.2, z: -33.6, height: 7.8, turn: 0.9 },
      { x: -13.4, z: -32.6, height: 8.4, turn: 4.4 },
      { x: 14.1, z: -33.1, height: 6.1, turn: 3.3 },
      { x: -18.6, z: -33.5, height: 7.1, turn: 1.6 },
      { x: 19.4, z: -32.8, height: 7.9, turn: 5.1 },
    ],
    shadow: 0.5,
    // Meshy's leaves are a bright lime beside the backdrop's photographed trees.
    tint: 0x8e9c7e,
  },
  beach: {
    prop: "beach-palm",
    sway: 0.02,
    spots: [...flanks([7.4, 8, 6.8, 6.4]), ...alongFoot([7.2, 6.6, 7.8, 6.8], 13)],
    shadow: 0.35,
  },
  snow: {
    prop: "snow-pine",
    sway: 0.008,
    spots: [...flanks([6.5, 7.2, 5.8, 6.2]), ...alongFoot([6, 6.8, 5.6, 6.4])],
    shadow: 0.4,
  },
  moon: { prop: "moon-lander", spots: [{ x: -6.4, z: -31, height: 4.2, turn: 0.7 }], shadow: 0.7 },
  underwater: {
    prop: "underwater-coral",
    sway: 0.035,
    spots: [...nearFlanks([2, 2.4, 1.8, 2]), ...alongFoot([1.6, 2, 1.4, 1.8], 6.6, 3.5)],
    shadow: 0.8,
  },
  // Great spires of lava rock, as tall as the trees elsewhere, so they stand out against the
  // picture's mountains: out where the trees stand, clear of the posts, and along the foot.
  volcano: {
    prop: "volcano-rock",
    spots: [...flanks([5, 5.8, 4.4, 4.8]), ...alongFoot([3.4, 4.2, 3, 3.8, 3.2], 8.5, 3.5)],
    shadow: 0.9,
  },
  // A rover parked beside the goal, nosing in towards it.
  mars: { prop: "mars-rover", spots: [{ x: -5.6, z: -31, height: 2.2, turn: 0.9 }], shadow: 1.2 },
  space: { prop: "space-pylon", spots: pair(11), shadow: 0.15 },
  funfair: { prop: "funfair-stall", spots: pair(3.4, 5.6, -31.5), shadow: 0.9 },
  castle: {
    prop: "castle-tree",
    sway: 0.006,
    spots: [...flanks([6.5, 7, 6, 6.2]), ...alongFoot([6.2, 6.8, 5.8])],
    shadow: 0.4,
  },
  colosseum: {
    prop: "colosseum-column",
    spots: [...flanks([6, 5.5, 6.5, 5.8]), ...alongFoot([6.2, 5.6, 6], 14, 5)],
    shadow: 0.25,
  },
  // The cup itself, giant, on its plinth beside the goal, for the winners.
  final: {
    prop: "final-trophy",
    spots: [{ x: 5.4, z: -31, height: 3.2, turn: -0.3 }],
    shadow: 0.4,
  },
};

const loaded = new Map<string, THREE.Object3D>();
const loading = new Map<string, Promise<void>>();

/**
 * Loads a venue's prop, once, if it has one. Build its scenery once this has resolved (see
 * ../scenery.ts). A prop that can't be loaded is left out.
 */
export const venuePropReady = (venue: VenueId): Promise<void> => {
  const place = PLACES[venue];
  const url = place && FILES[`../models/prop-${place.prop}.glb`];
  if (!place || !url) return Promise.resolve();
  let pending = loading.get(place.prop);
  if (!pending) {
    pending = gltfLoader()
      .loadAsync(url)
      .then(
        (gltf) => {
          const { tint } = place;
          if (tint !== undefined) {
            gltf.scene.traverse((o) => {
              const material = (o as Partial<THREE.Mesh>).material;
              if (material instanceof THREE.MeshStandardMaterial) material.color.set(tint);
            });
          }
          loaded.set(place.prop, gltf.scene);
        },
        (error: unknown) => {
          console.warn(`Couldn't load prop-${place.prop}.glb, so ${venue} goes without it`, error);
        },
      );
    loading.set(place.prop, pending);
  }
  return pending;
};

/** Whether a venue's prop has loaded, so what it replaces can be left out. */
export const hasVenueProp = (venue: VenueId): boolean => {
  const place = PLACES[venue];
  return place !== undefined && loaded.has(place.prop);
};

/**
 * A venue's prop in its places, each copy with a soft shadow under it, and the growing ones swaying,
 * each in its own time; or undefined if it has none or it hasn't loaded. It's named "props", for
 * the beach's twist, whose gusts lean them (see ../twists/beach.ts).
 */
export const placedProps = (venue: VenueId): Scenery | undefined => {
  const place = PLACES[venue];
  const model = place && loaded.get(place.prop);
  if (!place || !model) return undefined;
  const object = new THREE.Group();
  object.name = "props";
  const shade = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  const square = new THREE.PlaneGeometry(1, 1);
  const copies = place.spots.map(({ x, z, height, turn }) => {
    const prop = model.clone();
    prop.scale.setScalar(height);
    // Leaning last, once it's turned, so a lean across the pitch is across it whichever way it faces.
    prop.rotation.order = "ZYX";
    prop.rotation.y = turn;
    prop.position.set(x, 0, z);
    const shadow = new THREE.Mesh(square, shade);
    shadow.rotation.x = -Math.PI / 2;
    // Over the floor's picture and its chalk (see ../ground.ts).
    shadow.position.set(x, 0.02, z);
    shadow.scale.setScalar(height * place.shadow);
    object.add(prop, shadow);
    return prop;
  });
  const { sway } = place;
  return {
    object,
    update: (seconds) => {
      if (!sway) return;
      // Each about its foot, in its own time, gusting now and then, and leaning with any wind a
      // twist has blowing: the beach's gusts (see ../twists/beach.ts).
      const lean = (object.userData.lean as number | undefined) ?? 0;
      copies.forEach((prop, i) => {
        const gust = 1 + 0.6 * Math.max(0, Math.sin(seconds * 0.23 + i * 2.1));
        prop.rotation.z = Math.sin(seconds * 0.9 + i * 1.7) * sway * gust + lean;
        prop.rotation.x = Math.sin(seconds * 0.7 + i * 2.9) * sway * 0.5 * gust;
      });
    },
  };
};
