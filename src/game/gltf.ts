import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The loader every model in the game is loaded with: the player, the crowds' figures and the
// venues' props. On Safari, three's GLTFLoader decodes a model's pictures to ImageBitmaps, and on
// an iPhone those have come back blank for a model's normal and metal maps, which turns it chrome
// and faceted. As plain images, Safari decodes them as it does every other picture on the page.

/** Safari, as three's GLTFLoader tells it apart: WebKit, without Chrome's or Android's name. */
const SAFARI =
  typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/** A GLTFLoader that, on Safari, loads a model's pictures as plain images. */
export const gltfLoader = (): GLTFLoader => {
  const loader = new GLTFLoader();
  if (SAFARI) {
    loader.register((parser) => {
      parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
      return { name: "heads-up-plain-images" };
    });
  }
  return loader;
};
