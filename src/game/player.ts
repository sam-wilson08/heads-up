import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { Kit } from "../kits";
import { gltfLoader } from "./gltf";
import { wearKit } from "./kit";
import { shirtTexture } from "./textures";

// The player, seen from behind. A Meshy model goes in ./models as player.glb, as it is or rigged
// and animated in Mixamo (see ASSETS.md); Vite finds it at build time and fingerprints it under
// assets/. Without it, the game builds a simple placeholder player from shapes.
const FILES = import.meta.glob<string>("./models/*.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

export const PLAYER_HEIGHT = 1.8;

let loading: Promise<THREE.Object3D | undefined> | undefined;

/** Loads the player model once, or resolves undefined so the game uses the placeholder. */
export const loadPlayerModel = (): Promise<THREE.Object3D | undefined> => {
  loading ??= (async () => {
    const url = FILES["./models/player.glb"];
    if (!url) return undefined;
    try {
      const gltf = await gltfLoader().loadAsync(url);
      // The clips go with the model, so a player built from it can play them.
      gltf.scene.animations = gltf.animations;
      return gltf.scene;
    } catch (error) {
      console.warn("Couldn't load player.glb, so using the placeholder", error);
      return undefined;
    }
  })();
  return loading;
};

/** Scales a model to the player's height, stands it on the origin and turns it to face the goal. */
const fit = (model: THREE.Object3D): THREE.Object3D => {
  // Meshy's player faces +Z, towards the camera; the goal is down -Z.
  model.rotation.y = Math.PI;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.getSize(new THREE.Vector3()).y;
  if (height > 0) model.scale.multiplyScalar(PLAYER_HEIGHT / height);

  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  const centre = fitted.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= fitted.min.y;
  return model;
};

type Paint = THREE.ColorRepresentation | ((p: THREE.Vector3) => THREE.ColorRepresentation);

/** Paints a shape one colour, or by where each point is on it, ready to merge. */
const painted = (geometry: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry => {
  geometry.deleteAttribute("uv");
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  const colour = new THREE.Color();
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    colour.set(typeof paint === "function" ? paint(p.fromBufferAttribute(position, i)) : paint);
    colour.toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
};

/** A ball stretched to `radii` along X, Y and Z, at a point. */
const lump = (at: THREE.Vector3Tuple, radii: THREE.Vector3Tuple, detail = 16) =>
  new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75)).scale(...radii).translate(...at);

/** A round shape turned from its outline, radius and height pairs from the bottom up. */
const turned = (outline: readonly [number, number][], segments: number, squash: number) =>
  new THREE.LatheGeometry(
    new THREE.SplineCurve(outline.map(([r, y]) => new THREE.Vector2(r, y)))
      .getPoints(outline.length * 3)
      .map((p) => p.setX(Math.max(p.x, 0))),
    segments,
  ).scale(1, 1, squash);

/**
 * A tube along a path, `radius(s)` thick at each point `s` from 0 to 1 along it: an arm from
 * shoulder to fingertips in one piece, so it bends as one (see hangingArms).
 */
