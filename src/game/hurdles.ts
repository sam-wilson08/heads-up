import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { HurdleKind } from "../venues";
import type { Lane } from "./engine";
import { type Paint, part as painted, solid } from "./props/shapes";

// What comes along the ground for the player to jump or step round: a training hurdle, or
// something that belongs at the venue, like sunbathers on the beach or sleds in the snow. Each
// covers some of the three lanes, built from simple shapes with its leading edge on the origin and
// the rest trailing back towards the goal (-Z). The materials are shared; the shapes are each
// hurdle's own, for the scene to free. The Colosseum's spears are the odd ones out: they don't come
// along the ground at all, but thrust in from the side at head height, to be ducked. So are Sakura
// Peak's ninjas' staffs, swept in low from the side, to be jumped.

export interface Hurdle {
  readonly object: THREE.Object3D;
  /** The shadow under it: how wide and deep, and where its middle is. */
  readonly shadow: {
    readonly width: number;
    readonly depth: number;
    readonly x: number;
    readonly z: number;
  };
  /** Shows it being tripped over, from `t` 0 (not yet) to 1 (done). */
  trip(t: number): void;
  /**
   * For one that doesn't come along the ground, like a spear: shows it `ms` from when it reaches
   * the player (negative before), in place of the scene sliding it down its lanes.
   */
  thrust?(ms: number, tripped: boolean): void;
}

/** Lit by the scene, with no shine: wood, cloth. */
const rough = (colour: number) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8 });

/** Adds a shape to a group, placed, turned and scaled. */
const part = (
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
};

/** Turns a shape that stands up the Y axis to lie along X. */
const ALONG_X = [0, 0, Math.PI / 2] as const;
/** Or across, along Z. */
const ACROSS = [Math.PI / 2, 0, 0] as const;

// The hurdles pass right by the player, so they're modelled to sit beside them: real proportions,
// rounded edges that catch the light, and surfaces with a sheen. Those with many parts are painted
// in vertex colours and merged, as the crowd is (see ./crowd), so each is a few meshes for the
// scene to give ghosts.

/** Lit by the scene, with a sheen: painted steel, plastic, rubber. */
const satin = (colour: number, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({ color: colour, roughness });

/** For shapes painted in vertex colours. */
const painting = (roughness: number) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness });

/** A box with rounded edges, indexed like the other shapes so it merges with them. */
const rounded = (width: number, height: number, depth: number, radius: number, segments = 2) =>
  mergeVertices(new RoundedBoxGeometry(width, height, depth, segments, radius));

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = v(0, 1, 0);

/** Puts a shape that stands up the Y axis between two points, by its middle. */
const spanning = (geometry: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3) => {
  const middle = from.clone().lerp(to, 0.5);
  return geometry
    .applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()),
    )
    .translate(middle.x, middle.y, middle.z);
};

/** A tapering limb from one joint to another, painted, ready to merge. Joints are added apart. */
const limb = (from: THREE.Vector3, to: THREE.Vector3, radii: [number, number], paint: Paint) =>
  spanning(
    painted(
      new THREE.CylinderGeometry(radii[1], radii[0], from.distanceTo(to), 10, 1, true),
      paint,
    ),
    from,
    to,
  );

/** A rounded lump, an ellipsoid with its radii along X, Y and Z, painted, ready to merge. */
const lump = (
  at: THREE.Vector3Tuple,
  radii: THREE.Vector3Tuple,
  paint: Paint,
  turn: THREE.Vector3Tuple = [0, 0, 0],
) => painted(new THREE.SphereGeometry(1, 14, 10), paint, at, turn, radii);

/** Merges shapes that share a material into one, freeing the pieces. */
const merged = (parts: THREE.BufferGeometry[]) => {
  const geometry = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return geometry;
};

/** The shadow under some lanes, `spacing` apart. */
const shadowOver = (lanes: readonly Lane[], spacing: number, depth: number, z: number) => {
  const left = Math.min(...lanes) * spacing;
  const right = Math.max(...lanes) * spacing;
  return { width: right - left + spacing + 0.2, depth, x: (left + right) / 2, z };
};

