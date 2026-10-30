import * as THREE from "three";
import { dragonModel } from "../props/dragon";
import { DRAGON, type Pass } from "./schedule";

// Sakura Peak's dragon, as the scene draws it: a long pink Japanese dragon along a spine that
// follows exactly where its head has been, so it flies its laps of the sky in one long, flowing
// curve, close across the throws and away round into the distance, its tail the last of it. A slow
// wave rolls down its body as it goes, curving it into S-bends, as a serpent swims.
//
// It's Meshy's model (see ../props/dragon.ts), made dead straight and bent along the spine in its
// shader: the spine's worked out each frame, and each point of the model moved from its place along
// the straight dragon to the same place along the spine. Without the model, it's built from shapes:
// its body a tube round the spine, moved on the CPU each frame, which is a few thousand points, with
// pink scales on top, a pale belly, a mane of gold and white flames along its back, and its head,
// four small clawed legs and the tuft at its tail shapes of their own, placed on the spine.
// Units are metres; the player looks down -Z.

/** How many rings the body's made of, and how many points round each. */
const RINGS = 170;
const SIDES = 12;
/**
 * How far out to the side it comes in from, close, and flies off to, far away in the distance: out
 * of sight on the widest screen.
 */
const OFFSTAGE = { near: 28, far: 52 };
/** How thick it is round the middle, and how thin at the tip of its tail. */
const GIRTH = 0.66;
const TIP = 0.05;
/** How much bigger its head and legs are than they're built. */
const HEAD = 1.7;
const LEGS = 1.6;

/**
 * The wave that rolls down its body as it flies, like a serpent swimming: how far up and down it
 * curves it, how long each wave is, in metres, so its body's three S-bends, and how long one takes
 * to roll by, in ms. None at its head, which glides along its path.
 */
const WAVE = { rise: 1.2, length: 10, ms: 3800 };

const PINK = new THREE.Color("#f0779f");
const BELLY = new THREE.Color("#ffe3ec");

/** How thick the body is, `u` along it from its head (0) to the tip of its tail (1). */
const radiusAt = (u: number) => {
  const neck = THREE.MathUtils.smoothstep(u, 0, 0.07);
  const taper = 1 - THREE.MathUtils.smoothstep(u, 0.3, 1);
  return TIP + (GIRTH - TIP) * (0.7 + 0.3 * neck) * taper ** 0.85;
};

/** Scales, each a rounded plate edged darker, in white to tint, a tile of them. */
const scaleTexture = (): THREE.Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 64, 64);
    for (const [row, offset] of [
      [0, 0],
      [32, 16],
      [64, 0],
    ] as const) {
      for (let x = -32; x <= 64; x += 32) {
        const g = ctx.createRadialGradient(x + offset + 16, row, 4, x + offset + 16, row, 18);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.75, "#f1e4ea");
        g.addColorStop(1, "#b98a9c");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + offset + 16, row, 17, 0, Math.PI);
        ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

const standard = (colour: THREE.ColorRepresentation, roughness = 0.55) =>
  new THREE.MeshStandardMaterial({ color: colour, roughness });

/** Adds a shape to a group, placed, turned and scaled. */
const part = (
  group: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
};

/**
 * The head, facing +Z with its top up +Y: a rounded skull, a long snout with a jaw a little open,
 * eyes, swept-back horns, long whiskers trailing from its snout, and a mane of flames behind.
 */
