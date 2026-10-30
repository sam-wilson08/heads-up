import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type Prop, seeded } from "./shapes";

// The light under the sea round the Underwater pitch: the rippling net of sunlight the waves above
// focus on the sea floor, and shafts of it slanting down through the water. Both are light added
// to what's behind them. The shafts, and the ripples beyond the pitch, are painted into the venue's
// backdrop (see ../backdrop.ts). Units are metres; the goal is down -Z, 30 m away.

/**
 * A rippling net of light, as a picture that tiles: bright where the edges of cells of jittered
 * points meet, as the light the surface's waves focus does.
 */
const causticTexture = () => {
  const size = 256;
  const cells = 6;
  const random = seeded(17);
  const points = Array.from({ length: cells * cells }, (_, i) => ({
    x: ((i % cells) + 0.15 + random() * 0.7) / cells,
    y: (Math.floor(i / cells) + 0.15 + random() * 0.7) / cells,
  }));
  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      let [nearest, second] = [Infinity, Infinity];
      for (const p of points) {
        // Wrapped round, so the picture tiles.
        const dx = Math.min(Math.abs(u - p.x), 1 - Math.abs(u - p.x));
        const dy = Math.min(Math.abs(v - p.y), 1 - Math.abs(v - p.y));
        const d = Math.hypot(dx, dy);
        if (d < nearest) [second, nearest] = [nearest, d];
        else if (d < second) second = d;
      }
      const edge = Math.max(0, 1 - (second - nearest) * cells * 3.2) ** 3;
      const i = (py * size + px) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(edge * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

const CAUSTIC_VERTEX = /* glsl */ `
  varying vec2 vWorld;
  varying float vDepth;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vec4 view = viewMatrix * world;
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const CAUSTIC_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float time;
  uniform vec3 tint;
  varying vec2 vWorld;
  varying float vDepth;
  void main() {
    // Two nets drifting different ways: where they cross, the light's focused brightest.
    float a = texture2D(map, vWorld * 0.16 + vec2(time * 0.021, time * 0.013)).r;
    float b = texture2D(map, vWorld * 0.21 + vec2(-time * 0.016, time * 0.019)).r;
    float light = a * 0.55 + b * 0.45 + a * b * 1.2;
    // Fading into the murk further off.
    gl_FragColor = vec4(tint * light * exp(-vDepth * 0.045), 1.0);
  }
`;

/** A shaft of light down through the water, brightest at the top and fading as it goes down. */
const shaftTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const down = ctx.createLinearGradient(0, 0, 0, 128);
    down.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    down.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = down;
    ctx.fillRect(0, 0, 32, 128);
    // Soft at the sides.
    ctx.globalCompositeOperation = "destination-in";
    const across = ctx.createLinearGradient(0, 0, 32, 0);
    across.addColorStop(0, "rgba(0, 0, 0, 0)");
    across.addColorStop(0.5, "rgba(0, 0, 0, 1)");
    across.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, 32, 128);
  }
  return new THREE.CanvasTexture(canvas);
};

/**
 * The rippling light on the sea floor, from `near` to `far` metres down the pitch (both negative,
 * towards the goal): live over the pitch, and painted into the backdrop beyond it.
 */
export const rippleLight = (near: number, far: number): Prop => {
  const time = { value: 0 };
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(80, near - far),
    new THREE.ShaderMaterial({
      vertexShader: CAUSTIC_VERTEX,
      fragmentShader: CAUSTIC_FRAGMENT,
      uniforms: {
        map: { value: causticTexture() },
        time,
        tint: { value: new THREE.Color("#7ff0ff").multiplyScalar(0.32) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  net.rotation.x = -Math.PI / 2;
  net.position.set(0, 0.03, (near + far) / 2);
  return {
    object: net,
    update: (seconds) => {
      time.value = seconds;
    },
  };
};

/**
 * Shafts of sunlight slanting down from the surface, kept to the sides and behind the goal, all one
 * shape, each its own brightness: for the backdrop (see ../backdrop.ts).
 */
export const sunShafts = (): THREE.Object3D => {
  const random = seeded(23);
  const beams = Array.from({ length: 9 }, (_, i) => {
    const width = 2.5 + random() * 3.5;
    const side = i % 2 ? 1 : -1;
    const beam = new THREE.PlaneGeometry(width, 40)
      .rotateZ(side * 0.25 + (random() - 0.5) * 0.15)
      .translate(side * (5 + random() * 18), 16, -38 - random() * 30);
    const brightness = 0.6 + random() * 0.4;
    const count = beam.getAttribute("position").count;
    beam.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Array<number>(count * 3).fill(brightness), 3),
    );
    return beam;
  });
  const shafts = new THREE.Mesh(
    mergeGeometries(beams),
    new THREE.MeshBasicMaterial({
      map: shaftTexture(),
      color: "#bff8ff",
      vertexColors: true,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  for (const beam of beams) beam.dispose();
  return shafts;
};