// --- Training hurdle ----------------------------------------------------------------------------

const HURDLE_HEIGHT = 0.55;
/** About how long each red or white stripe along the board is. */
const HURDLE_STRIPE = 0.2;
/** Powder-coated steel, a pale grey that shows on grass and in the dark alike. */
const HURDLE_FRAME = satin(0xc9ced4, 0.4);
/** The brackets that hold the board, and the rubber feet. */
const HURDLE_FITTINGS = satin(0x3c4048, 0.7);
let hurdleBoard: THREE.MeshStandardMaterial | undefined;

/**
 * The board's glossy plastic, striped by a picture of one red stripe and one white: each board's
 * shape says how many fit along it. Each stripe's a touch darker at its edges, where it's moulded,
 * and scuffed here and there. Made the first time it's needed.
 */
const boardMaterial = (): THREE.MeshStandardMaterial => {
  if (hurdleBoard) return hurdleBoard;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    for (const [x, colour, edge] of [
      [0, "#d93a33", "#b52c27"],
      [64, "#f2f1ec", "#d6d5cf"],
    ] as const) {
      ctx.fillStyle = edge;
      ctx.fillRect(x, 0, 64, 16);
      ctx.fillStyle = colour;
      ctx.fillRect(x + 2, 1, 60, 14);
    }
    ctx.fillStyle = "rgba(60, 50, 40, 0.18)";
    for (const [x, y, w] of [
      [20, 9, 9],
      [83, 4, 6],
      [104, 11, 12],
    ] as const) {
      ctx.fillRect(x, y, w, 1);
    }
  }
  const stripes = new THREE.CanvasTexture(canvas);
  stripes.colorSpace = THREE.SRGBColorSpace;
  stripes.wrapS = THREE.RepeatWrapping;
  hurdleBoard = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.35 });
  return hurdleBoard;
};

/** A board `width` long, in an odd number of stripes so it's red at both ends. */
const stripedBoard = (width: number): THREE.BufferGeometry => {
  const geometry = rounded(width, 0.1, 0.03, 0.012, 3);
  const stripes = Math.max(3, 2 * Math.round((width / HURDLE_STRIPE - 1) / 2) + 1);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, ((position.getX(i) / width + 0.5) * stripes) / 2, 0.5);
  }
  return geometry;
};

/** Lanes side by side, in runs: [-1, 0, 1] is one run, and [-1, 1] two. */
const runs = (lanes: readonly Lane[]): Lane[][] => {
  const sorted = [...lanes].sort((a, b) => a - b);
  const grouped: Lane[][] = [];
  for (const lane of sorted) {
    const run = grouped.at(-1);
    if (run && lane - (run.at(-1) ?? lane) === 1) run.push(lane);
    else grouped.push([lane]);
  }
  return grouped;
};

/**
 * Training hurdles: a striped plastic board held in brackets on two steel legs, braced to flat
 * feet that trail back towards the goal, with rubber caps on their ends: one across each run of
 * lanes side by side. Tripped over, they fall flat.
 */
const trainingHurdles = (lanes: readonly Lane[], spacing: number): Hurdle => {
  const object = new THREE.Group();
  const board = boardMaterial();
  const groups = runs(lanes).map((run) => {
    const group = new THREE.Group();
    const width = run.length * spacing + 0.1;
    group.position.x = (((run[0] ?? 0) + (run.at(-1) ?? 0)) / 2) * spacing;
    part(group, stripedBoard(width), board, [0, HURDLE_HEIGHT - 0.05, 0]);
    // The frame and the fittings are a mesh each.
    const frame: THREE.BufferGeometry[] = [];
    const fittings: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const x = (side * width) / 2;
      frame.push(
        rounded(0.035, HURDLE_HEIGHT - 0.02, 0.035, 0.008).translate(
          x,
          HURDLE_HEIGHT / 2 - 0.01,
          0,
        ),
        rounded(0.045, 0.025, 0.5, 0.008).translate(x, 0.0125, -0.23),
        spanning(
          new THREE.CylinderGeometry(0.01, 0.01, 0.27, 8),
          v(x, 0.22, -0.01),
          v(x, 0.02, -0.2),
        ),
      );
      fittings.push(
        rounded(0.055, 0.13, 0.05, 0.012).translate(x, HURDLE_HEIGHT - 0.05, 0),
        rounded(0.05, 0.035, 0.05, 0.012).translate(x, 0.0175, 0),
        rounded(0.05, 0.035, 0.05, 0.012).translate(x, 0.0175, -0.46),
      );
    }
    group.add(
      new THREE.Mesh(merged(frame), HURDLE_FRAME),
      new THREE.Mesh(merged(fittings), HURDLE_FITTINGS),
    );
    object.add(group);
    return group;
  });
  return {
    object,
    shadow: shadowOver(lanes, spacing, 0.6, -0.1),
    trip: (t) => {
      for (const group of groups) group.rotation.x = t * (Math.PI / 2);
    },
  };
};

