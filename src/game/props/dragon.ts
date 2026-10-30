import * as THREE from "three";
import { gltfLoader } from "../gltf";

// Sakura Peak's dragon, as Meshy made it, built by tools/props/dragon.html into
// ../models/prop-dragon.glb: dead straight along +X, head first, its back up +Y, 1 m long and
// centred on the origin. The twist bends it along its flight (see ../twists/dragon.ts); without
// its file, the dragon's built from shapes instead.

const FILES = import.meta.glob<string>("../models/prop-dragon.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

let model: THREE.Mesh | undefined;
let loading: Promise<void> | undefined;

/** Loads the dragon, once. Without its file, or if it can't be loaded, it's built from shapes. */
export const dragonReady = (): Promise<void> => {
  const url = FILES["../models/prop-dragon.glb"];
  if (!url) return Promise.resolve();
  loading ??= gltfLoader()
    .loadAsync(url)
    .then(
      (gltf) => {
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) model ??= o;
        });
      },
      (error: unknown) => {
        console.warn("Couldn't load the dragon, so it's built from shapes", error);
        loading = undefined;
      },
    );
  return loading;
};

/** The dragon's mesh, if it's loaded: shared, so a copy of its material's for bending. */
export const dragonModel = (): THREE.Mesh | undefined => model;
