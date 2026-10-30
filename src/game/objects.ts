import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { VENUE_BUILDERS, VENUE_MOTION } from "./decoys";
import type { ItemKind } from "./engine";
import { matte, metal, part } from "./parts";

// The things that fly at the player, built in 3D from simple shapes: footballs, a golden ball, and
// the decoys. Each venue's own decoys are in ./decoys. Each is about 1 m across and centred on its origin, facing +Z (the camera), for the
// scene to scale. They're built once per game, and copied for each one launched.

export type FlyingKind = Exclude<ItemKind, "hurdle">;

/**
 * How a thing moves through the air. Footballs spin. A top hat twirls upright, as if flicked. The
 * other decoys wobble, turning (about the vertical, in radians) and rocking (side to side), but
 * keep the side that shows what they are towards the player, so they can be told apart in time.
 */
export type Motion =
  | { readonly kind: "spin" }
  | { readonly kind: "twirl" }
  | { readonly kind: "wobble"; readonly turn: number; readonly rock: number };

export const MOTION: Record<FlyingKind, Motion> = {
  ball: { kind: "spin" },
  golden: { kind: "spin" },
  panda: { kind: "wobble", turn: 0.45, rock: 0.25 },
  stopwatch: { kind: "wobble", turn: 0.45, rock: 0.25 },
  hat: { kind: "twirl" },
  gloves: { kind: "wobble", turn: 0.6, rock: 0.35 },
  boot: { kind: "wobble", turn: 0.6, rock: 0.3 },
  // The helmet keeps its visor to the player; the volleyball spins like the footballs it's mistaken for.
  helmet: { kind: "wobble", turn: 0.45, rock: 0.25 },
  volleyball: { kind: "spin" },
  ...VENUE_MOTION,
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** A repeatable random source, so the balls come out the same every time. */
const seeded = (start: number) => {
  let seed = start;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
};

const canvasTexture = (
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  colour = true,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
};

// --- Footballs ----------------------------------------------------------------------------------

const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * The 32 panels of a classic ball, a truncated icosahedron: 12 pentagons at an icosahedron's
 * corners and 20 hexagons over its faces. Each is the direction to the panel's centre over its
 * face's distance from the ball's centre, so a point on the ball is on the panel with the largest
 * dot product. The same as the football quiz's shootout ball.
 */
const PANELS = (() => {
  const panels: { x: number; y: number; z: number; pentagon: boolean }[] = [];
  const add = (x: number, y: number, z: number, pentagon: boolean) => {
    const scale = Math.hypot(x, y, z) * (pentagon ? 2.3274 : 2.2673);
    panels.push({ x: x / scale, y: y / scale, z: z / scale, pentagon });
  };
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      add(0, a, b * PHI, true);
      add(a, b * PHI, 0, true);
      add(a * PHI, 0, b, true);
      add(0, a * PHI, b / PHI, false);
      add(a / PHI, 0, b * PHI, false);
      add(a * PHI, b / PHI, 0, false);
      for (const c of [-1, 1]) add(a, b, c, false);
    }
  }
  return panels;
})();

interface BallImages {
  readonly classic: ImageData;
  readonly golden: ImageData;
  readonly relief: ImageData;
}

let ballImages: BallImages | undefined;

/**
 * The balls' colours, a classic white and black one and a gold one, and the relief of their
 * seams, laid out as SphereGeometry lays out its UVs. Drawn once, the first time they're needed.
 */
