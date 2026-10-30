import * as THREE from "three";
import { glowTexture } from "../textures";
import { glowSprite, part, type Prop, seeded, solid } from "./shapes";
import { crowdTexture, type Fans } from "./stands";

// The Colosseum, seen from the sand: the seating rising in a bowl round the far end, packed with
// Romans, a marble podium wall round the arena hung with banners, and an arcade of arches along the
// top with the velarium's masts above it. The emperor watches from his box at the front of the
// seating, off to one side of the goal so he never stands behind what's coming, and gives his
// verdict with his thumb. The arena's painted into the venue's backdrop (see ../backdrop.ts); the
// emperor's built with the rest of the venue (see ../scenery.ts), and the twist finds him in the
// scene to give his verdicts (see ../twists/colosseum.ts).

/** Where the middle of the arena is, between the goal and the player. */
const CENTRE_Z = -18;
/** How much longer the arena is than it is wide: it's an ellipse. */
const LONG = 1.3;
/** The seating's bottom and top: across (x) radius and height. */
const SEATS = { bottom: 34, top: 52, from: 4, to: 22 };
const ATTIC = { radius: 53, height: 9 };
/**
 * How far right of the middle the emperor's box is: clear of the goal and what's thrown from it, but
 * near enough to be on a phone's narrow screen.
 */
const BOX_ACROSS = 8.5;
/** Only the far half of the arena is ever in view. */
const BACK = { start: Math.PI / 2, length: Math.PI };

export type Thumb = "up" | "down";

export interface Arena extends Prop {
  /** Shows the emperor's verdict, `since` seconds after he gave it. */
  verdict(thumb: Thumb, since: number): void;
}

const ARENAS = new WeakMap<THREE.Object3D, Arena>();

/** The arena somewhere in a scene, if there is one. */
export const arenaIn = (scene: THREE.Object3D): Arena | undefined => {
  let found: Arena | undefined;
  scene.traverse((o) => {
    found ??= ARENAS.get(o);
  });
  return found;
};

const texture = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
};

/** The crowd in the seating: Romans in white and cream togas, with red, purple and gold among them. */
const ROMANS: Fans = {
  colours: ["#f2ead8", "#efe3c8", "#a8261e", "#5b2a6e", "#c8962e", "#e9dcc0"],
  coats: ["#e9dcc0", "#d8cfb8", "#6b4a2e", "#2f4f7f", "#f2ead8"],
  seats: "#c4ad84",
  full: 0.95,
  seed: 31,
};

