import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { Figure } from "./crowd";
import { gltfLoader } from "./gltf";

// The crowd's figures as Meshy made them, rigged and animated with a cheer: the fans, and the
// aliens, robots and Romans. Each crowd's figures are copies of its one model, but the fans, who
// are the man and the woman (see ASSETS.md). The fans go in ./models as fan.glb and fan-woman.glb,
// and the others as crowd-<name>.glb, built by tools/crowd/build-fan.html; without its file, a
// crowd's built from shapes (see ./crowd.ts).
//
// Each figure cheers in its own time, over and over, never in step with the rest: a cheer at its
// own speed, then a pause of its own, standing and swaying a little, then another. Its skeleton's
// posed only when that changes, so a figure between cheers costs no animating. Its blue, the scarf
// (and the fan's shirt), is repainted in the kit's main colour, so the crowd wears what the player
// does, and the fan's white above the waist, its scarf's stripes, in the kit's second. Only the
// fan's, since an alien's skin, a robot's armour and a Roman's toga are pale too.

const FILES = import.meta.glob<string>(["./models/fan*.glb", "./models/crowd-*.glb"], {
  query: "?url",
  import: "default",
  eager: true,
});

/** A figure as loaded: its model, its cheer, and how high its skin reaches before it's posed. */
export interface FanModel {
  /** "fan" or "fan-woman", or the crowd-<name>.glb it came from. */
  readonly name: string;
  readonly scene: THREE.Object3D;
  readonly cheer: THREE.AnimationClip;
  /** The lowest and highest the skin reaches, in its own units, for telling the waist apart. */
  readonly bottom: number;
  readonly height: number;
}

const loading = new Map<string, Promise<FanModel | undefined>>();
const loaded = new Map<string, FanModel>();

/**
 * Loads a rigged figure, once, for its crowds to be built from: "fan" or "fan-woman", or the name
 * of a crowd-<name>.glb. Undefined if there's no file, or it can't be loaded: then that crowd's
 * built from shapes.
 */
export const riggedReady = (name: string): Promise<FanModel | undefined> => {
  let pending = loading.get(name);
  if (pending) return pending;
  pending = (async () => {
    const url =
      FILES[/^fan(-|$)/.test(name) ? `./models/${name}.glb` : `./models/crowd-${name}.glb`];
    if (!url) return undefined;
    try {
      const gltf = await gltfLoader().loadAsync(url);
      const cheer = gltf.animations.find((c) => c.name === "cheer") ?? gltf.animations[0];
      let skin: THREE.BufferGeometry | undefined;
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) skin = (o as THREE.SkinnedMesh).geometry;
      });
      if (!cheer || !skin) throw new Error(`${name} has no skinned figure, or no cheer`);
      skin.computeBoundingBox();
      const box =
        skin.boundingBox ?? new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
      const model = {
        name,
        scene: gltf.scene,
        cheer,
        bottom: box.min.y,
        height: box.max.y - box.min.y,
      };
      loaded.set(name, model);
      return model;
    } catch (error) {
      console.warn(`Couldn't load the ${name}, so its crowd's built from shapes`, error);
      return undefined;
    }
  })();
  loading.set(name, pending);
  return pending;
};

/** Loads the fans, the man and the woman (see riggedReady). */
export const fansReady = (): Promise<void> =>
  Promise.all([riggedReady("fan"), riggedReady("fan-woman")]).then(() => undefined);

/** A rigged figure, if it's loaded yet (see riggedReady). */
export const loadedRigged = (name: string): FanModel | undefined => loaded.get(name);

const FRAGMENT_HEAD = /* glsl */ `
varying float vFanUp;
uniform vec3 fanMain;
uniform vec3 fanSecond;

vec3 fanHsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
`;

/**
 * The repainting: the fan's, with its white above the waist too, or another figure's, only its
 * blue. The fan's blue is judged strictly, since its jeans are blue too; another figure's scarf is
 * its only blue, and may be paler, so it's judged loosely.
 */
const fragmentBody = (whites: boolean) => /* glsl */ `
{
  // Judged as it looks on screen. The fan's blue is about 227° round the colour wheel, and only
  // its jeans are blue too, darker, and below the waist.
  vec3 hsv = fanHsv(pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2)));
  float waist = smoothstep(0.46, 0.52, vFanUp);
  float blue = (1.0 - smoothstep(${whites ? "0.05, 0.09" : "0.08, 0.12"}, abs(hsv.x - ${whites ? "0.63" : "0.6"})))
    * smoothstep(${whites ? "0.35, 0.5" : "0.15, 0.28"}, hsv.y) * smoothstep(0.2, 0.32, hsv.z) * waist;
  // The blue's light and dark folds carry over into the kit's colour.
  float folds = pow(clamp(hsv.z / 0.7, 0.3, 1.15), 2.2);
  diffuseColor.rgb = mix(diffuseColor.rgb, fanMain * folds, blue);
  ${
    whites
      ? "float white = (1.0 - smoothstep(0.12, 0.22, hsv.y)) * smoothstep(0.62, 0.78, hsv.z) * waist;\n" +
        "  diffuseColor.rgb = mix(diffuseColor.rgb, fanSecond * folds, white);"
      : ""
  }
}
`;