// --- Sunbathers ---------------------------------------------------------------------------------

/** Skin with a sheen of sun cream, and the trunks. */
const SKIN = painting(0.55);
const TOWELLING = painting(0.95);
const SHADES = painting(0.1);
const SUNBURN = new THREE.Color(0xe8665a);
/** Each lane's sunbather has their own skin, hair, trunks and towel, and a knee up or not. */
const SUNBATHERS: Record<
  Lane,
  {
    readonly skin: number;
    readonly hair: number;
    readonly trunks: number;
    readonly towel: readonly [number, number];
    readonly knee: boolean;
  }
> = {
  [-1]: {
    skin: 0xe9b995,
    hair: 0x9a6a3a,
    trunks: 0x2f5fb8,
    towel: [0xf2c13a, 0xf4f1e8],
    knee: true,
  },
  0: { skin: 0xc98d62, hair: 0x2a1c14, trunks: 0xc8323d, towel: [0x2a9fac, 0xf4f1e8], knee: false },
  1: { skin: 0x8a5a3c, hair: 0x15100d, trunks: 0x2a8a7d, towel: [0xe8708f, 0xf4f1e8], knee: true },
};
/** Where the upper body bends to sit up: at the hips. */
const HIPS = v(0, 0.1, 0);

/**
 * A man sunbathing on a striped towel, flat on his back down the lane with his head towards the
 * player on a rolled-up towel, his sunglasses on, his hands on his belly, and the tops of him
 * caught by the sun. Returns him and his top half, which sits up. He's narrow enough, hands in,
 * to keep to his lane.
 */