const drawBalls = (): BallImages => {
  if (ballImages) return ballImages;
  const width = 1024;
  const height = 512;
  const classic = new ImageData(width, height);
  const golden = new ImageData(width, height);
  const relief = new ImageData(width, height);
  const random = seeded(19);
  const tints = PANELS.map(() => 0.96 + random() * 0.04);
  const gold = { hexagon: [236, 186, 52], pentagon: [150, 98, 18], seam: [70, 46, 8] };
  for (let py = 0; py < height; py++) {
    const v = ((py + 0.5) / height) * Math.PI;
    for (let px = 0; px < width; px++) {
      const u = ((px + 0.5) / width) * Math.PI * 2;
      const x = -Math.cos(u) * Math.sin(v);
      const y = Math.cos(v);
      const z = Math.sin(u) * Math.sin(v);
      let best = -Infinity;
      let second = -Infinity;
      let bestIndex = 0;
      let secondIndex = 0;
      PANELS.forEach((p, i) => {
        const score = p.x * x + p.y * y + p.z * z;
        if (score > best) {
          second = best;
          secondIndex = bestIndex;
          best = score;
          bestIndex = i;
        } else if (score > second) {
          second = score;
          secondIndex = i;
        }
      });
      const a = PANELS[bestIndex];
      const b = PANELS[secondIndex];
      if (!a || !b) continue;
      // The angle to the seam with the nearest neighbouring panel, in radians.
      const toSeam = (best - second) / Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const onPanel = smoothstep(0.005, 0.013, toSeam);
      const tint = (tints[bestIndex] ?? 1) * (0.985 + random() * 0.015);
      const i = (py * width + px) * 4;

      const shade = Math.round((a.pentagon ? 26 : 240) * tint * onPanel + 70 * (1 - onPanel));
      classic.data[i] = shade;
      classic.data[i + 1] = shade;
      classic.data[i + 2] = a.pentagon ? shade + 2 : shade - 3;
      classic.data[i + 3] = 255;

      const panel = a.pentagon ? gold.pentagon : gold.hexagon;
      for (let k = 0; k < 3; k++) {
        golden.data[i + k] = Math.round(
          (panel[k] ?? 0) * tint * onPanel + (gold.seam[k] ?? 0) * (1 - onPanel),
        );
      }
      golden.data[i + 3] = 255;

      // Sunk at the seams, and the panels padded up to them.
      const raised = Math.round(255 * smoothstep(0, 0.06, toSeam));
      relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = raised;
      relief.data[i + 3] = 255;
    }
  }
  ballImages = { classic, golden, relief };
  return ballImages;
};

const imageTexture = (image: ImageData, colour = true) =>
  canvasTexture(image.width, image.height, (ctx) => ctx.putImageData(image, 0, 0), colour);

const football = (golden: boolean, environment: THREE.Texture): THREE.Object3D => {
  const images = drawBalls();
  const material = golden
    ? new THREE.MeshStandardMaterial({
        map: imageTexture(images.golden),
        bumpMap: imageTexture(images.relief, false),
        bumpScale: 2,
        metalness: 1,
        roughness: 0.28,
        envMap: environment,
      })
    : new THREE.MeshPhysicalMaterial({
        map: imageTexture(images.classic),
        bumpMap: imageTexture(images.relief, false),
        bumpScale: 2,
        roughness: 0.45,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        envMap: environment,
        envMapIntensity: 0.6,
      });
  return new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), material);
};

// --- Decoys -------------------------------------------------------------------------------------

/** A panda's head, looking at you: white with black ears, eye patches and nose. */
const panda = (environment: THREE.Texture): THREE.Object3D => {
  const group = new THREE.Group();
  const white = matte("#f3f1ec", environment, 0.85);
  const black = matte("#1b1b1f", environment, 0.75);
  const shiny = matte("#0d0d10", environment, 0.2);
  const ball = new THREE.SphereGeometry(1, 40, 28);
  part(group, ball, white, [0, -0.02, 0], [0.43, 0.39, 0.4]);
  for (const side of [-1, 1]) {
    part(group, ball, black, [side * 0.29, 0.29, -0.06], [0.15, 0.15, 0.1]);
    // The patches droop outwards, like a panda's do.
    part(group, ball, black, [side * 0.15, 0.03, 0.33], [0.1, 0.14, 0.07], [0, 0, side * 0.55]);
    part(group, ball, white, [side * 0.14, 0.06, 0.39], [0.045, 0.045, 0.03]);
    part(group, ball, shiny, [side * 0.135, 0.06, 0.415], [0.026, 0.026, 0.02]);
  }
  part(group, ball, white, [0, -0.15, 0.27], [0.19, 0.14, 0.14]);
  part(group, ball, shiny, [0, -0.09, 0.405], [0.065, 0.042, 0.04]);
  return group;
};

