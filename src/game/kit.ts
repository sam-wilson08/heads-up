import * as THREE from "three";
import type { Kit, Pattern } from "../kits";

// Dresses the player in a kit. The model comes in Italy's blue shirt with a white collar, white
// shorts and blue socks, painted onto a texture that's cut into scraps all over the image, so
// there's nowhere to draw a stripe on it. Instead the shader finds the kit by its colour, tells the
// shirt, shorts and socks apart by how high up the body they are, and paints over them. Stripes and
// hoops are laid out by where they are on the standing body, so they bend with it when the player
// leans. The blue's and the white's light and dark folds carry over into the new colours.

/** Heights up the player, in metres, where its kit changes. */
const HEIGHT = {
  /** Blue below here is the socks. Above it, down to the shirt, there's no blue. */
  sockTops: 0.53,
  /** No white below here is kit: it's the stripes on the boots. */
  thighs: 0.64,
  /** Blue above here is the shirt. Below it, down to the socks, only the shorts are kit. */
  hem: 1.02,
  /** White below here, down to the thighs, is the shorts; above it, the creases in the shirt. */
  waistband: 1.1,
  /** White above here is the collar. */
  collar: 1.37,
  /** Nothing above here is kit: it's the face and hair, and the whites of the eyes. */
  neck: 1.57,
} as const;
/** How far out from the middle the shorts reach, short of the hands hanging beside them. */
const HIPS = 0.3;

const STRIPE_WIDTH = 0.05;
/** Where the band's hoops start across the chest, and how deep each one is: under the name. */
const BAND = { top: 1.3, hoop: 0.03 };
/** How bright the model's blue and white are in the light, where their colour is unshaded. */
const BRIGHTNESS = { blue: 0.6, white: 0.97 } as const;

const PATTERNS: Record<Pattern, number> = { plain: 0, stripes: 1, halves: 2, band: 3 };
/** The most colours a shirt has: a band's base and four hoops. */
const SHIRT_COLOURS = 5;

const VERTEX_HEAD = /* glsl */ `
varying vec3 vKitPosition;
`;

const VERTEX_BODY = /* glsl */ `
// Before skinning, so the kit stays put on the body as it leans.
vKitPosition = position;
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vKitPosition;
uniform int kitPattern;
uniform vec3 kitShirt[${SHIRT_COLOURS}];
uniform vec3 kitTrim;
uniform vec3 kitShorts;
uniform vec3 kitSocks;

vec3 kitHsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

/** How far a hue is from another, the short way round the colour wheel, from 0 to 0.5. */
float kitHueFrom(float hue, float target) {
  return abs(fract(hue - target + 0.5) - 0.5);
}
`;

