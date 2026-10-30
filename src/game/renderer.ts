import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Quality } from "./quality";

// The game's one WebGL renderer, kept from round to round. A renderer for each round meant a new
// WebGL context each time, which phones are slow to free (Safari can refuse new ones after a
// while), and every shader compiled again, which is most of the wait before a round. Kept, the
// shaders a round compiled are ready for the next one, and its canvas moves into each new round.

interface Made {
  readonly renderer: THREE.WebGLRenderer;
  readonly antialias: boolean;
  lost: boolean;
  /** A softly lit room for shiny things to reflect, made once (see roomEnvironment). */
  room?: THREE.WebGLRenderTarget;
}

let made: Made | undefined;

/** The shaders kept for later rounds, each with a hold on it of its own. */
const kept = new WeakSet<object>();
/** Batches already freed, which can't be freed twice. */
const freed = new WeakSet<THREE.BatchedMesh>();

/**
 * The game's renderer, set up for a round at a quality. Multisampling is fixed when a renderer's
 * made, so a round at a quality that wants the other kind gets a new one.
 */
export const gameRenderer = (quality: Quality): THREE.WebGLRenderer => {
  if (made && (made.lost || made.antialias !== quality.antialias)) {
    made.room?.dispose();
    made.renderer.dispose();
    if (!made.lost) made.renderer.forceContextLoss();
    made = undefined;
  }
  if (!made) {
    const canvas = document.createElement("canvas");
    canvas.className = "play-canvas";
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      // The hurdles' ghosts draw only over the player, where the stencil marks (see scene.ts).
      stencil: true,
      powerPreference: "high-performance",
    });
    // Checking every shader for errors makes the browser wait for each to compile. They're
    // checked while developing.
    renderer.debug.checkShaderErrors = import.meta.env.DEV;
    const fresh: Made = { renderer, antialias: quality.antialias, lost: false };
    // If the phone takes the GPU back, the next round makes a new renderer.
    canvas.addEventListener("webglcontextlost", () => {
      fresh.lost = true;
    });
    made = fresh;
  }
  const { renderer } = made;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.autoUpdate = true;
  renderer.setRenderTarget(null);
  return renderer;
};

/**
 * A softly lit room for the shiny things to reflect: the gold ball, the stopwatch, the hat band.
 * Made once for the game's renderer and kept, since it's the same every round.
 */
export const roomEnvironment = (
  renderer: THREE.WebGLRenderer,
): { readonly texture: THREE.Texture; dispose(): void } => {
  const bake = () => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return target;
  };
  if (made?.renderer === renderer) {
    made.room ??= bake();
    return { texture: made.room.texture, dispose: () => undefined };
  }
  // A renderer of its own, as the venue previews make, frees its own.
  const target = bake();
  return { texture: target.texture, dispose: () => target.dispose() };
};

/** Whether a renderer is the game's own, kept from round to round. */
export const isGameRenderer = (renderer: THREE.WebGLRenderer): boolean =>
  made?.renderer === renderer;

/**
 * Keeps every shader the renderer has compiled so far for the rounds after, even once the round
 * that compiled it lets go of its materials. three.js frees a shader when nothing uses it; this
 * holds on to each, so the next round finds it ready.
 */
export const keepShaders = (renderer: THREE.WebGLRenderer): void => {
  if (!isGameRenderer(renderer)) return;
  for (const program of renderer.info.programs ?? []) {
    if (kept.has(program)) continue;
    kept.add(program);
    program.usedTimes++;
  }
};

/** Every texture a material draws with, apart from the ones a render target owns. */
const texturesOf = (material: THREE.Material, into: Set<THREE.Texture>) => {
  const values: unknown[] = Object.values(material);
  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) values.push(uniform.value);
  }
  for (const value of values) {
    if (value instanceof THREE.Texture && !value.isRenderTargetTexture) {
      into.add(value as THREE.Texture);
    }
  }
};

/** Every texture drawn by anything in a scene, including what's hidden. */
export const texturesIn = (root: THREE.Object3D): Set<THREE.Texture> => {
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const material = (o as Partial<THREE.Mesh>).material;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) texturesOf(m, textures);
  });
  return textures;
};

/**
 * Frees what a finished round left on the GPU, while the renderer lives on: its shapes, its
 * pictures and its shadow maps, apart from pictures in `keep`, which the next round shares.
 * Materials are left, so the shaders they compiled are kept.
 */
export const freeScene = (scene: THREE.Scene, keep?: ReadonlySet<THREE.Texture>): void => {
  for (const texture of texturesIn(scene)) if (!keep?.has(texture)) texture.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.BatchedMesh) {
      // Its own pictures of where each copy is go with it. It can only be freed once.
      if (!freed.has(o)) o.dispose();
      freed.add(o);
    } else if ("geometry" in o && o.geometry instanceof THREE.BufferGeometry) {
      o.geometry.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    }
    // An animated model's bones are a picture of their own, one for each of the crowd's Meshy fans.
    // three makes it again the next time a skeleton's drawn, so the player's carries on.
    if (o instanceof THREE.SkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
    // A shadow-casting light's shadow map is a render target of its own.
    if (o instanceof THREE.DirectionalLight || o instanceof THREE.SpotLight) o.shadow.dispose();
    else if (o instanceof THREE.PointLight) o.shadow.dispose();
  });
  if (scene.background instanceof THREE.Texture && !scene.background.isRenderTargetTexture) {
    scene.background.dispose();
  }
};