const sunbather = (lane: Lane): { man: THREE.Group; upper: THREE.Group } => {
  const look = SUNBATHERS[lane];
  const skin = new THREE.Color(look.skin);
  /** Skin, redder where it faces the sun: the top of a part, `p` on a ball of radius 1. */
  const tanned = (burn: number) => (p: THREE.Vector3) =>
    skin.clone().lerp(SUNBURN, burn * THREE.MathUtils.smoothstep(p.y, 0.1, 0.9));
  // Built lying along X, head to the left, then turned to lie down the lane.
  const man = new THREE.Group();

  // The towel, a little worn at the ends, and a second one rolled up for a pillow.
  const towel: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    towel.push(
      painted(rounded(1.9, 0.012, 0.09, 0.005, 1), look.towel[i % 2] ?? look.towel[0], [
        0.02,
        0.006,
        (i - 2) * 0.09,
      ]),
    );
  }
  towel.push(
    painted(
      new THREE.CapsuleGeometry(0.05, 0.3, 4, 14),
      (p) => (Math.abs(p.y) < 0.05 ? look.towel[0] : look.towel[1]),
      [-0.86, 0.05, 0],
      ACROSS,
    ),
  );
  man.add(solid(towel, TOWELLING));

  // Below the waist: his trunks, and his legs, one knee up, with joints rounded over.
  const lower: THREE.BufferGeometry[] = [lump([-0.04, 0.1, 0], [0.15, 0.1, 0.165], look.trunks)];
  for (const side of [-1, 1]) {
    const z = side * 0.085;
    const hip = v(0, 0.085, z);
    const bent = look.knee && side < 0;
    const knee = bent ? v(0.3, 0.34, z) : v(0.42, 0.075, z);
    const ankle = bent ? v(0.6, 0.055, z) : v(0.8, 0.055, z);
    lower.push(
      limb(hip, knee, [0.075, 0.055], look.skin),
      limb(knee, ankle, [0.052, 0.034], look.skin),
      lump([knee.x, knee.y, knee.z], [0.055, 0.055, 0.055], look.skin),
      // A leg of his trunks, over the top of his thigh.
      limb(hip, hip.clone().lerp(knee, 0.3), [0.085, 0.078], look.trunks),
      bent
        ? lump([ankle.x + 0.06, 0.03, z], [0.11, 0.032, 0.042], look.skin)
        : lump([ankle.x + 0.03, 0.1, z], [0.045, 0.1, 0.042], look.skin, [0, 0, 0.35]),
    );
  }
  man.add(solid(lower, SKIN));

  // Above the waist pivots at the hips, so he can sit up.
  const upper = new THREE.Group();
  upper.position.copy(HIPS);
  man.add(upper);
  const top: THREE.BufferGeometry[] = [
    lump([-0.5, 0.11, 0], [0.2, 0.11, 0.17], tanned(0.5)),
    // His belly, which the sun's caught most.
    lump([-0.27, 0.12, 0], [0.17, 0.125, 0.15], tanned(0.75)),
    limb(v(-0.7, 0.11, 0), v(-0.62, 0.11, 0), [0.052, 0.055], look.skin),
  ];
  for (const side of [-1, 1]) {
    const shoulder = v(-0.6, 0.11, side * 0.17);
    const elbow = v(-0.36, 0.07, side * 0.19);
    const hand = v(-0.27, 0.22, side * 0.05);
    top.push(
      lump([shoulder.x, shoulder.y, shoulder.z], [0.07, 0.065, 0.06], tanned(0.6)),
      limb(shoulder, elbow, [0.045, 0.038], look.skin),
      limb(elbow, hand, [0.038, 0.03], look.skin),
      lump([elbow.x, elbow.y, elbow.z], [0.04, 0.04, 0.04], look.skin),
      lump([hand.x, hand.y + 0.01, hand.z], [0.05, 0.022, 0.04], tanned(0.3)),
    );
  }
  // His head, face to the sky, with his hair towards the player.
  const head = v(-0.84, 0.15, 0);
  top.push(
    lump([head.x, head.y, 0], [0.115, 0.1, 0.08], look.skin),
    lump([head.x + 0.075, head.y - 0.01, 0], [0.06, 0.075, 0.065], look.skin),
    lump([head.x - 0.025, head.y, 0], [0.105, 0.1, 0.086], look.hair),
    lump([head.x + 0.03, head.y + 0.1, 0], [0.03, 0.022, 0.018], tanned(1)),
  );
  for (const side of [-1, 1]) {
    top.push(lump([head.x + 0.02, head.y, side * 0.08], [0.025, 0.03, 0.012], look.skin));
  }
  const body = solid(top, SKIN);
  body.position.sub(HIPS);
  upper.add(body);

  // Sunglasses, shiny black: two lenses, the bridge between and arms back to his ears.
  const glasses: THREE.BufferGeometry[] = [
    limb(
      v(head.x - 0.015, head.y + 0.104, -0.012),
      v(head.x - 0.015, head.y + 0.104, 0.012),
      [0.006, 0.006],
      0x141418,
    ),
  ];
  for (const side of [-1, 1]) {
    glasses.push(
      lump([head.x - 0.012, head.y + 0.1, side * 0.036], [0.026, 0.01, 0.024], 0x141418),
      limb(
        v(head.x - 0.012, head.y + 0.096, side * 0.058),
        v(head.x + 0.015, head.y + 0.01, side * 0.082),
        [0.005, 0.005],
        0x141418,
      ),
    );
  }
  const shades = solid(glasses, SHADES);
  shades.position.sub(HIPS);
  upper.add(shades);

  man.rotation.y = Math.PI / 2;
  man.scale.setScalar(0.92);
  return { man, upper };
};

