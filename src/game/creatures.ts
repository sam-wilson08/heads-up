import * as THREE from "three";
import type { Crowd } from "../venues";
import type { Figure } from "./crowd";
import { fansReady, type FigureSize, loadedRigged, meshyFan, riggedReady } from "./fans";
import { gltfLoader } from "./gltf";

// The crowds' figures that Meshy made. Those that stand still, not rigged, are here: penguins,
// fish and ghosts. Each is made in Meshy 6 at about 5,000 triangles and built 1 m tall by
// tools/props/build.html into ./models as crowd-<name>.glb (see ASSETS.md); without it, that crowd
// is built from shapes (see ./crowd.ts). Every figure is a copy of the one model, a draw call
// each, a little bigger than life, as the fans are, and hops and sways in its own time, never in
// step with the rest. Each wears a blue and white scarf: its blue is repainted in the kit's main
// colour. Only the blue, since a penguin's belly and a ghost are white too. The rigged ones, the
// aliens, robots and Romans, cheer as the fans do (see ./fans.ts).

/** The crowds whose Meshy figures are rigged, by model, and how each stands. */
const RIGGED: Partial<Record<Crowd, { readonly model: string; readonly size: FigureSize }>> = {
  aliens: { model: "alien", size: { height: 1.45, width: 0.62, whites: false } },
  robots: { model: "robot", size: { height: 1.6, width: 0.66, whites: false } },
  romans: { model: "roman", size: { height: 1.75, width: 0.6, whites: false } },
};

const FILES = import.meta.glob<string>("./models/crowd-*.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

interface Kind {
  /** The model's name: its file is crowd-<name>.glb. */
  readonly model: string;
  /** How tall it is, and how far off the ground, as a fish swims or a ghost floats. */
  readonly height: number;
  readonly lift: number;
  /** How wide its shadow is, for each metre it stands, or 0 for none. */
  readonly shadow: number;
}

/** Each crowd Meshy's made, as big as the crowd's own built from shapes. */
const KINDS: Partial<Record<Crowd, Kind>> = {
  penguins: { model: "penguin", height: 1.3, lift: 0, shadow: 0.5 },
  fish: { model: "fish", height: 0.6, lift: 0.9, shadow: 0 },
  ghosts: { model: "ghost", height: 1.65, lift: 0.3, shadow: 0.35 },
};

/** How much bigger a figure is than life, as the fans are, so it stands about the player's size. */
const GROWN = 1.3;

const loaded = new Map<string, THREE.Object3D>();
const loading = new Map<string, Promise<void>>();

/**
 * Loads what a crowd's built from, once: the fans for people, or Meshy's figure for the crowds it's
 * made. Build the crowd once this has resolved. One that can't be loaded is built from shapes.
 */
export const crowdReady = (crowd: Crowd): Promise<void> => {
  if (crowd === "people") return fansReady();
  const rigged = RIGGED[crowd];
  if (rigged) return riggedReady(rigged.model).then(() => undefined);
  const kind = KINDS[crowd];
  const url = kind && FILES[`./models/crowd-${kind.model}.glb`];
  if (!kind || !url) return Promise.resolve();
  let pending = loading.get(kind.model);
  if (!pending) {
    pending = gltfLoader()
      .loadAsync(url)
      .then(
        (gltf) => {
          loaded.set(kind.model, gltf.scene);
        },
        (error: unknown) => {
          console.warn(`Couldn't load crowd-${kind.model}.glb, so it's built from shapes`, error);
        },
      );
    loading.set(kind.model, pending);
  }
  return pending;
};

/** A repeatable number from 0 to 1 for a figure and a count: the crowd's timing, every game. */
const noise = (i: number, n: number) => {
  const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 creatureKit;

vec3 creatureHsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
`;

const FRAGMENT_BODY = /* glsl */ `
{
  // Judged as it looks on screen: the scarf's blue, about 215° round the colour wheel, and judged
  // loosely, pale or strong, since it's the only blue the figure has.
  vec3 hsv = creatureHsv(pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2)));
  float blue = (1.0 - smoothstep(0.08, 0.12, abs(hsv.x - 0.6)))
    * smoothstep(0.15, 0.28, hsv.y) * smoothstep(0.2, 0.32, hsv.z);
  // The blue's light and dark folds carry over into the kit's colour.
  float folds = pow(clamp(hsv.z / 0.7, 0.3, 1.15), 2.2);
  diffuseColor.rgb = mix(diffuseColor.rgb, creatureKit * folds, blue);
}
`;

/** Each figure's material in each kit colour, kept, as its shader is, from round to round. */
const dressed = new Map<string, THREE.Material>();

const dressedIn = (
  kind: Kind,
  model: THREE.Object3D,
  colour: string,
): THREE.Material | undefined => {
  const key = `${kind.model}/${colour}`;
  const made = dressed.get(key);
  if (made) return made;
  let own: THREE.Material | undefined;
  model.traverse((o) => {
    const material = (o as Partial<THREE.Mesh>).material;
    if (material && !Array.isArray(material)) own = material;
  });
  if (!own) return undefined;
  const material = own.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.creatureKit = { value: new THREE.Color(colour) };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${FRAGMENT_BODY}`);
  };
  dressed.set(key, material);
  return material;
};