/** The podium wall round the arena: marble, gold-edged, hung with red banners. */
const podiumTexture = () =>
  texture(512, 64, (ctx) => {
    const random = seeded(7);
    ctx.fillStyle = "#e7dfcf";
    ctx.fillRect(0, 0, 512, 64);
    // Veins in the marble.
    ctx.strokeStyle = "rgba(150, 140, 125, 0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      let x = random() * 512;
      let y = random() * 64;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (random() - 0.3) * 30;
        y += (random() - 0.5) * 12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#c9a23a";
    ctx.fillRect(0, 0, 512, 5);
    ctx.fillStyle = "rgba(60, 45, 30, 0.45)";
    ctx.fillRect(0, 58, 512, 6);
    // Banners: red, edged in gold, with a gold wreath.
    for (let x = 40; x < 512; x += 128) {
      ctx.fillStyle = "#c9a23a";
      ctx.fillRect(x - 1, 5, 30, 46);
      ctx.fillStyle = "#a8211c";
      ctx.fillRect(x + 1, 5, 26, 42);
      ctx.beginPath();
      ctx.moveTo(x + 1, 47);
      ctx.lineTo(x + 14, 54);
      ctx.lineTo(x + 27, 47);
      ctx.fill();
      ctx.strokeStyle = "#e8c45a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 14, 24, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

/** The arcade along the top: stone, with arches in the shade between its pilasters. */
const atticTexture = () =>
  texture(512, 128, (ctx) => {
    ctx.fillStyle = "#cdb48a";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#b39a70";
    ctx.fillRect(0, 0, 512, 12);
    ctx.fillStyle = "#e0cba2";
    ctx.fillRect(0, 12, 512, 4);
    for (let x = 0; x < 512; x += 64) {
      // A pilaster between arches.
      ctx.fillStyle = "#d9c296";
      ctx.fillRect(x, 16, 10, 112);
      // The arch, dark inside.
      ctx.fillStyle = "#3a2c1f";
      ctx.beginPath();
      ctx.moveTo(x + 18, 128);
      ctx.lineTo(x + 18, 62);
      ctx.arc(x + 37, 62, 19, Math.PI, 0);
      ctx.lineTo(x + 56, 128);
      ctx.fill();
      ctx.strokeStyle = "#a88f66";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + 37, 62, 21, Math.PI, 0);
      ctx.stroke();
    }
  });

/** A band of the arena's back half: a slice of a cone, seen from inside. */
const band = (
  map: THREE.Texture,
  repeat: number,
  top: number,
  bottom: number,
  height: number,
  y: number,
  shade = 1,
) => {
  map.repeat.set(repeat, 1);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(top, bottom, height, 128, 1, true, BACK.start, BACK.length),
    new THREE.MeshStandardMaterial({
      map,
      color: new THREE.Color(shade, shade, shade),
      roughness: 0.92,
      side: THREE.BackSide,
    }),
  );
  mesh.position.set(0, y, CENTRE_Z);
  mesh.scale.z = LONG;
  return mesh;
};

/** A point on the arena's oval at a height, `across` metres off the middle line. */
const onOval = (radius: number, across: number) => {
  const theta = Math.PI - Math.asin(across / radius);
  return { x: radius * Math.sin(theta), z: CENTRE_Z + radius * LONG * Math.cos(theta), theta };
};

const SKIN_TONE = "#e2b089";
const PURPLE = "#5a1f6e";
const GOLD = "#d8a93a";

/**
 * The emperor: a cartoon Roman like the crowd, with a big head, in a purple toga and a gold laurel
 * wreath. His right arm is held out to the arena, the fist turning so the thumb points up or down.
 */
const emperor = () => {
  const figure = new THREE.Group();
  figure.add(
    solid([
      part(new THREE.CapsuleGeometry(0.075, 0.48, 3, 8), "#7a5232", [-0.1, 0.35, 0]),
      part(new THREE.CapsuleGeometry(0.075, 0.48, 3, 8), "#7a5232", [0.1, 0.35, 0]),
      // The toga, with a gold-edged fold over the left shoulder.
      part(
        new THREE.CylinderGeometry(0.22, 0.27, 0.72, 20),
        (p) => (Math.abs(p.x + p.y * 0.7 - 0.05) < 0.05 ? GOLD : PURPLE),
        [0, 0.88, 0],
      ),
      part(
        new THREE.SphereGeometry(0.23, 20, 12),
        PURPLE,
        [0, 1.18, 0],
        [0, 0, 0],
        [1, 0.55, 0.85],
      ),
      part(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 12), SKIN_TONE, [0, 1.27, 0]),
      part(
        new THREE.SphereGeometry(0.25, 20, 16),
        SKIN_TONE,
        [0, 1.49, 0],
        [0, 0, 0],
        [1, 1.04, 0.95],
      ),
      part(
        new THREE.SphereGeometry(0.262, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.2),
        "#2c1c12",
        [0, 1.5, -0.02],
        [-0.3, 0, 0],
      ),
      // The laurel wreath.
      part(
        new THREE.TorusGeometry(0.24, 0.035, 8, 24),
        "#c79a2c",
        [0, 1.56, 0],
        [Math.PI / 2 - 0.2, 0, 0],
      ),
      ...[-1, 1].map((side) =>
        part(
          new THREE.SphereGeometry(0.03, 8, 6),
          "#1d1a18",
          [side * 0.085, 1.52, 0.225],
          [0, 0, 0],
          [1, 1.3, 0.6],
        ),
      ),
      // His left arm, resting at his side.
      part(new THREE.CapsuleGeometry(0.065, 0.42, 3, 8), PURPLE, [-0.27, 0.92, 0], [0, 0, 0.12]),
      part(new THREE.SphereGeometry(0.07, 10, 8), SKIN_TONE, [-0.3, 0.65, 0]),
    ]),
  );
  // The right arm, from the shoulder: up and out to the arena.
  const shoulder = new THREE.Group();
  shoulder.position.set(0.27, 1.12, 0);
  const arm = solid([part(new THREE.CapsuleGeometry(0.065, 0.42, 3, 8), PURPLE, [0, -0.24, 0])]);
  shoulder.add(arm);
  // The fist is placed at the end of the arm each frame but turned on its own, so its thumb points
  // straight up or down however the arm's held. The thumb sticks out along the fist's +Z.
  const fist = solid([
    part(new THREE.SphereGeometry(0.085, 12, 10), SKIN_TONE, [0, 0, 0], [0, 0, 0], [1, 1.1, 1]),
    part(new THREE.CapsuleGeometry(0.03, 0.1, 3, 8), SKIN_TONE, [0, 0, 0.12], [Math.PI / 2, 0, 0]),
  ]);
  figure.add(shoulder, fist);
  return { figure, shoulder, fist };
};

/** How far the hand is from the shoulder, down the arm. */
const HAND = new THREE.Vector3(0, -0.5, 0);

/** The emperor's box: a marble platform with columns, a purple awning, and the emperor. */
const emperorsBox = () => {
  const box = new THREE.Group();
  box.add(
    solid([
      part(new THREE.BoxGeometry(6, 0.7, 3.2), "#e7dfcf", [0, 0.35, 0]),
      // The parapet in front, draped in purple and gold.
      part(
        new THREE.BoxGeometry(6.2, 1.1, 0.3),
        (p) => (p.y > 0.42 ? GOLD : PURPLE),
        [0, 1.25, 1.45],
      ),
      ...[-2.7, -0.9, 0.9, 2.7].map((x) =>
        part(new THREE.CylinderGeometry(0.18, 0.2, 4, 14), "#f1ebe0", [x, 2.7, 1.2]),
      ),
      // The awning, sloping down to the front.
      part(
        new THREE.BoxGeometry(6.6, 0.25, 3.6),
        (p) => (Math.abs(p.x) % 1.1 < 0.55 ? PURPLE : "#7a2c8e"),
        [0, 4.85, 0.05],
        [0.12, 0, 0],
      ),
      part(new THREE.BoxGeometry(6.7, 0.35, 0.12), GOLD, [0, 4.6, 1.9]),
    ]),
  );
  const { figure, shoulder, fist } = emperor();
  // Larger than life, so he reads from the far end of the arena.
  figure.scale.setScalar(2.2);
  figure.position.set(0, 0.7, 0.4);
  box.add(figure);
  return { box, shoulder, fist };
};