/**
 * A sunbather in each lane. They lie far enough back that, stopped by a trip, their heads are at
 * the player's toes rather than under them. Tripped over, they sit bolt upright.
 */
const sunbathers = (lanes: readonly Lane[], spacing: number): Hurdle => {
  const object = new THREE.Group();
  const uppers = lanes.map((lane) => {
    const { man, upper } = sunbather(lane);
    man.position.set(lane * spacing, 0, -1.1);
    object.add(man);
    return upper;
  });
  return {
    object,
    shadow: shadowOver(lanes, spacing, 1.8, -1.1),
    trip: (t) => {
      for (const upper of uppers) upper.rotation.z = -t * 1.25;
    },
  };
};

// --- Sleds --------------------------------------------------------------------------------------

/** Varnished wood and painted steel, with a sheen. */
const SLED_FINISH = painting(0.45);
/** Each slat's its own shade of wood. */
const WOOD = [0xc0803f, 0xb07034, 0xc88a48] as const;
const WOOD_DARK = 0x8f5428;
const RUNNER = new THREE.Color(0xc62828);
/** Where the runners have worn through to the steel, underneath. */
const STEEL = new THREE.Color(0xb9bec6);
const ROPE = 0xe3d6b8;
const SLED = { width: 0.4, length: 1.1 };
/** How far back each lane's sled is, so they look like they're racing. */
const STAGGER: Record<Lane, number> = { [-1]: -0.12, 0: 0, 1: -0.24 };

/**
 * A wooden sled heading down +Z: a deck of varnished slats, darker where hands and boots have
 * worn their ends, on red steel runners that sweep up at the front and curl back to the deck, worn
 * bright underneath. Its pull rope's tied to the front bar and coiled on the deck. Its front is on
 * its origin.
 */
const woodenSled = (): THREE.Group => {
  const { width, length } = SLED;
  const front = -0.12;
  const middle = front - length / 2;
  const runnerX = width / 2 - 0.03;
  const parts: THREE.BufferGeometry[] = [];
  for (const i of [-1, 0, 1]) {
    const wood = new THREE.Color(WOOD[i + 1] ?? WOOD[0]);
    const worn = wood.clone().multiplyScalar(0.72);
    parts.push(
      painted(
        rounded(width / 3 - 0.018, 0.035, length, 0.012),
        (p) => wood.clone().lerp(worn, THREE.MathUtils.smoothstep(Math.abs(p.z), 0.4, 0.55)),
        [(i * width) / 3, 0.245, middle],
      ),
    );
  }
  const bars = [middle - 0.4, middle, middle + 0.4];
  for (const z of bars) {
    parts.push(painted(rounded(width, 0.04, 0.07, 0.015), WOOD_DARK, [0, 0.205, z]));
  }
  parts.push(
    painted(
      new THREE.CylinderGeometry(0.022, 0.022, width - 0.02, 12),
      WOOD_DARK,
      [0, 0.245, front],
      [0, 0, Math.PI / 2],
    ),
  );
  for (const side of [-1, 1]) {
    const x = side * runnerX;
    const runner = new THREE.CatmullRomCurve3(
      [
        [-1.27, 0.06],
        [-1.19, 0.02],
        [-0.6, 0.016],
        [-0.2, 0.018],
        [-0.05, 0.06],
        [-0.005, 0.14],
        [-0.04, 0.215],
        [front, 0.245],
      ].map(([z = 0, y = 0]) => v(x, y, z)),
      false,
      "centripetal",
    );
    parts.push(
      painted(new THREE.TubeGeometry(runner, 64, 0.018, 8), (p) =>
        RUNNER.clone().lerp(STEEL, 1 - THREE.MathUtils.smoothstep(p.y, 0.008, 0.02)),
      ),
    );
    for (const z of bars) {
      parts.push(
        painted(
          spanning(
            new THREE.CylinderGeometry(0.013, 0.013, 0.19, 8),
            v(x, 0.02, z),
            v(x, 0.205, z),
          ),
          RUNNER,
        ),
      );
    }
  }
  // The rope, from a knot on the front bar back to its coil.
  const coil = middle + 0.2;
  parts.push(
    painted(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          v(0, 0.265, front),
          v(0.03, 0.272, front - 0.12),
          v(0.06, 0.278, coil + 0.08),
        ]),
        12,
        0.012,
        6,
      ),
      ROPE,
    ),
    painted(new THREE.SphereGeometry(0.022, 10, 8), ROPE, [0, 0.262, front]),
    painted(new THREE.TorusGeometry(0.1, 0.013, 6, 28), ROPE, [0, 0.276, coil], ACROSS),
    painted(
      new THREE.TorusGeometry(0.082, 0.013, 6, 28),
      ROPE,
      [0.012, 0.298, coil - 0.01],
      ACROSS,
    ),
  );
  const body = new THREE.Group();
  body.add(solid(parts, SLED_FINISH));
  return body;
};

