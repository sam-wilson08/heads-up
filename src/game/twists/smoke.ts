import * as THREE from "three";

// Smoke, dust and blown sand, for the twists: the Cup Final's flare smoke, Mars's dust devils, the
// castle's candle smoke and the beach's gusts. A cloud of puffs is one draw call: copies of one
// square, each turned to face the camera in the vertex shader, with its own size, spin, colour,
// see-through-ness and one of four pictures, drawn back to front. The pictures are noise: puffs,
// wispy at the edges and lit from above, so they look round and billowing, not like flat discs;
// or streaks, fibres along the wind, ragged and tapering, for what the wind blows. Sparks, for the
// flare, are one draw call too.

/** A repeatable number from 0 to 1 for a point on a grid. */
const hash = (x: number, y: number, seed: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Smooth noise: the grid's numbers, blended between its points. */
const noise = (x: number, y: number, seed: number) => {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [x - ix, y - iy];
  const [u, v] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** Noise at several scales, the finer ones fainter: billows within billows, from 0 to 1. */
const billows = (x: number, y: number, seed: number) => {
  let sum = 0;
  let weight = 0.5;
  for (let octave = 0; octave < 5; octave++) {
    const scale = 2 ** octave;
    sum += weight * noise(x * scale, y * scale, seed + octave * 17);
    weight /= 2;
  }
  return sum / 0.97;
};

/** How many puff pictures there are, two by two in one. */
export const PUFF_KINDS = 4;

/**
 * Four pictures in one, two by two, white, for tinting, each painted point by point: `paint` says,
 * for which of the four and where in it, from -1 to 1 across and down, how light it is there and
 * how solid, each from 0 to 1.
 */
const pictures = (
  paint: (kind: number, u: number, w: number) => readonly [number, number],
): THREE.CanvasTexture => {
  const tile = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tile * 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(tile * 2, tile * 2);
    for (let kind = 0; kind < PUFF_KINDS; kind++) {
      const [ox, oy] = [(kind % 2) * tile, Math.floor(kind / 2) * tile];
      for (let py = 0; py < tile; py++) {
        for (let px = 0; px < tile; px++) {
          // From -1 to 1 across the puff, with up as -1.
          const [light, solid] = paint(kind, (px / tile) * 2 - 1, (py / tile) * 2 - 1);
          const i = ((oy + py) * tile * 2 + ox + px) * 4;
          image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(light * 255);
          image.data[i + 3] = Math.round(THREE.MathUtils.clamp(solid, 0, 1) * 255);
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * Puffs: each a lump of billows with wispy edges, lighter on top where the light catches it and
 * darker underneath.
 */
const puffPictures = () =>
  pictures((kind, u, w) => {
    const n = billows(u * 2.2 + kind * 7.3, w * 2.2 + kind * 3.1, kind);
    // The edge pushed out and in by the billows, and fading off wispily.
    const edge = 1 - THREE.MathUtils.smoothstep(Math.hypot(u, w), 0.35 + n * 0.4, 0.98);
    const light = THREE.MathUtils.clamp(0.74 - w * 0.2 + (n - 0.5) * 0.4, 0.5, 1);
    return [light, edge * (0.75 + 0.5 * n) * 1.3];
  });

/**
 * Streaks: fibres running along the wind, across, in a ragged band that tapers off at both ends,
 * longer behind than in front, evenly lit, as blown sand or spray is.
 */
const streakPictures = () =>
  pictures((kind, u, w) => {
    // Fine along the wind's way and coarse across it, so it comes out in fibres.
    const fibres = billows(u * 1.4 + kind * 5.1, w * 10 + kind * 2.3, kind + 11);
    const ragged = billows(u * 2.5 + kind * 3.7, kind * 1.9, kind + 23);
    const band = 1 - THREE.MathUtils.smoothstep(Math.abs(w), 0.15 + ragged * 0.35, 0.9);
    const ends =
      THREE.MathUtils.smoothstep(u, -1, -0.2 + ragged * 0.3) *
      (1 - THREE.MathUtils.smoothstep(u, 0.45 + ragged * 0.25, 1));
    const solid = band * ends * THREE.MathUtils.smoothstep(fibres, 0.3, 0.75);
    return [0.9 + (fibres - 0.5) * 0.2, solid * 1.4];
  });

/** Which pictures a cloud's drawn with. */
export type CloudLook = "puffs" | "streaks";

const VERTEX = /* glsl */ `
attribute float spin;
attribute float opacity;
attribute vec3 tint;
attribute float kind;
varying vec2 vUv;
varying float vOpacity;
varying vec3 vTint;
#include <fog_pars_vertex>
void main() {
  // The puff's middle where the camera sees it, and its corners laid out flat to the camera:
  // turned, then squashed or stretched, so a squashed puff stays flat however it turns.
  vec4 middle = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  float c = cos(spin);
  float s = sin(spin);
  vec2 corner = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
  vec4 mvPosition = middle + vec4(corner, 0.0, 0.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
  // Its picture: one of four, two by two, the first at the top left.
  vec2 cell = vec2(mod(kind, 2.0), 1.0 - floor(kind / 2.0));
  vUv = (uv + cell) * 0.5;
  vOpacity = opacity;
  vTint = tint;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vOpacity;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  vec4 texel = texture2D(map, vUv);
  gl_FragColor = vec4(texel.rgb * vTint, texel.a * vOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** One puff, as a cloud's caller sets it each frame. */
export interface Puff {
  readonly at: THREE.Vector3;
  /** How wide, in metres, its turn on the screen, and how solid, from 0 to 1. */
  readonly size: number;
  readonly spin: number;
  readonly opacity: number;
  readonly colour: THREE.Color;
  /** Which of the puff pictures, from 0 to PUFF_KINDS - 1. */
  readonly kind: number;
  /** How tall it is for its width: under 1 to squash it flat. 1 if not given. */
  readonly stretch?: number;
}

export interface PuffCloud {
  readonly object: THREE.Object3D;
  /** Draws these puffs this frame, and no others, back to front from the camera. */
  draw(puffs: readonly Puff[], camera: THREE.Camera): void;
  /** One puff's worth of the cloud, to compile its shader before it's first drawn. */
  readonly warmUp: THREE.Object3D;
  dispose(): void;
}

/**
 * A cloud of up to `most` puffs, drawn as one, in the see-through pass at `order`, of puffs or of
 * streaks.
 */
export const puffCloud = (most: number, order = 0, look: CloudLook = "puffs"): PuffCloud => {
  const map = look === "streaks" ? streakPictures() : puffPictures();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const spins = new THREE.InstancedBufferAttribute(new Float32Array(most), 1);
  const opacities = new THREE.InstancedBufferAttribute(new Float32Array(most), 1);
  const tints = new THREE.InstancedBufferAttribute(new Float32Array(most * 3), 3);
  const kinds = new THREE.InstancedBufferAttribute(new Float32Array(most), 1);
  for (const [name, attribute] of [
    ["spin", spins],
    ["opacity", opacities],
    ["tint", tints],
    ["kind", kinds],
  ] as const) {
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // In the haze like everything else, so the far end of a plume fades with what's behind it.
    fog: true,
  });
  // Merging the uniforms copies them, and would copy the picture too.
  if (material.uniforms.map) material.uniforms.map.value = map;
  const mesh = new THREE.InstancedMesh(geometry, material, most);
  mesh.count = 0;
  mesh.renderOrder = order;
  // Its puffs move about too much for one box round them; the camera sees most of them anyway.
  mesh.frustumCulled = false;
  const warm = new THREE.InstancedMesh(geometry, material, 1);
  warm.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const still = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const from = new THREE.Vector3();
  return {
    object: mesh,
    warmUp: warm,
    draw: (puffs, camera) => {
      from.setFromMatrixPosition(camera.matrixWorld);
      const sorted = puffs
        .filter((p) => p.opacity > 0.003)
        .slice(0, most)
        .sort((a, b) => b.at.distanceToSquared(from) - a.at.distanceToSquared(from));
      sorted.forEach((p, i) => {
        scale.set(p.size, p.size * (p.stretch ?? 1), 1);
        mesh.setMatrixAt(i, matrix.compose(p.at, still, scale));
        spins.setX(i, p.spin);
        opacities.setX(i, p.opacity);
        tints.setXYZ(i, p.colour.r, p.colour.g, p.colour.b);
        kinds.setX(i, p.kind);
      });
      mesh.count = sorted.length;
      mesh.instanceMatrix.needsUpdate = true;
      for (const attribute of [spins, opacities, tints, kinds]) attribute.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
};

/** One spark, as a shower's caller sets it each frame: where it is, and how bright, 0 to 1. */
export interface Spark {
  readonly at: THREE.Vector3;
  readonly glow: number;
}

/**
 * Sparks, up to `most`, drawn as one: bright points `size` metres across, adding their light to
 * what's behind.
 */
export const sparkShower = (
  most: number,
  colour: THREE.ColorRepresentation,
  size: number,
): {
  object: THREE.Points;
  draw(sparks: readonly Spark[]): void;
  /** One spark's worth, to compile its shader before it's first drawn. */
  warmUp: THREE.Object3D;
  dispose(): void;
} => {
  const positions = new Float32Array(most * 3);
  const glows = new Float32Array(most);
  const geometry = new THREE.BufferGeometry();
  const place = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const bright = new THREE.BufferAttribute(glows, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", place);
  geometry.setAttribute("glow", bright);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      colour: { value: new THREE.Color(colour) },
      size: { value: size },
      height: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float size;
      uniform float height;
      attribute float glow;
      varying float vGlow;
      void main() {
        vGlow = glow;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        // As many pixels across as its size in metres is at its distance, on this screen.
        gl_PointSize = max(1.5, size * glow * height * projectionMatrix[1][1] / (2.0 * -view.z));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(mix(colour, vec3(1.0, 0.95, 0.8), 0.5 * vGlow), smoothstep(1.0, 0.2, d) * vGlow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  // Points are sized in pixels, so the shader needs to know how many the screen has.
  const drawing = new THREE.Vector2();
  object.onBeforeRender = (renderer) => {
    const uniform = material.uniforms.height;
    if (uniform) uniform.value = renderer.getDrawingBufferSize(drawing).y;
  };
  const one = new THREE.BufferGeometry();
  one.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  one.setAttribute("glow", new THREE.Float32BufferAttribute([0.01], 1));
  const warmUp = new THREE.Points(one, material);
  return {
    object,
    warmUp,
    draw: (sparks) => {
      const shown = sparks.slice(0, most);
      shown.forEach((s, i) => {
        positions.set([s.at.x, s.at.y, s.at.z], i * 3);
        glows[i] = s.glow;
      });
      geometry.setDrawRange(0, shown.length);
      place.needsUpdate = true;
      bright.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      one.dispose();
      material.dispose();
    },
  };
};