/** The masts along the top that hold the velarium, each flying a red pennant. */
const masts = () => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i <= 12; i++) {
    const theta = BACK.start + (i / 12) * BACK.length;
    const x = ATTIC.radius * Math.sin(theta);
    const z = CENTRE_Z + ATTIC.radius * LONG * Math.cos(theta);
    const top = SEATS.to + ATTIC.height + 6;
    parts.push(
      part(new THREE.CylinderGeometry(0.3, 0.4, 8, 8), "#8a6a44", [x, top - 4, z]),
      part(new THREE.BoxGeometry(2.6, 1.2, 0.1), "#b3261e", [x + 1.4, top - 0.8, z], [0, theta, 0]),
    );
  }
  return solid(parts);
};

/**
 * The arena, for the venue's backdrop (see ../backdrop.ts): the podium wall, the seating packed
 * with Romans, the arcade along the top and the velarium's masts.
 */
export const colosseumStands = (): THREE.Object3D => {
  const object = new THREE.Group();
  const seatHeight = SEATS.to - SEATS.from;
  object.add(
    band(podiumTexture(), 14, SEATS.bottom, SEATS.bottom, SEATS.from, SEATS.from / 2),
    band(
      crowdTexture(ROMANS),
      3.4,
      SEATS.top,
      SEATS.bottom,
      seatHeight,
      SEATS.from + seatHeight / 2,
      0.72,
    ),
    band(atticTexture(), 16, ATTIC.radius, ATTIC.radius, ATTIC.height, SEATS.to + ATTIC.height / 2),
    masts(),
  );
  return object;
};

/**
 * The emperor in his box, and the braziers burning either side of it, drawn live over the arena's
 * backdrop: he turns his thumb for each verdict, and the twist finds him to do it (see arenaIn).
 */
export const colosseum = (): Arena => {
  const object = new THREE.Group();

  // The emperor's box, on the podium to the right of the goal, turned to face across the arena.
  const { box, shoulder, fist } = emperorsBox();
  const spot = onOval(SEATS.bottom, BOX_ACROSS);
  box.position.set(spot.x, SEATS.from, spot.z + 2);
  box.rotation.y = Math.PI - spot.theta;
  object.add(box);

  // Braziers either side of the box, burning.
  const glow = glowTexture();
  const flames = [-4.2, 4.2].map((offset) => {
    const at = onOval(SEATS.bottom, BOX_ACROSS + offset);
    const bowl = solid([
      part(new THREE.CylinderGeometry(0.6, 0.25, 0.5, 12), "#5a4630", [0, 1.8, 0]),
      part(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), "#4a3a28", [0, 0.8, 0]),
    ]);
    bowl.position.set(at.x, SEATS.from, at.z + 2);
    const flame = glowSprite(glow, "#ff9a3a", 2.4, [at.x, SEATS.from + 2.6, at.z + 2]);
    object.add(bowl, flame);
    return flame;
  });

  let thumb: Thumb = "up";
  /** How long since he last turned his thumb, and since he first held out his arm. */
  let given = Infinity;
  let held = -1;
  /** How far the fist is turned: -1 with the thumb up, 1 down. */
  let turn = -1;

  const arena: Arena = {
    object,
    update: (seconds, dt) => {
      flames.forEach((flame, i) => {
        const flicker =
          1 + Math.sin(seconds * 13 + i * 2) * 0.08 + Math.sin(seconds * 21 + i) * 0.05;
        flame.scale.set(2.4 * flicker, 2.9 * flicker, 1);
      });
      // His arm stays at his side until his first verdict, then goes up and out and stays there.
      // Each verdict turns his fist over, with a shake to catch the eye.
      if (held >= 0) held += dt;
      const raise = THREE.MathUtils.smoothstep(held, 0, 0.35);
      turn += ((thumb === "up" ? -1 : 1) - turn) * Math.min(1, dt * 14);
      const shake = given < 0.9 ? Math.sin(given * 30) * 0.25 * (1 - given / 0.9) : 0;
      shoulder.rotation.set(-1.45 * raise, 0, 0.25 * raise);
      fist.position.copy(HAND).applyEuler(shoulder.rotation).add(shoulder.position);
      // Turning +Z up a quarter turn points the thumb up; down a quarter turn, down.
      fist.rotation.set((turn * Math.PI) / 2, 0, shake);
    },
    verdict: (next, since) => {
      if (held < 0) held = 0;
      thumb = next;
      given = since;
    },
  };
  ARENAS.set(object, arena);
  return arena;
};