/**
 * Sleds racing down the pitch at the player, one in each lane. Tripped over, they tip onto their
 * sides.
 */
const sleds = (lanes: readonly Lane[], spacing: number): Hurdle => {
  const object = new THREE.Group();
  const pivots = lanes.map((lane) => {
    // Each tips over its right-hand runner, so it turns about that.
    const pivot = new THREE.Group();
    pivot.position.set(lane * spacing + SLED.width / 2, 0, STAGGER[lane]);
    const sled = woodenSled();
    sled.position.x = -SLED.width / 2;
    pivot.add(sled);
    object.add(pivot);
    return pivot;
  });
  return {
    object,
    shadow: shadowOver(lanes, spacing, 1.4, -0.7),
    trip: (t) => {
      for (const pivot of pivots) pivot.rotation.z = -t * (Math.PI / 2);
    },
  };
};

// --- Spears -------------------------------------------------------------------------------------

const SHAFT = rough(0x8a5a2e);
const IRON = new THREE.MeshStandardMaterial({ color: 0xc4c8cf, metalness: 1, roughness: 0.3 });
const SPEAR_BRONZE = new THREE.MeshStandardMaterial({
  color: 0xc08a36,
  metalness: 1,
  roughness: 0.38,
});
const TASSEL = rough(0xb3201c);
/**
 * Where a spear thrusts across: just behind a standing player's head, towards the camera, and as
 * high as their eyes seen from up there.
 */
const SPEAR = { y: 1.74, z: 0.2, length: 4.5 };
/** How long a spear takes to thrust in, how long it's held there, and how long to pull it back. */
const JAB_MS = 260;
const HOLD_MS = 220;
const SPEARED_HOLD_MS = 520;
const WITHDRAW_MS = 360;
/** Where its tip waits before the thrust: far enough out to be off the widest screen. */
const POISED = 7;

/**
 * A Roman spear lying along X with its tip on the origin, pointing +X: an iron leaf of a blade on
 * a bronze socket, a red tassel, and a long ash shaft trailing back out of view.
 */
const spearShape = (): THREE.Group => {
  const spear = new THREE.Group();
  // The blade, a four-sided cone flattened into a leaf, pointing along +X.
  part(
    spear,
    new THREE.ConeGeometry(0.06, 0.34, 4),
    IRON,
    [-0.17, 0, 0],
    [0, 0, -Math.PI / 2],
    [1, 1, 0.4],
  );
  part(
    spear,
    new THREE.CylinderGeometry(0.026, 0.03, 0.14, 10),
    SPEAR_BRONZE,
    [-0.41, 0, 0],
    ALONG_X,
  );
  part(
    spear,
    new THREE.TorusGeometry(0.031, 0.009, 6, 14),
    SPEAR_BRONZE,
    [-0.48, 0, 0],
    [0, Math.PI / 2, 0],
  );
  // The tassel hangs from below the socket.
  part(spear, new THREE.ConeGeometry(0.035, 0.16, 8), TASSEL, [-0.46, -0.1, 0], [Math.PI, 0, 0]);
  part(
    spear,
    new THREE.CylinderGeometry(0.022, 0.022, SPEAR.length, 10),
    SHAFT,
    [-0.48 - SPEAR.length / 2, 0, 0],
    ALONG_X,
  );
  return spear;
};