const tube = (path: THREE.Curve<THREE.Vector3>, radius: (s: number) => number, steps = 24) => {
  const sides = 12;
  const frames = path.computeFrenetFrames(steps, false);
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const at = path.getPointAt(i / steps);
    const normal = frames.normals[i] ?? new THREE.Vector3(1, 0, 0);
    const binormal = frames.binormals[i] ?? new THREE.Vector3(0, 0, 1);
    const r = radius(i / steps);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const p = at
        .clone()
        .addScaledVector(normal, Math.cos(a) * r)
        .addScaledVector(binormal, Math.sin(a) * r);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      index.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/** Smoothly from one value to the next, through `keys` of where along and how much. */
const through =
  (keys: readonly [number, number][]) =>
  (s: number): number => {
    const next = keys.findIndex(([at]) => at >= s);
    const [a, b] = [keys[Math.max(next - 1, 0)], keys[Math.max(next, 0)]];
    if (!a || !b || a[0] === b[0]) return b?.[1] ?? 0;
    return a[1] + (b[1] - a[1]) * THREE.MathUtils.smoothstep(s, a[0], b[0]);
  };

/**
 * The shirt's colour at a point on it, in the kit's pattern, laid out as the kit shader lays it
 * out on the model: stripes 5 cm wide with the first down the middle, the first half on the
 * wearer's right, or hoops across the chest.
 */
const shirtIn =
  (kit: Kit) =>
  (p: THREE.Vector3): THREE.ColorRepresentation => {
    const [first = kit.trim, second = kit.trim] = kit.shirt;
    switch (kit.pattern) {
      case "plain":
        return first;
      case "stripes":
        return Math.abs(((p.x / 0.1) % 1) + (p.x < 0 ? 1 : 0) - 0.5) > 0.25 ? first : second;
      case "halves":
        // The wearer faces +Z until they're turned to the goal, so their right is -X.
        return p.x < 0 ? first : second;
      case "band": {
        const hoop = Math.floor((1.3 - p.y) / 0.03);
        return (hoop >= 0 ? kit.shirt[hoop + 1] : undefined) ?? first;
      }
    }
  };

/**
 * A stand-in player made of shapes, 1.8 m tall and built like the model, hands on hips, in the
 * kit's colours. It's painted in vertex colours on white, which the kit shader looks past, since
 * the shader's tuned to find the model's own kit.
 */
const placeholder = (kit: Kit): THREE.Object3D => {
  const skin = 0xc68e65;
  const hair = 0x2a1c14;
  const boots = 0x1c1d22;
  const cloth: THREE.BufferGeometry[] = [
    painted(
      turned(
        [
          [0.17, 0.95],
          [0.163, 1.04],
          [0.162, 1.12],
          [0.178, 1.24],
          [0.195, 1.34],
          [0.2, 1.41],
          [0.185, 1.46],
          [0.12, 1.51],
          [0.06, 1.535],
          [0, 1.54],
        ],
        96,
        0.62,
      ),
      shirtIn(kit),
    ),
    painted(
      new THREE.TorusGeometry(0.068, 0.016, 8, 24)
        .rotateX(Math.PI / 2 - 0.25)
        .translate(0, 1.52, 0.01),
      kit.trim,
    ),
    painted(
      turned(
        [
          [0, 0.8],
          [0.14, 0.82],
          [0.168, 0.9],
          [0.165, 0.98],
          [0.16, 1.02],
          [0, 1.03],
        ],
        32,
        0.62,
      ),
      kit.shorts,
    ),
  ];
  const body: THREE.BufferGeometry[] = [
    // The head, with a jaw, nose and ears, eyes and brows, hair over the back, and a neck.
    painted(lump([0, 1.685, 0], [0.084, 0.115, 0.1], 24), skin),
    painted(lump([0, 1.615, 0.025], [0.068, 0.058, 0.075]), skin),
    painted(lump([0, 1.67, 0.1], [0.016, 0.026, 0.02], 8), skin),
    painted(
      new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.52)
        .rotateX(-0.45)
        .scale(0.092, 0.122, 0.108)
        .translate(0, 1.688, -0.008),
      hair,
    ),
    painted(new THREE.CylinderGeometry(0.052, 0.06, 0.14, 16).translate(0, 1.53, 0), skin),
  ];
  for (const side of [-1, 1]) {
    const x = side * 0.1;
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.2, 1.44, -0.01),
      new THREE.Vector3(side * 0.31, 1.18, -0.07),
      new THREE.Vector3(side * 0.24, 1.02, -0.02),
      new THREE.Vector3(side * 0.19, 0.98, 0.03),
    ]);
    /** The arm from one share of the way along it to another, for a sleeve over it. */
    const along = (from: number, to: number) =>
      new THREE.CatmullRomCurve3([0, 0.5, 1].map((t) => arm.getPointAt(from + (to - from) * t)));
    body.push(
      painted(lump([side * 0.083, 1.68, -0.005], [0.014, 0.028, 0.02], 8), skin),
      painted(lump([side * 0.033, 1.698, 0.087], [0.012, 0.008, 0.006], 8), 0x1d1a18),
      painted(lump([side * 0.035, 1.722, 0.09], [0.02, 0.005, 0.006], 8), hair),
      // The arm, from the shoulder to a hand on the hip, elbow out.
      painted(
        tube(
          arm,
          through([
            [0, 0.054],
            [0.42, 0.042],
            [0.78, 0.03],
            [0.88, 0.042],
            [1, 0.014],
          ]),
          32,
        ),
        skin,
      ),
      // Knees and shins, the socks pulled up to just under the knee, and boots.
      painted(new THREE.CylinderGeometry(0.068, 0.058, 0.22, 16).translate(x, 0.6, 0.005), skin),
      painted(
        new THREE.CylinderGeometry(0.058, 0.042, 0.38, 16).translate(side * 0.105, 0.27, 0),
        kit.socks,
      ),
      painted(
        new THREE.CylinderGeometry(0.063, 0.06, 0.05, 16).translate(side * 0.105, 0.475, 0),
        kit.trim,
      ),
      painted(lump([side * 0.107, 0.05, 0.04], [0.052, 0.05, 0.13]), boots),
    );
    cloth.push(
      painted(new THREE.CylinderGeometry(0.098, 0.1, 0.2, 20).translate(x, 0.8, 0), kit.shorts),
      // A short sleeve over the top of the arm, with a band of trim round its end.
      painted(
        tube(along(0, 0.3), (s) => 0.066 - s * 0.006, 8),
        kit.shirt[0] ?? kit.trim,
      ),
      painted(
        tube(along(0.28, 0.33), () => 0.063, 2),
        kit.trim,
      ),
    );
  }
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      mergeGeometries(cloth),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    ),
    new THREE.Mesh(
      mergeGeometries(body),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    ),
  );
  for (const g of [...cloth, ...body]) g.dispose();
  return group;
};