/**
 * The `i`th of a crowd's Meshy figures, its scarf in the kit's colours, or undefined if that crowd
 * hasn't one loaded (see crowdReady). `outside` is the side away from the pitch, +1 for +X, which
 * a fish swims in from.
 */
export const meshyCreature = (
  crowd: Crowd,
  i: number,
  colours: readonly [string, string],
  outside: number,
): Figure | undefined => {
  const rigged = RIGGED[crowd];
  if (rigged) {
    const model = loadedRigged(rigged.model);
    return model && meshyFan(i, colours, model, rigged.size);
  }
  const kind = KINDS[crowd];
  const model = kind && loaded.get(kind.model);
  if (!kind || !model) return undefined;
  const material = dressedIn(kind, model, colours[0]);
  const figure = model.clone();
  figure.traverse((o) => {
    if (material && (o as Partial<THREE.Mesh>).material) (o as THREE.Mesh).material = material;
  });
  const height = kind.height * GROWN * (0.92 + noise(i, -2) * 0.16);
  figure.scale.setScalar(height);
  figure.rotation.y = (noise(i, -3) - 0.5) * 0.5;
  // A fish swims across, in towards the pitch, side on to the player, where Meshy's faces them.
  if (crowd === "fish") figure.rotation.y += (-outside * Math.PI) / 2;
  // The crowd stands the figure; its own hops and sways move what's inside.
  const object = new THREE.Group();
  object.add(figure);
  const box = new THREE.Box3().setFromObject(figure);
  const phase = i * 1.7;
  /** How long each of its hops takes, and how long it waits between its `n`th and the next. */
  const hop = 0.4 + noise(i, 0) * 0.15;
  const pause = (n: number) => 0.4 + noise(i, n + 1) * 2.4;
  let start = noise(i, -1) * 3;
  let hops = 0;
  return {
    object,
    bounds: {
      width: box.max.x - box.min.x,
      bottom: kind.lift * GROWN,
      top: kind.lift * GROWN + height,
    },
    shadow: kind.shadow * height,
    pose: (seconds) => {
      while (seconds >= start + hop + pause(hops)) {
        start += hop + pause(hops);
        hops++;
      }
      const into = seconds - start;
      const up = into >= 0 && into < hop ? Math.sin((into / hop) * Math.PI) * 0.35 : 0;
      // A swimmer or a floater bobs as well, in its own time.
      const bob = kind.lift > 0 ? Math.sin(seconds * 1.6 + phase) * 0.08 : 0;
      figure.position.y = kind.lift * GROWN + up + bob;
      figure.rotation.z = Math.sin(seconds * 1.3 + phase) * 0.04;
    },
  };
};