/**
 * A spear thrust in from the side by a gladiator out of sight, across the lanes it covers, which
 * are always at one edge. It reaches the furthest of them just as it arrives, held there a moment,
 * then pulled back. Unlike a hurdle it stays out of view until then: the screen's edge flashing is
 * the warning (see ./twists/colosseum.ts). Speared, it's held a moment longer, quivering.
 */
const spears = (lanes: readonly Lane[], spacing: number): Hurdle => {
  const object = new THREE.Group();
  // It comes from the side whose edge lane it covers, pointing in.
  const side = lanes.includes(-1) ? -1 : 1;
  const furthest = side < 0 ? Math.max(...lanes) : Math.min(...lanes);
  const reach = furthest * spacing - side * spacing * 0.42;
  const spear = spearShape();
  spear.scale.x = -side;
  spear.position.set(reach, SPEAR.y, SPEAR.z);
  object.add(spear);
  return {
    object,
    shadow: { width: 0, depth: 0, x: 0, z: 0 },
    trip: () => undefined,
    thrust: (ms, tripped) => {
      const hold = tripped ? SPEARED_HOLD_MS : HOLD_MS;
      const out =
        ms < 0
          ? (1 - THREE.MathUtils.clamp(1 + ms / JAB_MS, 0, 1)) ** 3
          : THREE.MathUtils.smoothstep(ms, hold, hold + WITHDRAW_MS);
      spear.position.x = reach + side * out * POISED;
      spear.visible = out < 1;
      const quiver =
        tripped && ms > 0 ? Math.sin(ms * 0.09) * 0.03 * Math.max(0, 1 - ms / hold) : 0;
      spear.rotation.set(0, quiver, quiver * 0.5);
    },
  };
};

// --- Staffs -------------------------------------------------------------------------------------

/** Dark lacquered oak, bound with black cord, and capped with iron. */
const STAFF_WOOD = satin(0x4a2414, 0.4);
const CORD = rough(0x171412);
/**
 * Where a ninja's staff sweeps across: low, at the player's shins, and through where they stand.
 * The ninja's hands, at its end, are off the side of the pitch, `out` from the middle, out of sight
 * on a phone. How thick it is, and how far past the furthest lane it reaches, in lanes.
 */
const STAFF = { y: 0.26, z: 0, out: 1.9, radius: 0.026, past: 0.55 };
/**
 * How long before it sweeps in the ninja draws it back into view at the side, and how far back
 * they hold it, angled down the pitch. Then how long it takes to whip across, and on through
 * towards the camera, and how far. Caught on the player's shins, it's held there a moment.
 */
const WIND_UP_MS = 650;
const BACK = THREE.MathUtils.degToRad(58);
const SWEEP_MS = 230;
const THROUGH_MS = 280;
const THROUGH = THREE.MathUtils.degToRad(-75);
const CAUGHT_MS = 500;
/** How far out of sight the ninja draws the staff from, and takes it back to, in metres. */
const AWAY = 1.4;

/** A bo staff lying along X from its end on the origin, `length` long. */
const staffShape = (length: number): THREE.Group => {
  const staff = new THREE.Group();
  const r = STAFF.radius;
  part(
    staff,
    new THREE.CylinderGeometry(r, r, length, 10),
    STAFF_WOOD,
    [length / 2, 0, 0],
    ALONG_X,
  );
  // Cord bound round it near each end, and the grip where the ninja holds it.
  const binding = new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.09, 10);
  for (const at of [0.08, 0.38, length - 0.08]) {
    part(staff, binding, CORD, [at, 0, 0], ALONG_X);
  }
  const cap = new THREE.SphereGeometry(r * 1.15, 10, 8);
  for (const at of [0, length]) part(staff, cap, IRON, [at, 0, 0]);
  return staff;
};

/**
 * A ninja's staff swept in low from the side by a ninja out of sight, across the edge lane it
 * covers and no further. Just before, the ninja draws it back into view at the side, angled down the pitch, and as it arrives
 * it whips across through where the player stands and on towards the camera, a blur trailing it,
 * then it's drawn back out of sight. The screen's edge flashing is the warning, as for a spear
 * (see ./SweepHud.tsx). Caught on the player's shins, it stops there a moment.
 */