const isMesh = (o: THREE.Object3D): o is THREE.Mesh => o instanceof THREE.Mesh;

/**
 * How high up the back the name and number are centred: just under the collar, on the model or on
 * the stand-in, which is built to the model's proportions.
 */
const SHIRT_BACK = { model: 1.3, placeholder: 1.3 };

/** The player's name and number, as a decal across the back of the shirt on one of `meshes`. */
const shirtBack = (meshes: THREE.Mesh[], name: string, number: number, height: number) => {
  // Shoots a ray at the upper back from behind, to find the shirt's surface: high enough that the
  // name sits just under the collar, with the number below it.
  const ray = new THREE.Raycaster(new THREE.Vector3(0, height, 3), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObjects(meshes, false)[0];
  const back = meshes.find((m) => m === hit?.object);
  if (!hit || !back) return undefined;

  // Across most of the back, short of the arms, which a wider one would print on too.
  const size = new THREE.Vector3(0.42, 0.42, 0.25);
  const geometry = new DecalGeometry(back, hit.point, new THREE.Euler(), size);
  const material = new THREE.MeshStandardMaterial({
    map: shirtTexture(name, number),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    roughness: 0.8,
  });
  return new THREE.Mesh(geometry, material);
};

/** Prints the player's name and number across their back, where the camera can see it. */
const addShirtBack = (body: THREE.Object3D, name: string, number: number, height: number) => {
  body.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  body.traverse((o) => {
    if (isMesh(o)) meshes.push(o);
  });
  const decal = shirtBack(meshes, name, number, height);
  // DecalGeometry is in world space, which is the body's own space, since it has no parent yet.
  if (decal) body.add(decal);
};

/** Where the player bends: their waist, just above the shorts. */
export const WAIST = 1;
/** How far either side of the waist the bend is blended, so it curves rather than creases. */
const BLEND = 0.12;
/** How far from the middle a piece hanging below the waist has to stay to count as an arm. */
const ARM_GAP = 0.12;

/**
 * The vertices of the arms where they hang down beside the hips, below the top of the bend. Cut
 * there, the body comes apart into a piece across the middle, the hips and legs, and a piece down
 * each side, an arm, cut off at the top. The arms follow the spine, so the hands go with the
 * shoulders rather than stretching. Bits that never reach the cut, like a boot, aren't arms.
 */
const hangingArms = (geometry: THREE.BufferGeometry): Set<number> => {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const arms = new Set<number>();
  if (!index) return arms;
  const cut = WAIST + BLEND;
  const below = (i: number) => position.getY(i) <= cut;

  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] ?? root;
    return root;
  };
  const join = (a: number, b: number) => {
    parent[find(b)] = find(a);
  };
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (!below(a) || !below(b) || !below(c)) continue;
    join(a, b);
    join(a, c);
  }
  // The texture is cut into scraps, so the mesh is too: a vertex on a seam is copied, once for
  // each scrap. Copies in the same place are the same point on the body.
  const seams = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    if (!below(i)) continue;
    const key = [position.getX(i), position.getY(i), position.getZ(i)]
      .map((n) => Math.round(n * 1e4))
      .join();
    const copy = seams.get(key);
    if (copy === undefined) seams.set(key, i);
    else join(copy, i);
  }

  const pieces = new Map<number, { nearest: number; top: number }>();
  for (let i = 0; i < position.count; i++) {
    if (!below(i)) continue;
    const root = find(i);
    const piece = pieces.get(root) ?? { nearest: Infinity, top: -Infinity };
    piece.nearest = Math.min(piece.nearest, Math.abs(position.getX(i)));
    piece.top = Math.max(piece.top, position.getY(i));
    pieces.set(root, piece);
  }
  for (let i = 0; i < position.count; i++) {
    const piece = below(i) ? pieces.get(find(i)) : undefined;
    if (piece && piece.nearest > ARM_GAP && piece.top > cut - 0.05) arms.add(i);
  }
  return arms;
};

