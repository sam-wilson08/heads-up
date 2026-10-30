import * as THREE from "three";
import { gltfLoader } from "../gltf";

// The great white that swims across the pitch Underwater, in front of what's coming, hiding it as
// it passes (see ../twists/underwater.ts). It's Meshy's model, built by tools/props/shark.html into
// ../models/prop-shark.glb: lying along +X, nose first, 1 m long and centred on the origin. Its
// tail sweeps from side to side as it swims, bent in its shader, so it's still one draw.

const FILES = import.meta.glob<string>("../models/prop-shark.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

let model: THREE.Object3D | undefined;
let loading: Promise<void> | undefined;

/** Loads the shark, once. Without its file, or if it can't be loaded, there's no shark. */
export const sharkReady = (): Promise<void> => {
  const url = FILES["../models/prop-shark.glb"];
  if (!url) return Promise.resolve();
  loading ??= gltfLoader()
    .loadAsync(url)
    .then(
      (gltf) => {
        model = gltf.scene;
      },
      (error: unknown) => {
        console.warn("Couldn't load the shark, so Underwater goes without it", error);
        loading = undefined;
      },
    );
  return loading;
};

/** A shark, if it's loaded, `length` metres long, with how far its tail's swept, to set each frame. */
export const buildShark = (
  length: number,
): { readonly object: THREE.Object3D; readonly time: { value: number } } | undefined => {
  if (!model) return undefined;
  const object = model.clone();
  object.scale.setScalar(length);
  const time = { value: 0 };
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
    const material = o.material.clone();
    // Each point swings across, more the further back it is from the head, in a wave that runs
    // down the body to the tail, and the head a little the other way, as a shark swims: about a
    // stroke a second, the tail's tip sweeping a sixth of its length either side. The model's own
    // units: x from the tail at -0.5 to the nose at 0.5.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.swimTime = time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float swimTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float back = clamp(0.3 - position.x, 0.0, 1.0);
          float head = clamp(position.x - 0.2, 0.0, 1.0);
          transformed.z += sin(swimTime * 6.0 - position.x * 7.0) * 0.26 * back * back
            - sin(swimTime * 6.0) * 0.12 * head;`,
        );
    };
    material.customProgramCacheKey = () => "shark";
    o.material = material;
  });
  return { object, time };
};