const staffs = (lanes: readonly Lane[], spacing: number, from: -1 | 1): Hurdle => {
  const object = new THREE.Group();
  const furthest = from < 0 ? Math.max(...lanes) : Math.min(...lanes);
  const tip = furthest * spacing - from * spacing * STAFF.past;
  const length = Math.abs(tip - from * STAFF.out);
  // Turned about the ninja's hands, pointing in: mirrored from the right. From either side, a
  // positive swing is drawn back down the pitch towards the goal, and a negative one on through.
  const hands = new THREE.Group();
  hands.scale.x = -from;
  hands.add(staffShape(length));
  // The blur: a fan of the circle the staff's outer half sweeps, trailing behind it, strongest
  // along the staff and fading away from it. It has no ghost: see ../scene.ts.
  const blurMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fan = THREE.MathUtils.degToRad(30);
  const blurShape = new THREE.RingGeometry(length * 0.45, length, 12, 1, 0, fan);
  const corners = blurShape.getAttribute("position");
  const fading: number[] = [];
  for (let i = 0; i < corners.count; i++) {
    const behind = Math.atan2(corners.getY(i), corners.getX(i)) / fan;
    fading.push(1, 1, 1, (1 - behind) ** 2);
  }
  blurShape.setAttribute("color", new THREE.Float32BufferAttribute(fading, 4));
  const blur = new THREE.Mesh(blurShape.rotateX(-Math.PI / 2), blurMaterial);
  blur.userData.noGhost = true;
  hands.add(blur);
  object.add(hands);

  /** How far it's swung, `ms` from when it reaches the player, and how far out the hands are. */
  const swingAt = (ms: number, caught: boolean): { swing: number; away: number } => {
    if (ms < -SWEEP_MS) {
      // Drawn back into view.
      const t = THREE.MathUtils.smoothstep(ms, -WIND_UP_MS, -WIND_UP_MS + 250);
      return { swing: BACK, away: (1 - t) * AWAY };
    }
    if (ms < 0) {
      // Whipping across, faster and faster.
      const t = 1 + ms / SWEEP_MS;
      return { swing: BACK * (1 - t * t), away: 0 };
    }
    const held = caught ? CAUGHT_MS : 0;
    if (caught && ms < held) return { swing: 0, away: 0 };
    // On through, slowing, and drawn back out of sight.
    const t = Math.min((ms - held) / THROUGH_MS, 1);
    const swing = caught ? 0 : THROUGH * (1 - (1 - t) ** 2);
    return { swing, away: THREE.MathUtils.smoothstep(t, 0.5, 1) * AWAY };
  };

  let last = BACK;
  return {
    object,
    shadow: { width: 0, depth: 0, x: 0, z: 0 },
    trip: () => undefined,
    thrust: (ms, tripped) => {
      const { swing, away } = swingAt(ms, tripped);
      hands.position.set(from * (STAFF.out + away), STAFF.y, STAFF.z);
      hands.rotation.y = -from * swing;
      hands.visible = ms > -WIND_UP_MS && away < AWAY;
      // The blur shows while it's whipping across: the faster, the stronger.
      const speed = Math.abs(swing - last);
      last = swing;
      blurMaterial.opacity = THREE.MathUtils.clamp(speed * 2.5, 0, 0.45);
      blur.visible = blurMaterial.opacity > 0.01;
    },
  };
};

const BUILDERS: Record<
  HurdleKind,
  (lanes: readonly Lane[], spacing: number, from: -1 | 1) => Hurdle
> = {
  hurdle: trainingHurdles,
  sunbather: sunbathers,
  sled: sleds,
  spear: spears,
  staff: staffs,
};

/**
 * What the venue has to jump (a training hurdle if not given), across lanes `spacing` apart. A
 * ninja's staff comes from the side `from`.
 */
export const buildHurdle = (
  kind: HurdleKind | undefined,
  lanes: readonly Lane[],
  spacing: number,
  from: -1 | 1 = 1,
): Hurdle => BUILDERS[kind ?? "hurdle"](lanes, spacing, from);
