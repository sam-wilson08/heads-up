import * as THREE from "three";
import type { Venue } from "../venues";
import { directionOf, lookOf } from "./look";

// The sky: a dome shaded as air is, deepening overhead and paling into the haze along the horizon,
// brighter towards the sun wherever it is, with the venue's sun or glow if it shows, and for venues
// with weather a layer of cumulus a kilometre and a half up, drifting, lit on the sun's side and
// grey beneath, and thinning into the haze towards the horizon as real cloud does. The sky is the
// picture's backdrop, so it's drawn in the screen's own colours rather than through the tone
// mapping, and the haze at the horizon is exactly the colour the distance fades into. Units are
// metres; the goal is down -Z.

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDirection = world.xyz - cameraPosition;
    vec4 clip = projectionMatrix * viewMatrix * world;
    // On the far plane, so it's behind everything else.
    gl_Position = clip.xyww;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 haze;
  uniform vec3 glowDirection;
  uniform vec3 glowColour;
  uniform float glowStrength;
  uniform vec3 sunDirection;
  uniform vec3 sunColour;
  uniform vec3 haloColour;
  uniform float sunSize;
  uniform float sunStrength;
  uniform sampler2D cloudNoise;
  uniform float cloudCover;
  uniform vec3 cloudLit;
  uniform vec3 cloudShade;
  uniform vec2 cloudDrift;
  varying vec3 vDirection;

  /** How much cloud there is at a point on the layer, in kilometres, from 0 to 1: billows on billows. */
  float billows(vec2 p) {
    vec4 n = vec4(
      texture2D(cloudNoise, p * 0.11).r,
      texture2D(cloudNoise, p * 0.31).g,
      texture2D(cloudNoise, p * 0.83).b,
      texture2D(cloudNoise, p * 2.3).a
    );
    return dot(n, vec4(0.5, 0.26, 0.15, 0.09));
  }

  /** Rolls brightness over 0.8 off towards white, rather than clipping it. */
  vec3 shoulder(vec3 c) {
    vec3 over = max(c - 0.8, 0.0);
    return mix(c, 1.0 - 0.2 * exp(-over / 0.2), step(0.8, c));
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float up = direction.y;
    float high = max(up, 0.0);
    // Looking lower, through more air, the sky pales: the blue deepens quickly above the horizon.
    float overhead = 1.0 - exp(-high * 4.5);
    vec3 colour = mix(horizon, zenith, overhead);
    // A band of haze along the horizon, the colour the distance fades into.
    colour = mix(colour, haze, exp(-high * 26.0));
    colour = mix(colour, haze, smoothstep(0.0, -0.03, up));

    // Light scattered forwards round the sun brightens its side of the sky, even out of view.
    float toGlow = max(dot(direction, glowDirection), 0.0);
    colour += glowColour * glowStrength
      * (pow(toGlow, 5.0) * 0.16 + pow(toGlow, 32.0) * 0.22)
      * (0.35 + 0.65 * exp(-high * 3.0));

    // Cumulus on a layer 1.5 km up: where this way of looking meets it, and how far off that is.
    if (cloudCover > 0.0 && up > 0.0) {
      float far = 1.5 / max(up, 0.01);
      vec2 at = direction.xz * far + cloudDrift;
      float n = billows(at);
      float edge = 1.0 - cloudCover;
      float cloud = smoothstep(edge, edge + 0.16, n);
      // Lit where there's less cloud between it and the sun, and grey where it's thick.
      vec2 sunward = normalize(glowDirection.xz + vec2(0.0001)) * 0.35;
      float lit = clamp(0.62 + (n - billows(at + sunward)) * 5.0 - (n - edge) * 1.2, 0.0, 1.0);
      vec3 tone = mix(cloudShade, cloudLit, lit);
      // Further off, it thins into the haze, and its fine detail with it.
      float distance = exp(-far * 0.045);
      tone = mix(haze, tone, 0.35 + 0.65 * distance);
      colour = mix(colour, tone, cloud * (0.25 + 0.75 * distance) * smoothstep(0.0, 0.03, up));
    }

    // The sun, moon or glow that shows: a halo, and a disc darkening towards its edge.
    float angle = acos(clamp(dot(direction, sunDirection), -1.0, 1.0));
    colour += haloColour * sunStrength * (exp(-angle * 7.0) * 0.3 + exp(-angle * 45.0) * 0.55);
    float size = max(sunSize, 0.0001);
    float r = angle / size;
    float disc = (1.0 - smoothstep(0.85, 1.0, r)) * step(0.0001, sunSize);
    float limb = 0.7 + 0.3 * sqrt(max(1.0 - r * r, 0.0));
    colour = mix(colour, sunColour * limb * 1.25, disc * sunStrength);

    gl_FragColor = vec4(shoulder(colour), 1.0);
    #include <colorspace_fragment>
    // A little noise, so the gradient doesn't show bands.
    gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  }