/** Each figure's material in each pair of kit colours, kept, as its shader is, between rounds. */
const dressed = new Map<string, THREE.Material>();

/** A figure's own material, repainted in a kit's two main colours. */
const dressedIn = (
  model: FanModel,
  colours: readonly [string, string],
  whites: boolean,
): THREE.Material => {
  const key = `${model.name}/${colours.join("/")}`;
  const made = dressed.get(key);
  if (made) return made;
  let own: THREE.Material | undefined;
  model.scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const material = (o as THREE.SkinnedMesh).material;
    if (!Array.isArray(material)) own = material;
  });
  const material = (own ?? new THREE.MeshStandardMaterial()).clone();
  const [main, second] = colours;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fanMain = { value: new THREE.Color(main) };
    shader.uniforms.fanSecond = { value: new THREE.Color(second) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vFanUp;")
      .replace(
        "#include <begin_vertex>",
        // Before skinning, so the waist stays where it is on the body as the fan moves.
        `#include <begin_vertex>\nvFanUp = (position.y - ${model.bottom.toFixed(4)}) / ${model.height.toFixed(4)};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${fragmentBody(whites)}`);
  };
  dressed.set(key, material);
  return material;
};

/**
 * How much bigger a figure is than the crowd's built from shapes, which are a little smaller than
 * life (see crowd.ts): a fan's drawn about the player's size, and the crowd makes room for it.
 */
const GROWN = 1.3;

/** How tall the build makes every figure (see tools/crowd/build-fan.html). */
const BUILT = 1.75;

/** How a crowd's figure stands: how tall and wide, and whether its white's repainted too. */
export interface FigureSize {
  readonly height: number;
  readonly width: number;
  readonly whites: boolean;
}

/** The fan's: as tall and broad as the fans built from shapes, white scarf stripes and all. */
const FAN: FigureSize = { height: 1.75, width: 0.6, whites: true };

/** The woman's: a little shorter and slighter than the man. */
const WOMAN: FigureSize = { height: 1.68, width: 0.55, whites: true };

/** How many of a crowd of people are the woman; the rest are the man. */
const WOMEN = 0.7;

/** A repeatable number from 0 to 1 for a fan and a count: the crowd's timing, the same each game. */
const noise = (i: number, n: number) => {
  const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Which fan stands `i`th in a crowd of people, the same each game: the woman for WOMEN of them,
 * shuffled through the crowd, and the man for the rest, or whichever of them is loaded. Undefined
 * if neither is, and the crowd's built from shapes.
 */
export const fanAt = (i: number): { model: FanModel; size: FigureSize } | undefined => {
  const man = loadedRigged("fan");
  const woman = loadedRigged("fan-woman");
  if (woman && (!man || noise(i, 51) < WOMEN)) return { model: woman, size: WOMAN };
  return man && { model: man, size: FAN };
};

/**
 * The `i`th figure in a crowd, a copy of the model in the kit's two main colours: a little taller
 * or shorter than the last, turned a little differently, swaying, and cheering in its own time.
 */
export const meshyFan = (
  i: number,
  colours: readonly [string, string],
  model: FanModel,
  size: FigureSize = FAN,
): Figure => {
  const object = clone(model.scene);
  const material = dressedIn(model, colours, size.whites);
  object.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.material = material;
    // Its arms go up past where its box was worked out, standing still.
    o.frustumCulled = false;
  });
  const grown = (GROWN * size.height) / BUILT;
  object.scale.setScalar(grown * (0.95 + ((i * 7) % 5) * 0.025));
  object.rotation.y = (((i * 37) % 11) / 10 - 0.5) * 0.4;
  const mixer = new THREE.AnimationMixer(object);
  const cheer = mixer.clipAction(model.cheer);
  cheer.setLoop(THREE.LoopOnce, 1);
  cheer.clampWhenFinished = true;
  cheer.play();
  const phase = i * 1.7;
  const { duration } = model.cheer;
  /** How fast this fan cheers, and how long each of its cheers takes. */
  const speed = 0.85 + noise(i, 0) * 0.35;
  const length = duration / speed;
  /** How long it stands between its `n`th cheer and the next. */
  const pause = (n: number) => 0.3 + noise(i, n + 1) * 2.2;
  /** When its current cheer started, and how many it's had: the first some way into the round. */
  let start = noise(i, -1) * 3;
  let cheers = 0;
  /** How far into the cheer the skeleton's posed, so it's posed again only when that changes. */
  let posed = Number.NaN;
  return {
    object,
    bounds: { width: size.width * GROWN, bottom: 0, top: (size.height + 0.03) * GROWN },
    shadow: (size.width + 0.05) * GROWN,
    pose: (seconds) => {
      // On to whichever cheer it's at now, since it's posed only while it's in view.
      while (seconds >= start + length + pause(cheers)) {
        start += length + pause(cheers);
        cheers++;
      }
      // Cheering, or standing as the cheer starts while it waits for the next.
      const into = seconds - start;
      const at = into >= 0 && into < length ? into * speed : 0;
      if (at !== posed) {
        mixer.setTime(at);
        posed = at;
      }
      object.rotation.z = Math.sin(seconds * 1.3 + phase) * 0.02;
    },
  };
};