/**
 * Gives the body a two-bone skeleton, hips and spine, so it can bend at the waist with its feet
 * planted. A model from Meshy has no skeleton of its own, and leaning is all the game needs: each
 * vertex follows the hips below the waist and the spine above it, blended in between.
 */
const bendAtWaist = (body: THREE.Object3D): { object: THREE.Group; spine: THREE.Bone } => {
  const object = new THREE.Group();
  const hips = new THREE.Bone();
  const spine = new THREE.Bone();
  spine.position.y = WAIST;
  hips.add(spine);
  object.add(hips);

  body.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  body.traverse((o) => {
    if (isMesh(o)) meshes.push(o);
  });
  const skinned = meshes.map((mesh) => {
    // Bakes each mesh's place in the body into its vertices, so they're all in the player's space.
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const position = geometry.getAttribute("position");
    const indices = new Uint16Array(position.count * 4);
    const weights = new Float32Array(position.count * 4);
    const arms = hangingArms(geometry);
    for (let i = 0; i < position.count; i++) {
      const upper = arms.has(i)
        ? 1
        : THREE.MathUtils.smoothstep(position.getY(i), WAIST - BLEND, WAIST + BLEND);
      indices[i * 4 + 1] = 1;
      weights[i * 4] = 1 - upper;
      weights[i * 4 + 1] = upper;
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const part = new THREE.SkinnedMesh(geometry, mesh.material);
    // Its bounds are worked out standing up; leaning could otherwise cull it at the screen's edge.
    part.frustumCulled = false;
    object.add(part);
    return part;
  });

  object.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([hips, spine]);
  for (const part of skinned) part.bind(skeleton);
  return { object, spine };
};

export type Side = "left" | "right";

export interface Player {
  readonly object: THREE.Object3D;
  /** Bends the player sideways at the waist, by an angle in radians (positive is to their left). */
  lean(angle: number): void;
  /** How far down the player is in a duck: 0 standing, 1 all the way down. */
  duck(depth: number): void;
  /** Starts a step into the next lane, to the player's left or right. */
  step(side: Side): void;
  /** How far through a jump the player is: 0 to 1 while in the air, or undefined on the ground. */
  jump(progress: number | undefined): void;
  /** Heads the ball: the head and shoulders snap forward, for a model that has a header. */
  head(): void;
  /**
   * Whether the player falls over by themselves, back and to one side, when a knock to the head
   * takes their last life. If not, the scene topples them whole.
   */
  readonly falls: boolean;
  /** Falls back and to the player's left or right, `seconds` after the knock that did it. */
  fall(side: Side, seconds: number): void;
  /** Moves the player's own animation on by `dt` seconds, for a model that has one. */
  update(dt: number): void;
}

/** The clips the game plays, as tools/player/build-animated.html names them. */
const CLIPS: Record<Side | "jump", string> = {
  left: "step_left",
  right: "step_right",
  jump: "jump",
};
/**
 * Clips the game plays if the model has them, since a player.glb built before them won't: an idle
 * for standing still, a duck, and a fall to either side. Without the idle, the player stands in
 * the model's own pose; without the duck, they bow and crouch instead.
 */
const IDLE_CLIP = "idle";
const DUCK_CLIP = "duck";
const FALL_CLIPS: Record<Side, string> = { left: "fall_left", right: "fall_right" };
/** The jump mirrored, which the player takes turns with, so no two jumps in a row look alike. */
const JUMP_MIRRORED_CLIP = "jump_mirrored";
/**
 * A headbutt's upper body, from the spine up, played as the ball's headed. It goes over whatever
 * the legs are doing, so the player can head the ball standing, stepping or in the air.
 */
const HEADER_CLIP = "header";
/** How long a header takes, in seconds: a little quicker than Mixamo's, to keep up with the ball. */
const HEADER_SECONDS = 0.55;
/**
 * How heavily the header outweighs the pose under it, on the bones it moves. The mixer averages
 * every clip on a bone by weight, so this lets the nod show through the idle, step or jump.
 */
const HEADER_WEIGHT = 6;
/**
 * How far a player without a duck of their own bows forwards from the waist to duck, in radians,
 * and how far they crouch.
 */
const DUCK = { bow: 1.0, crouch: 0.18 };
/** How long the legs take over a step into the next lane, in seconds. The body gets there sooner. */
const STEP_SECONDS = 0.3;
/** How quickly the player blends into a step or a jump, and out again, as a rate per second. */
const BLEND_RATE = 25;
/** The spine's bones, from the hips up, which share a lean or a bow so the back curves. */
const SPINE = ["Spine", "Spine1", "Spine2"];
// The model faces +Z until it's turned round to face the goal, so the spine bends about its own
// axes: a lean to the player's left is a turn about -Z, and a bow towards the goal one about +X.
const LEAN_AXIS = new THREE.Vector3(0, 0, -1);
const BOW_AXIS = new THREE.Vector3(1, 0, 0);

const isSkinned = (o: THREE.Object3D): o is THREE.SkinnedMesh => o instanceof THREE.SkinnedMesh;

/** Whether a model comes rigged, with every clip the game plays. */
const isAnimated = (model: THREE.Object3D): boolean =>
  model.getObjectByProperty("isSkinnedMesh", true) !== undefined &&
  Object.values(CLIPS).every((n) => model.animations.some((c) => c.name === n));

/**
 * Skins a decal like the body it was made on: each of its points moves with the body's nearest
 * point, so the name and number stay on the shirt as the player moves.
 */
const skinLike = (decal: THREE.BufferGeometry, body: THREE.BufferGeometry) => {
  const position = decal.getAttribute("position");
  const from = body.getAttribute("position");
  const [skinIndex, skinWeight] = [body.getAttribute("skinIndex"), body.getAttribute("skinWeight")];
  decal.computeBoundingBox();
  const box = decal.boundingBox?.clone().expandByScalar(0.03);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  // The body's points near the decal, in a grid of 2 cm cells, so each of the decal's points looks
  // only through the cells around it.
  const cell = (n: number) => Math.floor(n / 0.02) + 512;
  const key = (x: number, y: number, z: number) => (x * 1024 + y) * 1024 + z;
  const grid = new Map<number, number[]>();
  for (let i = 0; i < from.count; i++) {
    if (!box?.containsPoint(p.fromBufferAttribute(from, i))) continue;
    const k = key(cell(p.x), cell(p.y), cell(p.z));
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  }
  const nearestTo = (at: THREE.Vector3) => {
    const [x, y, z] = [cell(at.x), cell(at.y), cell(at.z)];
    let [best, distance] = [0, Infinity];
    // Out a cell each way, and further only if there's nothing that near.
    for (let reach = 1; distance === Infinity && reach < 4; reach++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dz = -reach; dz <= reach; dz++) {
            for (const j of grid.get(key(x + dx, y + dy, z + dz)) ?? []) {
              const d = at.distanceToSquared(q.fromBufferAttribute(from, j));
              if (d < distance) [best, distance] = [j, d];
            }
          }
        }
      }
    }
    return best;
  };
  const indices = new Uint16Array(position.count * 4);
  const weights = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) {
    const best = nearestTo(p.fromBufferAttribute(position, i));
    for (const [source, to] of [
      [skinIndex, indices],
      [skinWeight, weights],
    ] as const) {
      to.set([source.getX(best), source.getY(best), source.getZ(best), source.getW(best)], i * 4);
    }
  }
  decal.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  decal.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
};