`;

/** Where a sun in the sky sits: `height` degrees up and `across` degrees right of straight ahead. */
const sunDirection = (height: number, across: number) =>
  new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - height),
    Math.PI - THREE.MathUtils.degToRad(across),
  );

/**
 * The dome, as a mesh to draw or to light the venue's environment with. The castle's twist finds
 * its colours by name, `zenith`, `horizon` and `haze`, to dim and flash them.
 */
export const skyDome = (venue: Venue): THREE.Mesh => {
  const sun = venue.sun;
  const key = lookOf(venue.id).key;
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      zenith: { value: new THREE.Color(venue.sky[0]) },
      horizon: { value: new THREE.Color(venue.sky[1]) },
      haze: { value: new THREE.Color(venue.haze) },
      glowDirection: { value: directionOf(key) },
      glowColour: { value: new THREE.Color(key.colour) },
      // Only a sky that's lit by day glows round its sun.
      glowStrength: { value: venue.clouds ? 1 : 0.25 },
      sunDirection: { value: sunDirection(sun?.height ?? 30, sun?.across ?? 0) },
      sunColour: { value: new THREE.Color(sun?.colour ?? "#ffffff") },
      haloColour: { value: new THREE.Color(sun?.glow ?? "#ffffff") },
      sunSize: { value: THREE.MathUtils.degToRad((sun?.size ?? 0) / 2) },
      sunStrength: { value: sun ? 1 : 0 },
      cloudNoise: { value: cloudNoise() },
      cloudCover: { value: venue.clouds ? (venue.cover ?? 0.42) : 0 },
      cloudLit: { value: new THREE.Color(venue.clouds?.[0] ?? "#ffffff") },
      cloudShade: { value: new THREE.Color(venue.clouds?.[1] ?? "#ffffff") },
      cloudDrift: { value: new THREE.Vector2() },
    },
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
};

// --- Clouds -------------------------------------------------------------------------------------

/** A hash of a grid point to a number from 0 to 1, the same every time. */
const hash = (x: number, y: number, seed: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth noise from 0 to 1 over a grid `cells` across that wraps round at its edges. */
const tiledNoise = (u: number, v: number, cells: number, seed: number) => {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = (x - ix) * (x - ix) * (3 - 2 * (x - ix));
  const sy = (y - iy) * (y - iy) * (3 - 2 * (y - iy));
  const at = (i: number, j: number) => hash(i % cells, j % cells, seed);
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

let noiseTexture: THREE.DataTexture | undefined;

/**
 * Four layers of smooth noise that tile, one in each channel, each finer than the last, for the
 * clouds' billows. Made once, and shared by every sky.
 */
const cloudNoise = (): THREE.Texture => {
  if (noiseTexture) return noiseTexture;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const cells = [6, 12, 24, 48];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cells.forEach((count, channel) => {
        data[(y * size + x) * 4 + channel] = Math.round(
          255 * tiledNoise(x / size, y / size, count, channel * 7 + 3),
        );
      });
    }
  }
  noiseTexture = new THREE.DataTexture(data, size, size);
  noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTexture.generateMipmaps = true;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
};

export interface Sky {
  readonly object: THREE.Object3D;
  readonly update: (dt: number) => void;
}

/** How fast the clouds drift across, in kilometres a second: a gentle breeze. */
const DRIFT = new THREE.Vector2(0.006, 0.002);

/** The venue's sky, with its clouds drifting if it has weather. */
export const buildSky = (venue: Venue): Sky => {
  const dome = skyDome(venue);
  const drift = (dome.material as THREE.ShaderMaterial).uniforms.cloudDrift?.value as
    THREE.Vector2 | undefined;
  return {
    object: dome,
    update: (dt) => drift?.addScaledVector(DRIFT, dt),
  };
};