/** A stopwatch's dial: white, with a minute track, numbers, a small dial and two hands. */
const dialTexture = () =>
  canvasTexture(512, 512, (ctx) => {
    const c = 256;
    const face = ctx.createRadialGradient(c, c - 60, 20, c, c, 256);
    face.addColorStop(0, "#ffffff");
    face.addColorStop(1, "#dcdcdc");
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(c, c, 256, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1c1c1c";
    ctx.fillStyle = "#1c1c1c";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const long = i % 5 === 0;
      ctx.lineWidth = long ? 7 : 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * 236, c - Math.cos(a) * 236);
      ctx.lineTo(c + Math.sin(a) * (long ? 200 : 218), c - Math.cos(a) * (long ? 200 : 218));
      ctx.stroke();
    }
    ctx.font = `700 34px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let n = 5; n <= 60; n += 5) {
      const a = (n / 60) * Math.PI * 2;
      ctx.fillText(String(n), c + Math.sin(a) * 168, c - Math.cos(a) * 168);
    }
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c, c - 80, 44, 0, Math.PI * 2);
    ctx.stroke();
    const hand = (angle: number, length: number, width: number, colour: string) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(c - Math.sin(angle) * 30, c + Math.cos(angle) * 30);
      ctx.lineTo(c + Math.sin(angle) * length, c - Math.cos(angle) * length);
      ctx.stroke();
    };
    hand(2.3, 120, 12, "#1c1c1c");
    hand(0.9, 215, 6, "#e53935");
    ctx.fillStyle = "#e53935";
    ctx.beginPath();
    ctx.arc(c, c, 14, 0, Math.PI * 2);
    ctx.fill();
  });

/** A gold stopwatch, face on, with its crown and two pushers on top. */
const stopwatch = (environment: THREE.Texture): THREE.Object3D => {
  const group = new THREE.Group();
  const gold = metal("#e0ae3c", environment, 0.25);
  const facing: [number, number, number] = [Math.PI / 2, 0, 0];
  part(group, new THREE.CylinderGeometry(0.4, 0.4, 0.16, 48), gold, [0, 0, 0], [1, 1, 1], facing);
  part(group, new THREE.TorusGeometry(0.4, 0.05, 16, 48), gold, [0, 0, 0.08]);
  const dial = part(
    group,
    new THREE.CircleGeometry(0.36, 48),
    new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.5 }),
    [0, 0, 0.081],
  );
  dial.renderOrder = 1;
  part(
    group,
    new THREE.CircleGeometry(0.37, 48),
    new THREE.MeshPhysicalMaterial({
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      clearcoat: 1,
      envMap: environment,
    }),
    [0, 0, 0.1],
  );
  part(group, new THREE.CylinderGeometry(0.07, 0.07, 0.1, 20), gold, [0, 0.46, 0]);
  part(group, new THREE.TorusGeometry(0.08, 0.022, 12, 24), gold, [0, 0.56, 0]);
  for (const side of [-1, 1]) {
    part(group, new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12), gold, [
      side * 0.25,
      0.36,
      0,
    ]).rotation.z = -side * 0.62;
  }
  group.position.y = -0.06;
  const centred = new THREE.Group();
  centred.add(group);
  return centred;
};

/** A shape turned from its outline: radius and height pairs, from the bottom up. */
const turned = (outline: readonly (readonly [number, number])[], segments = 48) =>
  new THREE.LatheGeometry(
    outline.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );

/**
 * A black silk top hat: its crown waisted a little and rounded over the top, its brim rolled at
 * the edge and curling up at the sides, and a gold band tied in a bow.
 */
const hat = (environment: THREE.Texture): THREE.Object3D => {
  const group = new THREE.Group();
  // Silk plush: dark, with a soft grey sheen where it turns from the light, as brushed silk has.
  const silk = new THREE.MeshPhysicalMaterial({
    color: "#121214",
    roughness: 0.45,
    sheen: 1,
    sheenColor: "#6a6a78",
    sheenRoughness: 0.35,
    envMap: environment,
    envMapIntensity: 0.5,
  });
  const gold = metal("#d6a734", environment, 0.3);
  part(
    group,
    turned([
      [0.249, -0.19],
      [0.243, -0.08],
      [0.248, 0.05],
      [0.262, 0.2],
      [0.27, 0.33],
      [0.255, 0.352],
      [0.22, 0.36],
      [0, 0.36],
    ]),
    silk,
    [0, 0, 0],
  );
  // Round the brim's edge, under and over, from where it meets the crown.
  const brim = turned(
    [
      [0.24, -0.205],
      [0.32, -0.215],
      [0.42, -0.21],
      [0.46, -0.196],
      [0.472, -0.178],
      [0.462, -0.162],
      [0.42, -0.172],
      [0.32, -0.18],
      [0.24, -0.172],
    ],
    64,
  );
  const position = brim.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const [x, z] = [position.getX(i), position.getZ(i)];
    const r = Math.hypot(x, z) || 1;
    position.setY(i, position.getY(i) + 0.07 * (x / r) ** 2 * smoothstep(0.26, 0.47, r));
  }
  brim.computeVertexNormals();
  part(group, brim, silk, [0, 0, 0]);
  part(group, new THREE.CylinderGeometry(0.255, 0.252, 0.1, 48), gold, [0, -0.13, 0]);
  // The bow, on the left.
  const loop = new THREE.SphereGeometry(1, 16, 12);
  part(group, loop, gold, [-0.262, -0.125, 0.02], [0.022, 0.03, 0.03]);
  for (const side of [-1, 1]) {
    part(
      group,
      loop,
      gold,
      [-0.262, -0.125 + side * 0.012, 0.02 + side * 0.05],
      [0.016, 0.03, 0.05],
      [side * 0.5, 0, 0],
    );
  }
  return group;
};

/**
 * A goalkeeper's glove: a padded hand with four fingers and a thumb, a white band across the
 * knuckles, and a strapped cuff fastened with a tab.
 */
const glove = (environment: THREE.Texture): THREE.Object3D => {
  const group = new THREE.Group();
  // Matt latex and neoprene, as a keeper's gloves are, rather than shiny plastic.
  const latex = matte("#2fbf71", environment, 0.78);
  const cuff = matte("#1e8a50", environment, 0.85);
  const strap = matte("#f2f2f2", environment, 0.65);
  part(group, new RoundedBoxGeometry(0.42, 0.36, 0.16, 4, 0.07), latex, [0, 0, 0]);
  part(group, new RoundedBoxGeometry(0.43, 0.075, 0.172, 3, 0.034), strap, [0, 0.125, 0]);
  const finger = new THREE.CapsuleGeometry(0.058, 0.2, 6, 12);
  [-0.15, -0.05, 0.05, 0.15].forEach((x, i) => {
    const length = [0.8, 1, 1.05, 0.9][i] ?? 1;
    part(group, finger, latex, [x, 0.27 * length, 0], [1, length, 0.9], [0, 0, -x * 0.5]);
  });
  part(
    group,
    new THREE.TorusGeometry(0.205, 0.018, 8, 40),
    strap,
    [0, -0.17, 0],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  ).scale.set(1, 0.6, 1);
  part(group, new RoundedBoxGeometry(0.12, 0.085, 0.05, 2, 0.02), cuff, [0.15, -0.25, 0.08]);
  part(
    group,
    new THREE.CapsuleGeometry(0.06, 0.16, 6, 12),
    latex,
    [-0.25, 0.02, 0.02],
    [1, 1, 1],
    [0, 0, 0.9],
  );
  part(group, new THREE.CylinderGeometry(0.2, 0.21, 0.2, 32), cuff, [0, -0.27, 0], [1, 1, 0.6]);
  part(group, new RoundedBoxGeometry(0.44, 0.07, 0.15, 2, 0.03), strap, [0, -0.25, 0]);
  // Bigger than life, like the boot, so its shape reads from a distance.
  group.scale.setScalar(1.2);
  const centred = new THREE.Group();
  centred.add(group);
  return centred;
};

/** A boot's outline from the side, toe to the right, about 1 m long. */
const bootOutline = (): THREE.Shape => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.4, -0.12);
  shape.lineTo(0.36, -0.12);
  shape.quadraticCurveTo(0.5, -0.11, 0.48, -0.02);
  shape.quadraticCurveTo(0.46, 0.05, 0.32, 0.07);
  shape.quadraticCurveTo(0.08, 0.1, -0.06, 0.2);
  shape.lineTo(-0.14, 0.3);
  shape.quadraticCurveTo(-0.3, 0.33, -0.4, 0.27);
  shape.quadraticCurveTo(-0.5, 0.1, -0.44, -0.08);
  shape.quadraticCurveTo(-0.43, -0.12, -0.4, -0.12);
  return shape;
};

/** Extrudes a side outline into a foot-shaped solid, narrower at the toe and heel. */
const footSolid = (shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry => {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -width / 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const narrow = 1 - 0.3 * smoothstep(0.15, 0.5, x) - 0.15 * smoothstep(-0.3, -0.5, x);
    position.setZ(i, position.getZ(i) * narrow);
  }
  geometry.computeVertexNormals();
  return geometry;
};

/** A football boot: a bright upper on a dark soleplate, with white laces and studs. */
const boot = (environment: THREE.Texture): THREE.Object3D => {
  const group = new THREE.Group();
  const upper = matte("#f05a28", environment, 0.45);
  const sole = matte("#1d2333", environment, 0.6);
  const white = matte("#f4f4f4", environment, 0.5);
  part(group, footSolid(bootOutline(), 0.22, 0.05), upper, [0, 0, 0]);

  const plate = new THREE.Shape();
  plate.moveTo(-0.42, -0.17);
  plate.lineTo(0.38, -0.17);
  plate.quadraticCurveTo(0.5, -0.17, 0.5, -0.12);
  plate.lineTo(-0.46, -0.12);
  plate.quadraticCurveTo(-0.47, -0.17, -0.42, -0.17);
  part(group, footSolid(plate, 0.26, 0.02), sole, [0, 0, 0]);

  const stud = new THREE.CylinderGeometry(0.028, 0.022, 0.06, 12);
  for (const x of [-0.36, -0.24, 0.08, 0.22, 0.36]) {
    for (const side of [-1, 1]) part(group, stud, white, [x, -0.22, side * 0.08]);
  }
  // Laces across the instep, following its slope.
  const lace = new RoundedBoxGeometry(0.035, 0.02, 0.2, 2, 0.008);
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    part(group, lace, white, [0.22 - t * 0.24, 0.135 + t * 0.11, 0], [1, 1, 1], [0, 0, 0.6]);
  }
  // A padded collar round the ankle, dark inside, so it reads as a boot rather than a slipper.
  part(
    group,
    new THREE.TorusGeometry(0.085, 0.032, 10, 28),
    sole,
    [-0.27, 0.315, 0],
    [1.25, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  part(
    group,
    new THREE.CircleGeometry(0.085, 24),
    matte("#0c0e14", environment, 0.9),
    [-0.27, 0.322, 0],
    [1.25, 1, 1],
    [-Math.PI / 2, 0, 0],
  );
  group.rotation.y = -0.5;
  const centred = new THREE.Group();
  centred.add(group);
  return centred;
};

/** An astronaut's helmet: a white shell with a gold sun visor, a lamp each side and a neck ring. */
const helmet = (environment: THREE.Texture): THREE.Object3D => {
  const group = new THREE.Group();
  const shell = matte("#f2f1ec", environment, 0.45);
  const trim = matte("#9aa3b2", environment, 0.35);
  const lamp = matte("#2a2f3a", environment, 0.5);
  part(group, new THREE.SphereGeometry(0.42, 40, 28), shell, [0, 0.04, 0], [1, 0.97, 1]);
  // The visor: a curved window over the face, mirrored gold like a real sun visor.
  part(
    group,
    new THREE.SphereGeometry(0.43, 40, 24, Math.PI / 2 - 0.8, 1.6, Math.PI / 2 - 0.62, 1.12),
    metal("#d9a441", environment, 0.1),
    [0, 0.04, 0],
    [1, 0.97, 1],
  );
  part(
    group,
    new THREE.TorusGeometry(0.3, 0.06, 16, 40),
    trim,
    [0, -0.34, 0],
    [1, 1, 1],
    [Math.PI / 2, 0, 0],
  );
  part(group, new THREE.CylinderGeometry(0.3, 0.32, 0.1, 40), trim, [0, -0.4, 0]);
  const glow = new THREE.MeshBasicMaterial({ color: "#fff6c8" });
  for (const side of [-1, 1]) {
    part(
      group,
      new THREE.CylinderGeometry(0.06, 0.06, 0.1, 20),
      lamp,
      [side * 0.4, 0.18, 0.12],
      [1, 1, 1],
      [0, 0, Math.PI / 2],
    );
    part(group, new THREE.CircleGeometry(0.045, 20), glow, [side * 0.4, 0.18, 0.181]);
  }
  return group;
};

let volleyballImages: { colour: ImageData; relief: ImageData } | undefined;

/**
 * A volleyball's panels: three strips across each of six faces, like a cube blown up into a ball,
 * with each face's strips running across its neighbours'. Yellow, blue and white, as beach balls
 * are, with sunk seams. Drawn once, laid out as SphereGeometry lays out its UVs.
 */
const drawVolleyball = () => {
  if (volleyballImages) return volleyballImages;
  const width = 1024;
  const height = 512;
  const colour = new ImageData(width, height);
  const relief = new ImageData(width, height);
  const strips = [
    [247, 201, 37],
    [31, 95, 191],
    [244, 244, 240],
  ];
  const seam = [60, 60, 70];
  for (let py = 0; py < height; py++) {
    const v = ((py + 0.5) / height) * Math.PI;
    for (let px = 0; px < width; px++) {
      const u = ((px + 0.5) / width) * Math.PI * 2;
      const x = -Math.cos(u) * Math.sin(v);
      const y = Math.cos(v);
      const z = Math.sin(u) * Math.sin(v);
      const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)];
      // The face it's on (the largest component), how far across its strips it is, and how far
      // from the face's edge.
      const [across, edge, flip] =
        ax >= ay && ax >= az
          ? [y / ax, ax - Math.max(ay, az), x < 0]
          : ay >= az
            ? [z / ay, ay - Math.max(ax, az), y < 0]
            : [x / az, az - Math.max(ax, ay), z < 0];
      const s = ((across + 1) / 2) * 3;
      const strip = Math.min(Math.floor(s), 2);
      const toStrip = Math.min(s - Math.floor(s), Math.ceil(s) - s);
      const onPanel = smoothstep(0.01, 0.03, edge) * smoothstep(0.02, 0.06, toStrip);
      const panel = strips[flip ? 2 - strip : strip] ?? strips[0] ?? [0, 0, 0];
      const i = (py * width + px) * 4;
      for (let k = 0; k < 3; k++) {
        colour.data[i + k] = Math.round((panel[k] ?? 0) * onPanel + (seam[k] ?? 0) * (1 - onPanel));
      }
      colour.data[i + 3] = 255;
      const raised = Math.round(255 * onPanel);
      relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = raised;
      relief.data[i + 3] = 255;
    }
  }
  volleyballImages = { colour, relief };
  return volleyballImages;
};

/** A beach volleyball, about the size of the footballs, to catch out anyone not looking closely. */
const volleyball = (environment: THREE.Texture): THREE.Object3D => {
  const images = drawVolleyball();
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 48, 24),
    new THREE.MeshPhysicalMaterial({
      map: imageTexture(images.colour),
      bumpMap: imageTexture(images.relief, false),
      bumpScale: 2,
      roughness: 0.55,
      clearcoat: 0.25,
      envMap: environment,
      envMapIntensity: 0.5,
    }),
  );
};

const BUILDERS: Record<FlyingKind, (environment: THREE.Texture) => THREE.Object3D> = {
  ball: (environment) => football(false, environment),
  golden: (environment) => football(true, environment),
  panda,
  stopwatch,
  hat,
  gloves: glove,
  boot,
  helmet,
  volleyball,
  ...VENUE_BUILDERS,
};

/**
 * Makes the flying things for one game. Each kind is built the first time it's needed, then
 * copied, sharing its shapes and materials. `environment` is what shiny surfaces reflect.
 */
export const itemFactory = (environment: THREE.Texture) => {
  const built = new Map<FlyingKind, THREE.Object3D>();
  return {
    make: (kind: FlyingKind): THREE.Object3D => {
      let original = built.get(kind);
      if (!original) {
        original = BUILDERS[kind](environment);
        built.set(kind, original);
      }
      return original.clone();
    },
    /** Frees the shapes, materials and pictures the copies shared. */
    dispose: () => {
      for (const original of built.values()) {
        original.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
          mesh.geometry.dispose();
          mesh.material.map?.dispose();
          mesh.material.bumpMap?.dispose();
          mesh.material.dispose();
        });
      }
      built.clear();
    },
  };
};