const headShape = (skin: THREE.Material, horn: THREE.Material, mane: THREE.Material) => {
  const head = new THREE.Group();
  part(
    head,
    new THREE.SphereGeometry(0.3, 18, 14),
    skin,
    [0, 0.03, 0.05],
    [0, 0, 0],
    [1, 0.85, 1.15],
  );
  // The snout and its jaw, tapering forwards.
  const snout = new THREE.CylinderGeometry(0.13, 0.21, 0.6, 14).rotateX(Math.PI / 2);
  part(head, snout, skin, [0, 0, 0.42], [0, 0, 0], [1, 0.75, 1]);
  part(
    head,
    new THREE.SphereGeometry(0.14, 12, 10),
    skin,
    [0, 0.02, 0.72],
    [0, 0, 0],
    [1.1, 0.8, 0.7],
  );
  const jaw = new THREE.CylinderGeometry(0.08, 0.16, 0.5, 12).rotateX(Math.PI / 2);
  part(head, jaw, skin, [0, -0.15, 0.36], [0.28, 0, 0], [1, 0.5, 1]);
  part(
    head,
    new THREE.SphereGeometry(0.1, 10, 8),
    standard("#9c1f3c", 0.7),
    [0, -0.09, 0.45],
    [0, 0, 0],
    [1, 0.4, 2],
  );
  // Eyes: gold, with a dark slit, under a heavy brow.
  const eye = standard("#ffd34d", 0.25);
  const pupil = standard("#1b0f12", 0.3);
  for (const side of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.065, 12, 10), eye, [side * 0.19, 0.13, 0.26]);
    part(
      head,
      new THREE.SphereGeometry(0.03, 8, 6),
      pupil,
      [side * 0.235, 0.135, 0.29],
      [0, 0, 0],
      [0.5, 1.4, 0.6],
    );
    part(
      head,
      new THREE.SphereGeometry(0.09, 10, 8),
      skin,
      [side * 0.16, 0.2, 0.25],
      [0, 0, 0],
      [1.1, 0.45, 1],
    );
    // Horns, swept back and up, with a tine.
    const hornShape = new THREE.ConeGeometry(0.05, 0.6, 8).translate(0, 0.3, 0);
    part(head, hornShape, horn, [side * 0.12, 0.22, -0.02], [-1.1, 0, side * -0.35]);
    const tine = new THREE.ConeGeometry(0.03, 0.22, 6).translate(0, 0.11, 0);
    part(head, tine, horn, [side * 0.17, 0.42, -0.16], [-0.3, 0, side * -0.9]);
    // Whiskers, long and curling back from the snout.
    const whisker = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.12, -0.02, 0.66),
      new THREE.Vector3(side * 0.42, 0.05, 0.6),
      new THREE.Vector3(side * 0.7, -0.15, 0.2),
      new THREE.Vector3(side * 0.85, -0.05, -0.35),
      new THREE.Vector3(side * 0.75, 0.15, -0.8),
    ]);
    part(head, new THREE.TubeGeometry(whisker, 24, 0.014, 5), horn, [0, 0, 0]);
  }
  // The mane: flames streaming back from behind the horns.
  for (const [x, y, z, size] of [
    [0, 0.26, -0.18, 0.5],
    [-0.16, 0.2, -0.16, 0.42],
    [0.16, 0.2, -0.16, 0.42],
    [-0.24, 0.05, -0.12, 0.36],
    [0.24, 0.05, -0.12, 0.36],
  ] as const) {
    const flame = new THREE.ConeGeometry(0.07, size, 6).translate(0, size / 2, 0);
    part(head, flame, mane, [x, y, z], [-1.9, 0, x * -1.5]);
  }
  return head;
};

/** A small leg, hanging down -Y from its shoulder, with three claws reaching forward +Z. */
const legShape = (skin: THREE.Material, claw: THREE.Material) => {
  const leg = new THREE.Group();
  part(
    leg,
    new THREE.CylinderGeometry(0.06, 0.09, 0.42, 8).translate(0, -0.21, 0),
    skin,
    [0, 0, 0],
    [0.3, 0, 0],
  );
  part(leg, new THREE.SphereGeometry(0.075, 8, 6), skin, [0, -0.4, 0.12]);
  for (const spread of [-0.5, 0, 0.5]) {
    const talon = new THREE.ConeGeometry(0.022, 0.16, 6).translate(0, 0.08, 0);
    part(leg, talon, claw, [Math.sin(spread) * 0.06, -0.42, 0.16], [1.7, spread, 0]);
  }
  return leg;
};

/**
 * Meshy's dragon, bent along the spine: each frame the spine's `RINGS` frames are set, its head's
 * first, and its shader moves each point of the model, which lies along +X head first, from `x`
 * along it to the same way down the spine, turned to the spine's frame there. The frames go to the
 * shader as a picture, a ring to a column: where it is, its up, its side and which way it's going,
 * a row each.
 */