/** One clip blended into the player's pose, by a weight that eases in and out. */
interface Move {
  readonly action: THREE.AnimationAction;
  weight: number;
}

/**
 * A player rigged and animated in Mixamo (see ASSETS.md), which steps and jumps with its own legs,
 * and idles, ducks and falls over by itself if the model has those clips. It's turned round to face
 * the goal. Its vertices are turned with it, since the kit shader and
 * the shirt's back read them as the player stands, and the skin turns them back before the bones
 * move them.
 */
const animatedPlayer = (model: THREE.Object3D, name: string, number: number, kit: Kit): Player => {
  const figure = cloneSkinned(model);
  const bodies: THREE.SkinnedMesh[] = [];
  figure.traverse((o) => {
    if (isSkinned(o)) bodies.push(o);
  });
  const turn = new THREE.Matrix4().makeRotationY(Math.PI);
  for (const part of bodies) {
    part.geometry = part.geometry.clone().applyMatrix4(turn);
    part.bind(part.skeleton, part.bindMatrix.clone().multiply(turn));
    // Its bounds are worked out standing still; moving could otherwise cull it at the screen's edge.
    part.frustumCulled = false;
  }
  wearKit(figure, kit);
  const [body] = bodies;
  if (!body) throw new Error("An animated player needs a skinned body");

  // The name goes on the body as it stands, where its vertices are in place, then moves with it.
  const back = shirtBack([new THREE.Mesh(body.geometry)], name, number, SHIRT_BACK.model);
  if (back) {
    skinLike(back.geometry, body.geometry);
    const decal = new THREE.SkinnedMesh(back.geometry, back.material);
    decal.frustumCulled = false;
    body.parent?.add(decal);
    decal.bind(body.skeleton, body.bindMatrix);
  }

  const spine = SPINE.map((end) => body.skeleton.bones.find((b) => b.name.endsWith(end))).filter(
    (b) => b !== undefined,
  );
  const hips = spine[0]?.parent;
  // How whatever holds the hips is turned in the model. It doesn't move, so it's found once,
  // before the model's turned round.
  figure.updateMatrixWorld(true);
  const above = new THREE.Quaternion();
  hips?.parent?.matrixWorld.decompose(new THREE.Vector3(), above, new THREE.Vector3());
  figure.rotation.y = Math.PI;
  const object = new THREE.Group();
  object.add(figure);

  const mixer = new THREE.AnimationMixer(figure);
  const clip = (n: string) =>
    model.animations.find((c) => c.name === n) ?? new THREE.AnimationClip(n);
  const move = (c: THREE.AnimationClip): Move => {
    const action = mixer.clipAction(c);
    // The game says how far through each clip the player is, so none runs on by itself.
    action.setEffectiveTimeScale(0).setEffectiveWeight(0).play();
    return { action, weight: 0 };
  };
  // Each side has two copies of its step, so a second step the same way blends in over the first.
  const steps: Record<Side, readonly [Move, Move]> = {
    left: [move(clip(CLIPS.left)), move(clip(CLIPS.left).clone())],
    right: [move(clip(CLIPS.right)), move(clip(CLIPS.right).clone())],
  };
  const has = (n: string) => model.animations.some((c) => c.name === n);
  // The jump, and the same jump mirrored if the model has it. Each jump takes the next turn, so no
  // two in a row look the same, starting with either.
  const jumps: readonly [Move, ...Move[]] = [
    move(clip(CLIPS.jump)),
    ...(has(JUMP_MIRRORED_CLIP) ? [move(clip(JUMP_MIRRORED_CLIP))] : []),
  ];
  let jumpTurn = Math.floor(Math.random() * jumps.length);
  let jumping = jumps[jumpTurn] ?? jumps[0];
  const heading = has(HEADER_CLIP) ? move(clip(HEADER_CLIP)) : undefined;
  /** How long ago the ball was headed, in seconds, while the header's still playing. */
  let headed: number | undefined;
  const idling = has(IDLE_CLIP) ? move(clip(IDLE_CLIP)) : undefined;
  if (idling) {
    // The idle runs on by itself, looping, and the player starts in it.
    idling.action.setEffectiveTimeScale(1);
    idling.weight = 1;
  }
  const ducking = has(DUCK_CLIP) ? move(clip(DUCK_CLIP)) : undefined;
  const falls =
    has(FALL_CLIPS.left) && has(FALL_CLIPS.right)
      ? { left: move(clip(FALL_CLIPS.left)), right: move(clip(FALL_CLIPS.right)) }
      : undefined;
  const moves = [
    ...steps.left,
    ...steps.right,
    ...jumps,
    idling,
    ducking,
    falls?.left,
    falls?.right,
  ].filter((m) => m !== undefined);
  let stepping: { move: Move; seconds: number } | undefined;
  let airborne: number | undefined;
  let depth = 0;
  let falling: { move: Move; seconds: number } | undefined;

  let leanAngle = 0;
  let bowAngle = 0;
  /** The spine as the clips last left it, before it's bent. */
  const unbent = spine.map((b) => b.quaternion.clone());
  /** Shares the lean and the bow between the spine's bones, each turned about the model's axes. */
  const bend = () => {
    const parent = above.clone().multiply(hips?.quaternion ?? new THREE.Quaternion());
    spine.forEach((b, i) => {
      const local = parent.clone().invert();
      const share = (axis: THREE.Vector3, angle: number) =>
        new THREE.Quaternion().setFromAxisAngle(
          axis.clone().applyQuaternion(local),
          angle / spine.length,
        );
      b.quaternion.copy(unbent[i] ?? b.quaternion);
      b.quaternion.premultiply(share(BOW_AXIS, bowAngle).multiply(share(LEAN_AXIS, leanAngle)));
      parent.multiply(b.quaternion);
    });
  };

  return {
    object,
    lean: (angle) => {
      leanAngle = angle;
      bend();
    },
    duck: (d) => {
      depth = d;
      if (ducking) return;
      // Without a duck of its own, it bows from the waist and crouches.
      bowAngle = d * DUCK.bow;
      const crouch = d * DUCK.crouch;
      figure.scale.set(1 + crouch / 2, 1 - crouch, 1 + crouch / 2);
      bend();
    },
    step: (side) => {
      const [first, second] = steps[side];
      stepping = { move: stepping?.move === first ? second : first, seconds: 0 };
    },
    jump: (progress) => {
      if (airborne === undefined && progress !== undefined) {
        jumpTurn = (jumpTurn + 1) % jumps.length;
        jumping = jumps[jumpTurn] ?? jumps[0];
      }
      airborne = progress;
    },
    head: () => {
      if (heading) headed = 0;
    },
    falls: falls !== undefined,
    fall: (side, seconds) => {
      const fall = falls?.[side];
      if (fall) falling = { move: fall, seconds };
    },
    update: (dt) => {
      if (stepping) {
        stepping.seconds += dt;
        const p = Math.min(stepping.seconds / STEP_SECONDS, 1);
        stepping.move.action.time = p * stepping.move.action.getClip().duration;
        if (p === 1) stepping = undefined;
      }
      if (airborne !== undefined) {
        jumping.action.time = airborne * jumping.action.getClip().duration;
      }
      if (ducking) ducking.action.time = depth * ducking.action.getClip().duration;
      if (falling) {
        const { move: fall, seconds } = falling;
        fall.action.time = Math.min(seconds, fall.action.getClip().duration);
      }
      // A fall takes the whole body. Otherwise in the air the jump has the legs, and on the ground
      // a duck, or else a step, or else the idle. Each eases out from where it ended, back into the
      // idle, or without one, to standing.
      const leading =
        falling?.move ??
        (airborne !== undefined ? jumping : depth > 0 && ducking ? ducking : stepping?.move) ??
        idling;
      for (const m of moves) {
        m.weight += ((m === leading ? 1 : 0) - m.weight) * Math.min(1, dt * BLEND_RATE);
        m.action.setEffectiveWeight(m.weight);
      }
      // A header goes over the top of all that, from the spine up, unless the player's falling.
      if (heading) {
        if (headed !== undefined) {
          headed += dt;
          const p = Math.min(headed / HEADER_SECONDS, 1);
          heading.action.time = p * heading.action.getClip().duration;
          if (p === 1) headed = undefined;
        }
        const target = headed !== undefined && !falling ? HEADER_WEIGHT : 0;
        heading.weight += (target - heading.weight) * Math.min(1, dt * BLEND_RATE);
        heading.action.setEffectiveWeight(heading.weight);
      }
      // The mixer only sets what's changed since it last did, so the spine goes back to how it
      // left it before it moves on, then it's bent again.
      spine.forEach((b, i) => b.quaternion.copy(unbent[i] ?? b.quaternion));
      mixer.update(dt);
      spine.forEach((b, i) => unbent[i]?.copy(b.quaternion));
      bend();
    },
  };
};

