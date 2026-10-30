import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// What the props are made from: smooth shapes painted with vertex colours rather than textures,
// as the crowd is (see ../crowd), merged so that each prop is only a few draw calls. Props are
// scenery that comes with a venue, like palm trees and planets, and the fish in the crowd. Their
// materials are shared by every prop and every game; their shapes are their own, for the scene to
// free.

export type Vec3 = readonly [number, number, number];
/** A shape's colour: one all over, or one for each point on it, in the shape's own space. */
export type Paint = THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.ColorRepresentation);

/** Scenery that moves, posed each frame: the same shape as the scenery's own moving parts. */
export interface Prop {
  readonly object: THREE.Object3D;
  update(seconds: number, dt: number): void;
}

/**
 * Lit by the scene and painted in vertex colours: a rough, unpolished surface, like bark, stone or
 * skin, lit by the venue's sky and surroundings as well as its lights (see ../look.ts).
 */
export const PAINTED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
/** For thin things seen from both sides, like leaves and fins. */
export const PAINTED_THIN = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.8,
  side: THREE.DoubleSide,
});
/** For what lights itself, like lava, so it's bright whatever the light. */
export const GLOWING = new THREE.MeshBasicMaterial({ vertexColors: true });

const colour = new THREE.Color();
const point = new THREE.Vector3();

export const paintAt = (paint: Paint, p: THREE.Vector3) =>
  typeof paint === "function" ? paint(p) : paint;

/** Paints a shape and puts it in place, ready to merge. */
export const part = (
  geometry: THREE.BufferGeometry,
  paint: Paint,
  position: Vec3 = [0, 0, 0],
  rotation: Vec3 = [0, 0, 0],
  scale: Vec3 = [1, 1, 1],
): THREE.BufferGeometry => {
  geometry.deleteAttribute("uv");
  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    colour.set(paintAt(paint, point.fromBufferAttribute(positions, i)));
    colour.toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    ),
  );
};

/** Merges painted shapes into one mesh. */
export const solid = (
  parts: readonly THREE.BufferGeometry[],
  material: THREE.Material = PAINTED,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(mergeGeometries([...parts]), material);
  for (const p of parts) p.dispose();
  return mesh;
};

/**
 * A round shape turned from its outline: radius and height pairs, bottom to top, smoothed into
 * `steps` rings, so a painted pattern along it can be as fine as it needs.
 */
export const turned = (
  outline: readonly (readonly [number, number])[],
  segments = 16,
  steps = outline.length * 2,
): THREE.LatheGeometry => {
  const curve = new THREE.SplineCurve(outline.map(([r, y]) => new THREE.Vector2(r, y)));
  const points = curve.getPoints(steps).map((p) => p.setX(Math.max(p.x, 0)));
  return new THREE.LatheGeometry(points, segments);
};

/** A flat shape from an outline, for fins, leaves and the like. Its points are x and y pairs. */
export const flat = (outline: readonly (readonly [number, number])[]): THREE.BufferGeometry => {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ShapeGeometry(shape);
};

/** A repeatable random source, so a prop looks the same every game. Mulberry32, as the crowd. */
export const seeded = (start: number) => {
  let seed = Math.imul(start + 1, 0x9e3779b9);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A number from -1 to 1 for each corner of a grid of whole numbers, the same every time. */
const hash = (x: number, y: number, z: number, seed: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
};

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Smooth noise in 3D, from about -1 to 1, changing over a distance of 1: for continents, craters,
 * rock and spots, without storing a texture. Layers of finer noise add detail.
 */
export const noise = (seed: number, layers = 1) => {
  const single = (x: number, y: number, z: number) => {
    const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [fx, fy, fz] = [smooth(x - ix), smooth(y - iy), smooth(z - iz)];
    const at = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz, seed);
    return mix(
      mix(mix(at(0, 0, 0), at(1, 0, 0), fx), mix(at(0, 1, 0), at(1, 1, 0), fx), fy),
      mix(mix(at(0, 0, 1), at(1, 0, 1), fx), mix(at(0, 1, 1), at(1, 1, 1), fx), fy),
      fz,
    );
  };
  return (x: number, y: number, z: number) => {
    let sum = 0;
    let weight = 0;
    for (let layer = 0; layer < layers; layer++) {
      const scale = 2 ** layer;
      sum += single(x * scale + layer * 17.3, y * scale, z * scale) / scale;
      weight += 1 / scale;
    }
    return sum / weight;
  };
};

/** A soft round glow, for a light seen through the haze, like a crater's. */
export const glowSprite = (
  texture: THREE.Texture,
  colour: THREE.ColorRepresentation,
  size: number,
  position: Vec3,
): THREE.Sprite => {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: colour,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.scale.set(size, size, 1);
  sprite.position.set(...position);
  return sprite;
};

/**
 * A material for shapes that sway in the water or the breeze, like seaweed and tentacles: each
 * point moves by how far along its strand it is, which the shape keeps in an `along` attribute,
 * from 0 where it's fixed to 1 at its tip. `sway` is the strand's own phase, so they don't all
 * move together. Every swaying shape shares the clock in `time`.
 */
export const swaying = (
  base: THREE.MeshStandardMaterial,
  { reach, speed, wave }: { reach: number; speed: number; wave: number },
) => {
  const time = { value: 0 };
  const material = base.clone();
  material.customProgramCacheKey = () => "props-swaying";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.swayTime = time;
    shader.uniforms.swayReach = { value: reach };
    shader.uniforms.swaySpeed = { value: speed };
    shader.uniforms.swayWave = { value: wave };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float along;
        attribute float sway;
        uniform float swayTime;
        uniform float swayReach;
        uniform float swaySpeed;
        uniform float swayWave;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // Further along bends more, and the bend travels up the strand.
        float bend = along * along * swayReach;
        float phase = swayTime * swaySpeed + sway - along * swayWave;
        transformed.x += sin(phase) * bend;
        transformed.z += cos(phase * 0.8 + 1.3) * bend * 0.6;
        transformed.y += sin(phase * 1.3) * bend * 0.15;`,
      );
  };
  return { material, time };
};

/** Gives a shape the attributes a swaying material reads: how far along it each point is. */
export const strand = (
  geometry: THREE.BufferGeometry,
  along: (p: THREE.Vector3) => number,
  sway: number,
): THREE.BufferGeometry => {
  const positions = geometry.getAttribute("position");
  const alongs = new Float32Array(positions.count);
  const sways = new Float32Array(positions.count).fill(sway);
  for (let i = 0; i < positions.count; i++) {
    alongs[i] = THREE.MathUtils.clamp(along(point.fromBufferAttribute(positions, i)), 0, 1);
  }
  geometry.setAttribute("along", new THREE.BufferAttribute(alongs, 1));
  geometry.setAttribute("sway", new THREE.BufferAttribute(sways, 1));
  return geometry;
};