const bentAlong = (model: THREE.Mesh) => {
  const frames = new Float32Array(RINGS * 4 * 4);
  const spine = new THREE.DataTexture(frames, RINGS, 4, THREE.RGBAFormat, THREE.FloatType);
  // Read point by point, and between rings in the shader: float pictures can't be filtered
  // everywhere.
  spine.minFilter = THREE.NearestFilter;
  spine.magFilter = THREE.NearestFilter;
  const material = (model.material as THREE.Material).clone();
  // The model's own units: x from the tail at -0.5 to the head at 0.5, its back up +Y. Its +Z is the
  // spine's other side, so it's turned, not mirrored.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.spine = { value: spine };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform highp sampler2D spine;
        vec3 spineRow(int row, float at) {
          int ring = int(at);
          vec3 a = texelFetch(spine, ivec2(ring, row), 0).xyz;
          vec3 b = texelFetch(spine, ivec2(min(ring + 1, ${RINGS - 1}), row), 0).xyz;
          return mix(a, b, at - float(ring));
        }`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `float along = clamp(0.5 - position.x, 0.0, 1.0) * ${(RINGS - 1).toFixed(1)};
        vec3 spineUp = normalize(spineRow(1, along));
        vec3 spineSide = normalize(spineRow(2, along));
        vec3 spineAhead = normalize(spineRow(3, along));
        vec3 objectNormal = spineAhead * normal.x + spineUp * normal.y - spineSide * normal.z;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = spineRow(0, along)
          + (spineUp * position.y - spineSide * position.z) * ${DRAGON.length.toFixed(1)};`,
      );
  };
  material.customProgramCacheKey = () => "dragon";
  // Its geometry's the loaded model's, shared, so it's never disposed here.
  const mesh = new THREE.Mesh(model.geometry, material);
  mesh.name = "dragon-model";
  mesh.frustumCulled = false;
  model.geometry.computeBoundingBox();
  const box = model.geometry.boundingBox;
  return {
    mesh,
    spine,
    /** How far it reaches out to its side, in metres, legs and all. */
    reach: box ? Math.max(-box.min.z, box.max.z) * DRAGON.length : GIRTH,
    /** Sets ring `i`'s frame. */
    set: (
      i: number,
      point: THREE.Vector3,
      up: THREE.Vector3,
      side: THREE.Vector3,
      ahead: THREE.Vector3,
    ) => {
      point.toArray(frames, i * 4);
      up.toArray(frames, (RINGS + i) * 4);
      side.toArray(frames, (RINGS * 2 + i) * 4);
      ahead.toArray(frames, (RINGS * 3 + i) * 4);
    },
  };
};

export interface Dragon {
  readonly object: THREE.Object3D;
  /** One of each of its materials, to compile before the first frame. */
  readonly warmUp: readonly THREE.Object3D[];
  /** Flies it on to `now` in a pass, or hides it between passes. */
  update(pass: Pass | undefined, now: number, seconds: number): void;
  dispose(): void;
}

/**
 * Builds the dragon, to fly no nearer than `nearest` metres down the pitch (a negative z), so
 * anything it hides comes out in front of it in time.
 */
export const buildDragon = (nearest: number): Dragon => {
  const object = new THREE.Group();
  object.name = "dragon";
  object.visible = false;
  // Meshy's, if it's loaded; otherwise the shapes below.
  const model = dragonModel();
  const bent = model ? bentAlong(model) : undefined;
  const shapes = new THREE.Group();

  const scales = scaleTexture();
  const body = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: scales,
    roughness: 0.45,
  });
  const skin = standard(PINK, 0.45);
  const horn = standard("#f3e1b3", 0.4);
  const mane = new THREE.MeshStandardMaterial({
    color: "#ffe9b8",
    emissive: "#ffb347",
    emissiveIntensity: 0.25,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  // The body: rings of points round the spine, moved each frame.
  const count = RINGS * SIDES;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colours = new Float32Array(count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SIDES; j++) {
      const k = i * SIDES + j;
      const around = (j / SIDES) * Math.PI * 2;
      uvs[k * 2] = ((i / (RINGS - 1)) * DRAGON.length) / 0.32;
      uvs[k * 2 + 1] = (j / SIDES) * 7;
      // Pink along its back, paling to its belly underneath.
      colour.copy(BELLY).lerp(PINK, THREE.MathUtils.smoothstep(Math.cos(around), -0.55, 0.25));
      colour.toArray(colours, k * 3);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = a + SIDES;
      const d = b + SIDES;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const spinePoints = new THREE.BufferAttribute(positions, 3);
  const spineNormals = new THREE.BufferAttribute(normals, 3);
  geometry.setAttribute("position", spinePoints);
  geometry.setAttribute("normal", spineNormals);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(index);
  const tube = new THREE.Mesh(geometry, body);
  tube.frustumCulled = false;
  shapes.add(tube);

  // The mane along its back: a flame on every few rings, leaning back, smaller down the tail.
  const FLAMES = 56;
  const flamePositions = new Float32Array(FLAMES * 3 * 3);
  const flames = new THREE.BufferGeometry();
  const flamePoints = new THREE.BufferAttribute(flamePositions, 3);
  flames.setAttribute("position", flamePoints);
  const flameMesh = new THREE.Mesh(flames, mane);
  flameMesh.frustumCulled = false;
  shapes.add(flameMesh);

  const head = headShape(skin, horn, mane);
  // Its head's scaled inside a group of its own, which is turned and moved along the spine.
  const headSize = new THREE.Group();
  head.scale.setScalar(HEAD);
  headSize.add(head);
  shapes.add(headSize);
  const legs = [0.1, 0.13, 0.46, 0.49].map((u, i) => {
    const leg = legShape(skin, horn);
    leg.scale.setScalar(LEGS);
    shapes.add(leg);
    return { leg, u, side: i % 2 === 0 ? -1 : 1 };
  });
  const tuft = new THREE.Group();
  for (const [spread, size] of [
    [0, 0.7],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const) {
    const flame = new THREE.ConeGeometry(0.09, size, 6).translate(0, size / 2, 0);
    part(tuft, flame, mane, [0, 0, 0], [-Math.PI / 2 + 0.2, spread, 0]);
  }
  shapes.add(tuft);
  object.add(bent?.mesh ?? shapes);

  // A shape in each of its materials, for the scene to compile before the first frame.
  const materials = new Set<THREE.Material>();
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material);
  });
  const warmUp = [...materials].map(
    (material) => new THREE.Mesh(new THREE.TetrahedronGeometry(0.01), material),
  );

  // How near it comes, its body, and Meshy's legs, clear of where things are halfway to the player.
  const near = nearest - (bent?.reach ?? GIRTH);
  /**
   * The path a pass flies, a smooth curve through where it goes: in from the side, swooping low
   * close across the throws, climbing round away into the distance and back across high up behind
   * them, above Fuji, then diving round and in again for its next lap, and at last off into the
   * distance. Its laps are tilted, low and near, high and far, so they show as loops on the screen
   * rather than flattening into a line. Each pass's laps are a little wider or narrower, higher or
   * lower.
   */
  const lapsOf = (pass: Pass) => {
    const { side, sway, height } = pass;
    const far = -DRAGON.far;
    const middle = (near + far) / 2;
    const high = DRAGON.farHeight + sway * 0.8;
    const between = (height + high) / 2 + 0.8;
    const at = (x: number, y: number, z: number) => new THREE.Vector3(side * x, y, z);
    const points = [at(-OFFSTAGE.near, height + 1.6, near - 3)];
    for (let lap = 0; lap < DRAGON.laps; lap++) {
      const wide = DRAGON.turn + sway * 2 * (lap % 2 === 0 ? 1 : -1);
      // Swooping low across the throws, nearest in the middle.
      points.push(at(-7, height + 0.7, near), at(0, height - 0.3, near), at(7, height + 0.6, near));
      // Climbing round, and back across high and far off.
      points.push(at(wide, between, middle), at(6, high, far), at(-6, high + 0.5, far));
      // Diving round and in again, but for the last lap.
      if (lap < DRAGON.laps - 1) points.push(at(-wide, between, middle));
    }
    points.push(at(-OFFSTAGE.far, high + 1.5, far - 4));
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    return { curve, length: curve.getLength() };
  };
  const paths = new WeakMap<Pass, ReturnType<typeof lapsOf>>();
  const pathOf = (pass: Pass) => {
    let path = paths.get(pass);
    if (!path) {
      path = lapsOf(pass);
      paths.set(pass, path);
    }
    return path;
  };
  const onward = new THREE.Vector3();
  /**
   * Where a point on the dragon is, `s` metres along its path from where its head came in: before
   * the start or past the end, straight on from it, out of sight. Never nearer than it may come.
   */
  const spineAt = (pass: Pass, s: number, out: THREE.Vector3) => {
    const { curve, length } = pathOf(pass);
    if (s <= 0) {
      curve.getPointAt(0, out).addScaledVector(curve.getTangentAt(0, onward), s);
    } else if (s >= length) {
      curve.getPointAt(1, out).addScaledVector(curve.getTangentAt(1, onward), s - length);
    } else {
      curve.getPointAt(s / length, out);
    }
    out.z = Math.min(out.z, near);
    return out;
  };

  const point = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const behind = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const up = new THREE.Vector3();
  const across = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();
  /** How far its head's flown, and the time, now: for the wave down its body. */
  let travelled = 0;
  let clock = 0;
  /** Where a point on its body is, `s` metres along its path: on the path, and the wave. */
  const bodyAt = (pass: Pass, s: number, out: THREE.Vector3) => {
    spineAt(pass, s, out);
    const along = travelled - s;
    const rise = WAVE.rise * THREE.MathUtils.smoothstep(along, 0, DRAGON.length * 0.3);
    out.y += rise * Math.sin((along / WAVE.length - clock / WAVE.ms) * Math.PI * 2);
    return out;
  };
  /** The spine's frame at `s`: where it is, which way it's going, its up and its side. */
  const frameAt = (pass: Pass, s: number) => {
    bodyAt(pass, s, point);
    bodyAt(pass, s + 0.05, ahead);
    bodyAt(pass, s - 0.05, behind);
    tangent.subVectors(ahead, behind).normalize();
    up.copy(UP).addScaledVector(tangent, -tangent.dot(UP)).normalize();
    across.crossVectors(up, tangent);
  };
  /** Puts a shape at `s` along the spine, turned to its frame, `lift` up and `out` to its side. */
  const place = (pass: Pass, s: number, shape: THREE.Object3D, lift = 0, out = 0) => {
    frameAt(pass, s);
    basis.makeBasis(across, up, tangent);
    shape.position.copy(point).addScaledVector(up, lift).addScaledVector(across, out);
    shape.quaternion.setFromRotationMatrix(basis);
  };

  return {
    object,
    update: (pass, now, seconds) => {
      object.visible = pass !== undefined && now >= pass.from && now < pass.to;
      if (!pass || !object.visible) return;
      // How far its head's flown: its laps, and on until its tail's gone too.
      const t = (now - pass.from) / (pass.to - pass.from);
      travelled = t * (pathOf(pass).length + DRAGON.length);
      clock = now;
      if (bent) {
        for (let i = 0; i < RINGS; i++) {
          frameAt(pass, travelled - (i / (RINGS - 1)) * DRAGON.length);
          bent.set(i, point, up, across, tangent);
        }
        bent.spine.needsUpdate = true;
        return;
      }
      for (let i = 0; i < RINGS; i++) {
        const u = i / (RINGS - 1);
        const s = travelled - u * DRAGON.length;
        frameAt(pass, s);
        // A ripple down its body as it swims through the air.
        const r = radiusAt(u) * (1 + 0.04 * Math.sin(seconds * 6 - u * 20));
        for (let j = 0; j < SIDES; j++) {
          const around = (j / SIDES) * Math.PI * 2;
          radial
            .copy(up)
            .multiplyScalar(Math.cos(around))
            .addScaledVector(across, Math.sin(around));
          const k = (i * SIDES + j) * 3;
          positions[k] = point.x + radial.x * r;
          positions[k + 1] = point.y + radial.y * r;
          positions[k + 2] = point.z + radial.z * r;
          normals[k] = radial.x;
          normals[k + 1] = radial.y;
          normals[k + 2] = radial.z;
        }
      }
      spinePoints.needsUpdate = true;
      spineNormals.needsUpdate = true;

      for (let f = 0; f < FLAMES; f++) {
        const u = 0.05 + (f / (FLAMES - 1)) * 0.85;
        const s = travelled - u * DRAGON.length;
        frameAt(pass, s);
        const r = radiusAt(u);
        const height = 0.18 + 0.42 * (1 - u) * (0.8 + 0.2 * Math.sin(seconds * 9 + f));
        const k = f * 9;
        const base = point.clone().addScaledVector(up, r * 0.9);
        const front = base.clone().addScaledVector(tangent, 0.18);
        const rear = base.clone().addScaledVector(tangent, -0.18);
        const tip = base
          .clone()
          .addScaledVector(up, height)
          .addScaledVector(tangent, -height * 0.9);
        front.toArray(flamePositions, k);
        rear.toArray(flamePositions, k + 3);
        tip.toArray(flamePositions, k + 6);
      }
      flamePoints.needsUpdate = true;
      flames.computeVertexNormals();

      place(pass, travelled, headSize);
      for (const { leg, u, side } of legs) {
        const r = radiusAt(u);
        place(pass, travelled - u * DRAGON.length, leg, -r * 0.55, side * r * 0.7);
        // Paddling as it flies.
        leg.rotateX(Math.sin(seconds * 5 + u * 9) * 0.5);
      }
      place(pass, travelled - DRAGON.length, tuft);
    },
    warmUp,
    dispose: () => {
      // The shapes, drawn or not, and what's warmed up; Meshy's model's shared, so only its own
      // material and spine go.
      const materials = new Set<THREE.Material>();
      if (bent) {
        materials.add(bent.mesh.material);
        bent.spine.dispose();
      }
      for (const shape of [shapes, ...warmUp]) {
        shape.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const mesh = o as THREE.Mesh;
          mesh.geometry.dispose();
          materials.add(mesh.material as THREE.Material);
        });
      }
      for (const material of materials) material.dispose();
      scales.dispose();
    },
  };
};