/**
 * The player, standing on the origin and facing the goal, in their kit with their name and number
 * on their back. Leaning at the waist swings their head into a lane. A model animated in Mixamo
 * steps and jumps with its own legs; any other is lifted whole, and bows and crouches to duck.
 */
export const buildPlayer = (
  model: THREE.Object3D | undefined,
  name: string,
  number: number,
  kit: Kit,
): Player => {
  if (model && isAnimated(model)) return animatedPlayer(model, name, number, kit);
  const body = new THREE.Group();
  body.add(wearKit(fit(model ? model.clone() : placeholder(kit)), kit));
  addShirtBack(body, name, number, model ? SHIRT_BACK.model : SHIRT_BACK.placeholder);
  const { object, spine } = bendAtWaist(body);
  return {
    object,
    lean: (angle) => {
      spine.rotation.z = angle;
    },
    duck: (depth) => {
      spine.rotation.x = -depth * DUCK.bow;
      // The hips hold the whole body, so squashing them crouches it down to the ground.
      const crouch = depth * DUCK.crouch;
      spine.parent?.scale.set(1 + crouch / 2, 1 - crouch, 1 + crouch / 2);
    },
    step: () => undefined,
    jump: () => undefined,
    head: () => undefined,
    falls: false,
    fall: () => undefined,
    update: () => undefined,
  };
};
