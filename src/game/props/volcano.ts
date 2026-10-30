import * as THREE from "three";
import { glowTexture } from "../textures";
import { GLOWING, glowSprite, noise, PAINTED, type Prop, seeded, solid } from "./shapes";

// The Volcano venue's skyline: the volcano itself, off to the left behind the goal, glowing at the
// top, with lava running down it and smoke rolling away; and dark peaks along the rest of the
// horizon. Units are metres; the goal is down -Z, 30 m away. The haze reddens them with distance.

interface Mountain {
  /** How tall, how wide at the foot, and how wide the crater at the top is (0 for a peak). */
  readonly height: number;
  readonly base: number;
  readonly crater: number;
  readonly seed: number;
}

const ROCK = { low: new THREE.Color(0x3a2722), high: new THREE.Color(0x231817) };
const SCORCHED = new THREE.Color(0x6e2614);
const ASH = new THREE.Color(0x6a625e);
const LAVA = [new THREE.Color(0xffe27a), new THREE.Color(0xff7a1a), new THREE.Color(0xb3240a)];

/**
 * A point on a mountain's surface, `a` radians round it and `t` from the rim (0) to the foot (1):
 * steep at the top and spreading at the foot, cut with ridges and gullies running down it.
 */
const surfaceOf = ({ height, base, crater, seed }: Mountain) => {
  const rough = noise(seed, 3);
  const fine = noise(seed + 7, 2);
  return (a: number, t: number) => {
    // Ridges and gullies running down from the rim, sharp-crested, as lava and rain cut them.
    const ridge =
      rough(Math.cos(a) * 3, Math.sin(a) * 3, t * 2.5) +
      (0.5 - Math.abs(fine(Math.cos(a) * 14, Math.sin(a) * 14, t * 1.5))) * 0.45;
    const r = (crater + (base - crater) * t) * (1 + ridge * 0.16 * Math.min(1, t * 4 + 0.2));
    const y = height * (1 - t) ** 1.8 + rough(a * 2, t * 6, 1.7) * height * 0.05 * t;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
};

/** A mountain, painted from scorched rock at the top to darker rock at its foot. */
const mountain = (shape: Mountain, segments: number, rings: number): THREE.BufferGeometry => {
  const surface = surfaceOf(shape);
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  // A ring of points dipping into the crater, then rings down the outside.
  const steps = shape.crater > 0 ? rings + 2 : rings + 1;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      let p: THREE.Vector3;
      if (shape.crater > 0 && i === 0) {
        // The crater's floor, a little way down inside the rim.
        p = surface(a, 0).multiplyScalar(0.55);
        p.y = shape.height * 0.93;
      } else {
        const t = (i - (shape.crater > 0 ? 1 : 0)) / rings;
        p = surface(a, t);
      }
      positions.push(p.x, p.y, p.z);
      const up = p.y / shape.height;
      c.copy(ROCK.high).lerp(ROCK.low, 1 - up);
      // Streaks of pale ash down the upper slopes, and scorched red round the crater.
      const streak = Math.sin(Math.atan2(p.z, p.x) * 23 + up * 4) * 0.5 + 0.5;
      c.lerp(ASH, streak * THREE.MathUtils.smoothstep(up, 0.35, 0.85) * 0.35);
      if (shape.crater > 0) c.lerp(SCORCHED, THREE.MathUtils.smoothstep(up, 0.78, 1) * 0.8);
      colours.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < steps - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * A river of lava from the rim down the side facing `a`, white-hot at the top and cooling to dark
 * red as it spreads and slows, laid just above the rock.
 */
const lavaFlow = (shape: Mountain, a: number, length: number, seed: number) => {
  const surface = surfaceOf(shape);
  const random = seeded(seed);
  const steps = 24;
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  const wiggle = random() * 10;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * length;
    const along = a + Math.sin(t * 9 + wiggle) * 0.035;
    const width = (0.022 + 0.012 * Math.sin(t * 13 + wiggle)) * (1 - (i / steps) * 0.6);
    for (const side of [-1, 1]) {
      const p = surface(along + side * width, t);
      // Lifted off the rock, outwards and up, so it never sinks into a ridge.
      p.addScaledVector(new THREE.Vector3(Math.cos(along), 0.9, Math.sin(along)), 0.5);
      positions.push(p.x, p.y, p.z);
      const cool = i / steps;
      const [hot, warm, cold] = LAVA;
      if (hot && warm && cold) {
        c.copy(
          cool < 0.35
            ? hot.clone().lerp(warm, cool / 0.35)
            : warm.clone().lerp(cold, (cool - 0.35) / 0.65),
        );
      }
      colours.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < steps; i++) {
    const v = i * 2;
    index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

let puffTexture: THREE.Texture | undefined;
let craterGlow: THREE.Texture | undefined;

/** A soft, lumpy puff of smoke. Drawn once, for every game. */
const puff = (): THREE.Texture => {
  if (puffTexture) return puffTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const random = seeded(4);
    for (let i = 0; i < 9; i++) {
      const x = size / 2 + (random() - 0.5) * size * 0.35;
      const y = size / 2 + (random() - 0.5) * size * 0.3;
      const r = size * (0.2 + random() * 0.16);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.55)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
  }
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
};

const VOLCANO: Mountain = { height: 36, base: 46, crater: 7, seed: 13 };
const PEAKS: readonly (Mountain & { at: readonly [number, number] })[] = [
  { height: 17, base: 30, crater: 0, seed: 3, at: [38, -215] },
  { height: 24, base: 36, crater: 0, seed: 5, at: [72, -250] },
  { height: 14, base: 28, crater: 0, seed: 9, at: [-66, -235] },
];
const SMOKE = 10;

export const volcano = (): Prop => {
  const object = new THREE.Group();

  const cone = new THREE.Group();
  cone.position.set(-24, -1, -190);
  // Lava runs down the side facing the pitch, which is towards +Z, and a little to the right.
  const flows = [
    lavaFlow(VOLCANO, Math.PI * 0.42, 0.7, 1),
    lavaFlow(VOLCANO, Math.PI * 0.53, 0.5, 2),
    lavaFlow(VOLCANO, Math.PI * 0.3, 0.45, 3),
    lavaFlow(VOLCANO, Math.PI * 0.47, 0.32, 4),
    lavaFlow(VOLCANO, Math.PI * 0.36, 0.22, 5),
  ];
  const pool = new THREE.CircleGeometry(VOLCANO.crater * 0.75, 20);
  pool.rotateX(-Math.PI / 2);
  pool.translate(0, VOLCANO.height * 0.95, 0);
  pool.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      Array.from({ length: pool.getAttribute("position").count }, () => [1, 0.45, 0.1]).flat(),
      3,
    ),
  );
  pool.deleteAttribute("uv");
  cone.add(new THREE.Mesh(mountain(VOLCANO, 120, 36), PAINTED), solid([...flows, pool], GLOWING));
  craterGlow ??= glowTexture();
  const glow = glowSprite(craterGlow, 0xff6a1a, 46, [0, VOLCANO.height + 4, 0]);
  cone.add(glow);

  // Smoke rolling up out of the crater and away on the wind, each puff swelling as it fades.
  const smoke = Array.from({ length: SMOKE }, () => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: puff(), color: 0x3b2a26, depthWrite: false, opacity: 0 }),
    );
    cone.add(sprite);
    return sprite;
  });

  for (const peak of PEAKS) {
    const mesh = new THREE.Mesh(mountain(peak, 64, 18), PAINTED);
    mesh.position.set(peak.at[0], -1, peak.at[1]);
    object.add(mesh);
  }
  object.add(cone);

  return {
    object,
    update: (seconds) => {
      glow.material.opacity =
        0.75 + Math.sin(seconds * 2.3) * 0.12 + Math.sin(seconds * 5.1) * 0.06;
      smoke.forEach((sprite, k) => {
        const age = (seconds / 16 + k / SMOKE) % 1;
        sprite.position.set(
          age * 26 + Math.sin(k * 2.1) * 3,
          VOLCANO.height + 2 + age * 34,
          age * 6,
        );
        sprite.scale.setScalar(9 + age * 30 + (k % 3) * 3);
        sprite.material.opacity = Math.sin(Math.PI * age) ** 1.5 * 0.85;
        sprite.material.rotation = k + age * 0.6;
      });
    },
  };
};