const FRAGMENT_BODY = /* glsl */ `
{
  vec3 p = vKitPosition;
  // Judged as it looks on screen, not in the light's linear units.
  vec3 hsv = kitHsv(pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2)));
  // The kit is a strong royal blue, about 221° round the colour wheel, and white. The skin and hair
  // are orange and brown, a long way round from the blue, and too strong a colour to be white.
  // Where the blue meets the white or the skin, they blur into a paler blue, which counts as blue.
  // The boots are black with white stripes, and the blue goes right down into them, so blue is kit
  // all the way down, and white only from the thighs up. Between the socks and the shirt, the
  // only kit is the shorts, between the hands hanging beside them.
  float blue = (1.0 - smoothstep(0.06, 0.12, kitHueFrom(hsv.x, 0.615)))
    * smoothstep(0.12, 0.25, hsv.y) * smoothstep(0.06, 0.12, hsv.z)
    * max(step(p.y, ${HEIGHT.sockTops}), step(${HEIGHT.hem}, p.y));
  float white = (1.0 - smoothstep(0.12, 0.22, hsv.y)) * smoothstep(0.5, 0.7, hsv.z)
    * step(${HEIGHT.thighs}, p.y) * max(step(abs(p.x), ${HIPS}), step(${HEIGHT.hem}, p.y));
  float kit = max(blue, white) * step(p.y, ${HEIGHT.neck});
  // How far from the blue to the white: the blurred edges are in between.
  float pale = 1.0 - smoothstep(0.12, 0.7, hsv.y);

  // Every pattern is worked out, then one picked, because blurring their edges by how wide a pixel
  // is (fwidth) only works outside if-statements.
  float wave = abs(fract(p.x / ${2 * STRIPE_WIDTH}) * 2.0 - 1.0);
  float stripe = smoothstep(0.5 - fwidth(wave), 0.5 + fwidth(wave), wave);
  float right = smoothstep(-fwidth(p.x), fwidth(p.x), p.x);
  float hoop = (${BAND.top} - p.y) / ${BAND.hoop};
  vec3 shirt = kitShirt[0];
  if (kitPattern == ${PATTERNS.stripes}) shirt = mix(kitShirt[1], kitShirt[0], stripe);
  else if (kitPattern == ${PATTERNS.halves}) shirt = mix(kitShirt[1], kitShirt[0], right);
  else if (kitPattern == ${PATTERNS.band} && hoop >= 0.0 && hoop < 4.0) {
    shirt = kitShirt[1 + int(hoop)];
  }

  // The folds are how much lighter or darker it is than the blue or the white in full light, or
  // something in between on a blurred edge. Where the blue and the white become different parts
  // of the kit, at the waist and the collar, the edge blurs between their new colours too.
  float folds = pow(
    clamp(hsv.z / mix(${BRIGHTNESS.blue}, ${BRIGHTNESS.white}, pale), 0.3, 1.15),
    2.2
  );
  vec3 blueTo = p.y < ${HEIGHT.sockTops} ? kitSocks : shirt;
  vec3 whiteTo = p.y < ${HEIGHT.sockTops} ? kitSocks
    : p.y < ${HEIGHT.waistband} ? kitShorts
    : p.y < ${HEIGHT.collar} ? shirt
    : kitTrim;
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(blueTo, whiteTo, pale) * folds, kit);
}
`;

/** A copy of the material that paints the kit over the model's own. */
const dressed = (material: THREE.Material, kit: Kit): THREE.Material => {
  const shirt = Array.from(
    { length: SHIRT_COLOURS },
    (_, i) => new THREE.Color(kit.shirt[i] ?? kit.shirt[0]),
  );
  const copy = material.clone();
  copy.onBeforeCompile = (shader) => {
    shader.uniforms.kitPattern = { value: PATTERNS[kit.pattern] };
    shader.uniforms.kitShirt = { value: shirt };
    shader.uniforms.kitTrim = { value: new THREE.Color(kit.trim) };
    shader.uniforms.kitShorts = { value: new THREE.Color(kit.shorts) };
    shader.uniforms.kitSocks = { value: new THREE.Color(kit.socks) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${FRAGMENT_BODY}`);
  };
  return copy;
};

let cutTexture: THREE.DataTexture | undefined;

/**
 * One pixel of normal map, the same tilt everywhere. three.js finds each triangle's tilt from how
 * its piece of the model's picture lies on it, and the picture's cut into scraps every which way,
 * so the same tilt turns each triangle a different way: facets, like a cut stone's.
 */
const cut = (): THREE.DataTexture => {
  if (!cutTexture) {
    cutTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    cutTexture.needsUpdate = true;
  }
  return cutTexture;
};

/**
 * The diamond finish, for the whole player: every one of the model's triangles a facet, tilted its
 * own way, and each a polished metal, mirroring the piece of the venue it faces: its sky, ground
 * and lights, as the scene's environment has them (see look.ts). A pale, icy white, so the venue's
 * own colours come through. None of the model's own pictures, so nothing smooths it over.
 */
const diamond = (): THREE.Material =>
  new THREE.MeshStandardMaterial({
    color: "#f4f8ff",
    metalness: 0.6,
    roughness: 0.25,
    normalMap: cut(),
  });

/**
 * Puts the player in a kit. Their materials are swapped for painted copies, or for a diamond kit,
 * for diamond, so the loaded model, which every game shares, keeps its own. Every cloth kit shares
 * one shader; only its colours change.
 */
export const wearKit = (body: THREE.Object3D, kit: Kit): THREE.Object3D => {
  const cut = kit.finish === "diamond" ? diamond() : undefined;
  body.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as THREE.Mesh;
    if (!Array.isArray(mesh.material)) mesh.material = cut ?? dressed(mesh.material, kit);
  });
  return body;
};
