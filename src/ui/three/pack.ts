import * as THREE from "three";
import type { Kit } from "../../kits";
import type { Rarity } from "../../progression";
import type { Venue } from "../../venues";
import { freeShot, type Shot, studio, studioEnvironment } from "./studio";
import { dressedPlayer, football, studioLights, venueScene } from "./subjects";

// The pack every game ends with, opened like a footballer's walkout: it floats, foil catching the
// light, until it's tapped. Then it builds, shaking harder as light leaks from its seam and the
// glow behind it turns the colour of what's inside, then bursts open in a flash and a shower of
// sparks, and what was in it rises out of the light. The rarer the reward, the longer the build,
// the bigger the burst and the more there is left glittering afterwards. A legendary teases blue,
// as if it's only rare, then flares gold. Units are metres; the camera looks down -Z.

/** What a pack can hold: a kit, a venue, or, once everything's unlocked, bonus XP. */
export type Contents =
  | { readonly kind: "kit"; readonly kit: Kit }
  | { readonly kind: "venue"; readonly venue: Venue }
  | { readonly kind: "complete" };

/** How the show is going, for the page to follow with its words and buttons. */
export type Phase = "waiting" | "building" | "burst" | "revealed";

export interface PackOptions {
  readonly contents: Contents;
  readonly rarity: Rarity;
  /** The player's name, number and kit, for their shirt and the venue's crowd. */
  readonly name: string;
  readonly number: number;
  readonly kit: Kit;
  /** No shaking, spinning or flying about: a tap goes straight to what's inside. */
  readonly calm: boolean;
  readonly onPhase: (phase: Phase) => void;
}

export interface PackShow extends Shot {
  /** Starts opening the pack, or, if it's already building, skips straight to the burst. */
  open(): void;
  /** Fits the show to a stage of this shape. */
  resize(width: number, height: number): void;
  /** Moves the show on to `seconds` in. False once nothing's moving, so it needn't be redrawn. */
  frame(seconds: number, dt: number): boolean;
  dispose(): void;
}

/** How long the build-up lasts, in seconds, before the pack bursts. */
const BUILD: Record<Rarity, number> = { common: 0.8, rare: 1.3, legendary: 2 };
/** How far it shakes at the end of the build, in metres. */
const SHAKE: Record<Rarity, number> = { common: 0.025, rare: 0.05, legendary: 0.085 };
/** How many sparks fly out of it, and how much foil. */
const SPARKS: Record<Rarity, number> = { common: 70, rare: 130, legendary: 220 };
const CONFETTI: Record<Rarity, number> = { common: 0, rare: 60, legendary: 130 };
/** Each rarity's light: silver, blue and gold, as on its badge. */
const LIGHT: Record<Rarity, number> = { common: 0xdbe7ff, rare: 0x3fa9ff, legendary: 0xffc53a };
/**
 * How bright that light stays behind what came out once the burst's settled: its glow and its
 * rays. Kept low, so the reward stands out against the light rather than being washed out by it.
 */
const AFTERGLOW: Record<Rarity, { halo: number; rays: number }> = {
  common: { halo: 0.2, rays: 0.1 },
  rare: { halo: 0.28, rays: 0.26 },
  legendary: { halo: 0.34, rays: 0.42 },
};
/** How bright the pool of that light is on the floor under what came out. */
const FLOOR_GLOW = 0.4;
/** How bright the rims of that light are round what came out, from behind either side. */
const RIM_LIGHT = 1.3;
const CONFETTI_COLOURS: Record<Rarity, readonly number[]> = {
  common: [0xdbe7ff],
  rare: [0x3fa9ff, 0x9fd6ff, 0xffffff, 0x6c3ff0],
  legendary: [0xffc53a, 0xffe58a, 0xfff6d8, 0xff9a1f],
};
/** When a legendary's light turns from blue to gold, as a share of the build. */
const UPGRADE = 0.62;
/** Buzzes: through the build, then the burst, harder for the rarer. */
const BUZZ: Record<Rarity, { build: number[]; burst: number[] }> = {
  common: { build: [12], burst: [35] },
  rare: { build: [10, 110, 14, 80, 18, 50, 22], burst: [70] },
  legendary: {
    build: [10, 160, 12, 120, 14, 90, 18, 60, 22, 40, 26, 30, 30],
    burst: [60, 50, 160],
  },
};

const PACK = { width: 1, height: 1.45, depth: 0.085, crimp: 0.075, tear: 0.2 };

const buzz = (pattern: number[]) => {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
};

const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const easeInOut = (t: number) => THREE.MathUtils.smoothstep(t, 0, 1);

// --- Pictures drawn for the show -----------------------------------------------------------------

const canvasTexture = (
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/** A soft round glow, white, for tinting. */
const glowPicture = () =>
  canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, "rgba(255,255,255,0.7)");
    g.addColorStop(0.5, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });

/** Beams of light fanning out from the middle, fading as they go. */
const raysPicture = () =>
  canvasTexture(512, 512, (ctx) => {
    const beams = 14;
    ctx.translate(256, 256);
    for (let i = 0; i < beams; i++) {
      const a = (i / beams) * Math.PI * 2;
      const spread = i % 2 ? 0.07 : 0.12;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 256, a - spread, a + spread);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.globalCompositeOperation = "destination-in";
    const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 256);
    fade.addColorStop(0, "rgba(0,0,0,0.9)");
    fade.addColorStop(0.25, "rgba(0,0,0,0.5)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(-256, -256, 512, 512);
  });

const FONT = `"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/**
 * The pack's printed front, in the game's colours: violet and blue foil streaked with holographic
 * light, the middle of a pitch marked out round the ball, and the name in white and teal. The
 * foil's shine and its rainbow sheen come from the material; this is the ink.
 */
const frontPicture = () =>
  canvasTexture(512, 742, (ctx) => {
    const [w, h] = [512, 742];
    const base = ctx.createLinearGradient(0, 0, w * 0.4, h);
    base.addColorStop(0, "#2b00e5");
    base.addColorStop(0.45, "#172eff");
    base.addColorStop(0.75, "#171d88");
    base.addColorStop(1, "#02235c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Holographic streaks, slanting across.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.45);
    for (const [x, width, colour] of [
      [-260, 70, "rgba(0, 232, 218, 0.24)"],
      [-150, 26, "rgba(255, 255, 255, 0.22)"],
      [-40, 110, "rgba(76, 195, 255, 0.22)"],
      [120, 40, "rgba(0, 232, 218, 0.22)"],
      [210, 90, "rgba(170, 180, 255, 0.18)"],
    ] as const) {
      const band = ctx.createLinearGradient(x, 0, x + width, 0);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, colour);
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.fillRect(x, -600, width, 1200);
    }
    ctx.restore();
    // The ball on the centre spot: the halfway line through it, edge to edge, and the centre
    // circle round it, navy inside, in teal, with a fainter blue ring outside that.
    const [cx, cy] = [w / 2, h * 0.36];
    ctx.strokeStyle = "rgba(0, 232, 218, 0.75)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(22, cy);
    ctx.lineTo(w - 22, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fillStyle = "#02235c";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 176, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 91, 255, 0.85)";
    ctx.lineWidth = 5;
    ctx.stroke();
    // The wordmark, in white and teal with a navy edge.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = `900 108px ${FONT}`;
    ctx.lineWidth = 14;
    ctx.strokeStyle = "#02235c";
    ctx.strokeText("HEADS", w / 2, h * 0.64);
    ctx.strokeText("UP", w / 2, h * 0.77);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("HEADS", w / 2, h * 0.64);
    ctx.fillStyle = "#00e8da";
    ctx.fillText("UP", w / 2, h * 0.77);
    ctx.font = `900 30px ${FONT}`;
    ctx.letterSpacing = "10px";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText("MATCH PACK", w / 2 + 5, h * 0.87);
    // A teal border just inside the edge.
    ctx.strokeStyle = "rgba(0, 232, 218, 0.75)";
    ctx.lineWidth = 6;
    ctx.strokeRect(22, 30, w - 44, h - 60);
  });

/** The back: the same foil, plainer, with the name small. */
const backPicture = () =>
  canvasTexture(256, 371, (ctx) => {
    const base = ctx.createLinearGradient(0, 0, 0, 371);
    base.addColorStop(0, "#172eff");
    base.addColorStop(1, "#02235c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 371);
    ctx.textAlign = "center";
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = "rgba(0, 232, 218, 0.85)";
    ctx.fillText("HEADS UP", 128, 190);
  });

/** Crimped foil, ridged where it's been pressed shut. */
const crimpPicture = () =>
  canvasTexture(256, 16, (ctx) => {
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = "#dfe7ff";
      ctx.fillRect(x, 0, 4, 16);
      ctx.fillStyle = "#7f8fd0";
      ctx.fillRect(x + 4, 0, 4, 16);
    }
  });

// --- The pack ------------------------------------------------------------------------------------

/** How far the foil puffs out at a point on its face: full in the middle, flat at the edges. */
const bulge = (x: number, y: number) =>
  Math.sqrt(
    Math.max(0, 1 - Math.abs((2 * x) / PACK.width) ** 5) *
      Math.max(0, 1 - Math.abs((2 * y) / PACK.height) ** 5),
  );

/**
 * One face of the pack, between two heights, puffed out like a sealed bag: `side` 1 for the
 * front, -1 for the back. Its pictures are laid over the whole face, so the lid and the body
 * that tears from it line up.
 */
const face = (from: number, to: number, side: 1 | -1): THREE.BufferGeometry => {
  const columns = 24;
  const rows = Math.max(2, Math.round(((to - from) / PACK.height) * 34));
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const y = from + ((to - from) * r) / rows;
    for (let c = 0; c <= columns; c++) {
      const x = -PACK.width / 2 + (PACK.width * c) / columns;
      positions.push(x, y, side * PACK.depth * bulge(x, y));
      const u = x / PACK.width + 0.5;
      uvs.push(side === 1 ? u : 1 - u, y / PACK.height + 0.5);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const a = r * (columns + 1) + c;
      const b = a + columns + 1;
      if (side === 1) index.push(a, a + 1, b, b, a + 1, b + 1);
      else index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/** The crimped seal along an end of the pack, its outer edge cut into teeth. */
const crimp = (y: number, outwards: 1 | -1): THREE.BufferGeometry => {
  const teeth = 22;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= teeth * 2; i++) {
    const t = i / (teeth * 2);
    const x = -PACK.width / 2 + PACK.width * t;
    const reach = PACK.crimp * (i % 2 ? 0.62 : 1);
    positions.push(x, y, 0, x, y + outwards * reach, 0);
    uvs.push(t * 4, 0, t * 4, 1);
  }
  for (let i = 0; i < teeth * 2; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

interface Pack {
  readonly object: THREE.Group;
  /** The top that tears off, and the rest. */
  readonly lid: THREE.Group;
  readonly body: THREE.Group;
  readonly ball: THREE.Object3D | undefined;
  /** The foil, to light up from inside as it builds. */
  readonly foil: THREE.MeshPhysicalMaterial;
  /** The light leaking out along the tear. */
  readonly seam: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

const buildPack = (environment: THREE.Texture | undefined, glow: THREE.Texture): Pack => {
  const foil = new THREE.MeshPhysicalMaterial({
    map: frontPicture(),
    metalness: 0.5,
    roughness: 0.38,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
    iridescence: 0.9,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [160, 480],
    envMap: environment ?? null,
    // Enough to shine as it turns, not so much the room's lights wash out the print.
    envMapIntensity: 0.75,
    emissive: 0x000000,
  });
  const back = foil.clone();
  back.map = backPicture();
  const crimped = new THREE.MeshStandardMaterial({
    map: crimpPicture(),
    metalness: 0.9,
    roughness: 0.35,
    envMap: environment ?? null,
    side: THREE.DoubleSide,
  });
  if (crimped.map) crimped.map.wrapS = THREE.RepeatWrapping;

  const top = PACK.height / 2;
  const tear = top - PACK.tear;
  const lid = new THREE.Group();
  lid.add(
    new THREE.Mesh(face(tear, top, 1), foil),
    new THREE.Mesh(face(tear, top, -1), back),
    new THREE.Mesh(crimp(top, 1), crimped),
  );
  const body = new THREE.Group();
  body.add(
    new THREE.Mesh(face(-top, tear, 1), foil),
    new THREE.Mesh(face(-top, tear, -1), back),
    new THREE.Mesh(crimp(-top, -1), crimped),
  );

  // The ball, set into the front on the centre spot in a teal ring, as if it's been pressed into
  // the foil.
  const ballY = PACK.height * 0.14;
  const surface = PACK.depth * bulge(0, ballY);
  const ball = football();
  if (ball) {
    ball.scale.setScalar(0.34);
    ball.position.set(0, ballY, surface + 0.02);
    body.add(ball);
  }
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.022, 10, 48),
    new THREE.MeshStandardMaterial({
      color: 0x00e8da,
      metalness: 1,
      roughness: 0.25,
      envMap: environment ?? null,
    }),
  );
  ring.position.set(0, ballY, surface + 0.005);
  body.add(ring);

  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(PACK.width * 1.15, 0.16),
    new THREE.MeshBasicMaterial({
      map: glow,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  seam.position.set(0, tear, PACK.depth + 0.02);
  body.add(seam);

  const object = new THREE.Group();
  object.add(lid, body);
  return { object, lid, body, ball, foil, seam };
};

// --- Sparks and foil -----------------------------------------------------------------------------

interface Particle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  life: number;
  age: number;
  readonly colour: THREE.Color;
}

/** Sparks of light: they fly, slow in the air, fall a little and fade. */
const sparks = (glow: THREE.Texture, most: number) => {
  const positions = new Float32Array(most * 3);
  const colours = new Float32Array(most * 3);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const colour = new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("color", colour);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.09,
      map: glow,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  const live: Particle[] = [];
  const fading = new THREE.Color();
  return {
    object: points,
    add: (p: Particle) => {
      if (live.length < most) live.push(p);
    },
    get count() {
      return live.length;
    },
    update: (dt: number, gravity: number) => {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        if (!p) continue;
        p.age += dt;
        if (p.age >= p.life) {
          live.splice(i, 1);
          continue;
        }
        p.velocity.multiplyScalar(Math.exp(-dt * 2.2));
        p.velocity.y += gravity * dt;
        p.position.addScaledVector(p.velocity, dt);
      }
      live.forEach((p, i) => {
        position.setXYZ(i, p.position.x, p.position.y, p.position.z);
        // Added light, so dimming it is fading it.
        fading.copy(p.colour).multiplyScalar((1 - p.age / p.life) ** 1.5);
        colour.setXYZ(i, fading.r, fading.g, fading.b);
      });
      geometry.setDrawRange(0, live.length);
      position.needsUpdate = true;
      colour.needsUpdate = true;
    },
  };
};

/** Scraps of foil, tumbling down and catching the light as they turn. */
const confetti = (environment: THREE.Texture | undefined, most: number) => {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.045, 0.075),
    new THREE.MeshStandardMaterial({
      metalness: 0.85,
      roughness: 0.3,
      envMap: environment ?? null,
      side: THREE.DoubleSide,
    }),
    most,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  const live: (Particle & { spin: THREE.Vector3; turn: THREE.Euler })[] = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    object: mesh,
    add: (p: Particle) => {
      if (live.length >= most) return;
      live.push({
        ...p,
        spin: new THREE.Vector3(Math.random() * 14, Math.random() * 10, Math.random() * 6),
        turn: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
      });
    },
    update: (dt: number) => {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        if (!p) continue;
        p.age += dt;
        if (p.age >= p.life) {
          live.splice(i, 1);
          continue;
        }
        // Flat things fall slowly and flutter.
        p.velocity.multiplyScalar(Math.exp(-dt * 3));
        p.velocity.y -= 1.6 * dt;
        p.position.addScaledVector(p.velocity, dt);
        p.position.x += Math.sin(p.age * 5 + p.spin.x) * dt * 0.2;
        p.turn.set(p.turn.x + p.spin.x * dt, p.turn.y + p.spin.y * dt, p.turn.z + p.spin.z * dt);
      }
      live.forEach((p, i) => {
        const shrink = Math.min(1, (p.life - p.age) / 0.4);
        matrix.compose(p.position, quaternion.setFromEuler(p.turn), one.setScalar(shrink));
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, p.colour);
      });
      mesh.count = live.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
};

// --- What's inside -------------------------------------------------------------------------------

interface Inside {
  readonly object: THREE.Object3D;
  /** How wide and tall it is, for fitting it on the screen. */
  readonly width: number;
  readonly height: number;
  /** Poses it, `since` seconds after it came out (negative before), `idle` once it's settled. */
  pose(since: number, seconds: number, calm: boolean): void;
  dispose(): void;
}

/**
 * The player in the new kit, with their name and number on the back. They come out of the light
 * back first, then turn round to show the front: once for a common, more for the rarer ones.
 */
const kitInside = async (
  kit: Kit,
  name: string,
  number: number,
  rarity: Rarity,
): Promise<Inside> => {
  const player = await dressedPlayer(kit, name, number);
  // At ease in their idle, as on the kits' cards, rather than in the model's T.
  player.update(0.6);
  /** When they were last posed, to move their idle on by the time since. */
  let posed: number | undefined;
  const holder = new THREE.Group();
  const scale = 0.86;
  player.object.scale.setScalar(scale);
  // Stood with their middle on the origin.
  player.object.position.y = -0.9 * scale;
  holder.add(player.object);
  const turns = rarity === "legendary" ? 2 : rarity === "rare" ? 1 : 0;
  return {
    object: holder,
    width: 0.9 * scale,
    height: 1.8 * scale,
    pose: (since, seconds, calm) => {
      if (calm) {
        holder.rotation.y = Math.PI;
        return;
      }
      player.update(posed === undefined ? 0 : Math.min(seconds - posed, 0.1));
      posed = seconds;
      // Front on is a half turn: the player faces away from the camera to start with.
      const turn = easeInOut(THREE.MathUtils.clamp((since - 0.55) / (0.7 + turns * 0.35), 0, 1));
      const idle =
        Math.sin(Math.max(0, since - 2) * 0.7) * 0.35 * Math.min(1, Math.max(0, since - 2));
      holder.rotation.y = (Math.PI + turns * Math.PI * 2) * turn + idle;
    },
    dispose: () => freeShot(holder),
  };
};

/** A rounded card, its picture laid across it, as `ShapeGeometry` doesn't. */
const card = (width: number, height: number, radius: number) => {
  const shape = new THREE.Shape();
  const [x, y] = [-width / 2, -height / 2];
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ShapeGeometry(shape, 6);
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    uvs.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / height + 0.5);
  }
  return geometry;
};

/**
 * The new venue, pictured as the game shows it, on a card the shape of a phone's screen edged in
 * the rarity's colour, which flips over as it comes out and then rocks gently, catching the light.
 */
const venueInside = async (
  venue: Venue,
  kit: Kit,
  rarity: Rarity,
  environment: THREE.Texture | undefined,
): Promise<Inside> => {
  const r = studio();
  const [width, height] = [1.2, 1.56];
  const target = new THREE.WebGLRenderTarget(560, 728, { type: THREE.HalfFloatType, samples: 4 });
  if (r) {
    const shot = await venueScene(venue, kit, width / height);
    r.setRenderTarget(target);
    r.render(shot.scene, shot.camera);
    r.setRenderTarget(null);
    shot.dispose?.();
  }
  const picture = new THREE.Mesh(
    card(width, height, 0.06),
    new THREE.MeshBasicMaterial({ map: target.texture }),
  );
  const frame = new THREE.Mesh(
    card(width + 0.06, height + 0.06, 0.08),
    new THREE.MeshStandardMaterial({
      color: LIGHT[rarity],
      metalness: 1,
      roughness: 0.25,
      envMap: environment ?? null,
      side: THREE.DoubleSide,
    }),
  );
  frame.position.z = -0.01;
  const holder = new THREE.Group();
  holder.add(frame, picture);
  return {
    object: holder,
    width: width + 0.06,
    height: height + 0.06,
    pose: (since, seconds, calm) => {
      if (calm) {
        holder.rotation.set(0, 0, 0);
        return;
      }
      const flip = easeInOut(THREE.MathUtils.clamp(since / 0.7, 0, 1));
      holder.rotation.set(
        Math.sin(seconds * 0.9) * 0.06,
        (1 - flip) * Math.PI * (rarity === "common" ? 1 : 3) + Math.sin(seconds * 0.6) * 0.18,
        0,
      );
    },
    dispose: () => {
      target.dispose();
      freeShot(holder);
    },
  };
};

/** The golden ball, for a player with everything: it spins in the light. */
const goldenInside = (): Inside => {
  const ball = football(true) ?? new THREE.Group();
  ball.scale.setScalar(0.9);
  const holder = new THREE.Group();
  holder.add(ball);
  return {
    object: holder,
    width: 0.9,
    height: 0.9,
    pose: (_, seconds, calm) => {
      ball.rotation.set(calm ? 0.4 : seconds * 1.2, 0.5, 0.2);
    },
    dispose: () => freeShot(holder),
  };
};

// --- The show ------------------------------------------------------------------------------------

export const packShow = (options: PackOptions): PackShow => {
  const { contents, rarity, calm, onPhase } = options;
  const environment = studioEnvironment();
  const glow = glowPicture();

  const scene = new THREE.Scene();
  studioLights(scene);
  // Lights in the reward's colour, from behind either side: a rim of it round whatever comes out.
  const rims = [-1, 1].map((side) => {
    const rim = new THREE.DirectionalLight(LIGHT[rarity], 0);
    rim.position.set(side * 3, 1.5, -2);
    scene.add(rim);
    return rim;
  });
  const camera = new THREE.PerspectiveCamera(32, 0.5, 0.1, 50);
  const CAMERA_Z = 6;
  camera.position.set(0, 0, CAMERA_Z);

  const rays = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      map: raysPicture(),
      color: 0x9fb4ff,
      transparent: true,
      opacity: calm ? 0.12 : 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  rays.position.z = -2.5;
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glow,
      color: 0x3d5bff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.position.z = -1;
  halo.scale.setScalar(3.2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glow,
      color: LIGHT[rarity],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(1.8, 1.8, 1);

  const pack = buildPack(environment, glow);
  const spark = sparks(glow, 260);
  const foil = confetti(environment, 140);
  const stage = new THREE.Group();
  stage.add(rays, halo, pack.object, spark.object, foil.object);
  scene.add(stage);

  let size: { width: number; height: number } | undefined;
  let phase: Phase = "waiting";
  let seconds = 0;
  let openedAt = 0;
  let burstAt = 0;
  let punch = 0;
  /** Where the pack and what's in it sit on the screen, set by the stage's shape. */
  let packY = 0;
  let revealY = 0;
  /** Where the floor is under what's inside, in its own size. */
  let floorY = 0;
  const lidVelocity = new THREE.Vector3();
  const bodyVelocity = new THREE.Vector3();
  const lightColour = new THREE.Color();
  const rarityColour = new THREE.Color(LIGHT[rarity]);
  const tease = new THREE.Color(LIGHT.rare);

  // What's inside is made while the pack waits to be opened, so it's ready for the burst.
  const reveal = new THREE.Group();
  reveal.visible = false;
  scene.add(reveal);
  let inside: Inside | undefined;
  /** Whether the show's gone before what's inside was ready. */
  const gone = { now: false };
  const make = (): Promise<Inside> | Inside =>
    contents.kind === "kit"
      ? kitInside(contents.kit, options.name, options.number, rarity)
      : contents.kind === "venue"
        ? venueInside(contents.venue, options.kit, rarity, environment)
        : goldenInside();
  const preparing = (async () => {
    let made: Inside;
    try {
      made = await make();
    } catch (error) {
      // The golden ball rather than a pack that never opens. The page still says what it was.
      console.warn("Couldn't make what's in the pack", error);
      made = goldenInside();
    }
    if (gone.now) {
      made.dispose();
      return;
    }
    inside = made;
    reveal.add(made.object, floor);
    // Laid out again now its size is known.
    if (size) layout(size.width, size.height);
    // Compiled now, so the burst doesn't stutter the first time it's drawn.
    const r = studio();
    if (r) {
      reveal.visible = true;
      r.compile(scene, camera);
      reveal.visible = false;
    }
  })();

  const setPhase = (next: Phase) => {
    phase = next;
    onPhase(next);
  };

  /** Sparks and foil thrown out from a point, more and faster for the rarer packs. */
  const burstOut = (from: THREE.Vector3) => {
    const colours = CONFETTI_COLOURS[rarity];
    for (let i = 0; i < SPARKS[rarity]; i++) {
      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.4,
        (Math.random() - 0.3) * 0.6,
      ).normalize();
      spark.add({
        position: from.clone(),
        velocity: direction.multiplyScalar(1.5 + Math.random() * (rarity === "common" ? 3 : 5)),
        life: 0.6 + Math.random() * 0.9,
        age: 0,
        colour: (Math.random() < 0.3
          ? new THREE.Color(0xffffff)
          : rarityColour.clone()
        ).multiplyScalar(1.2),
      });
    }
    for (let i = 0; i < CONFETTI[rarity]; i++) {
      const a = Math.random() * Math.PI * 2;
      foil.add({
        position: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, 0)),
        velocity: new THREE.Vector3(
          Math.cos(a) * 2.6,
          1.5 + Math.random() * 3.5,
          Math.sin(a) * 0.8,
        ).multiplyScalar(0.5 + Math.random() * 0.8),
        life: 2 + Math.random() * 1.5,
        age: 0,
        colour: new THREE.Color(colours[i % colours.length] ?? LIGHT[rarity]),
      });
    }
  };

  const burst = () => {
    burstAt = seconds;
    punch = 1;
    lidVelocity.set(-0.9, 3.4, 1.2);
    bodyVelocity.set(0.15, -1.2, 0.4);
    buzz(BUZZ[rarity].burst);
    burstOut(new THREE.Vector3(0, packY + PACK.height / 2 - PACK.tear, 0.2));
    reveal.visible = true;
    setPhase("burst");
  };

  /** Goes straight to what's inside, for a calm show. */
  const showInside = () => {
    pack.object.visible = false;
    reveal.visible = true;
    floor.material.opacity = FLOOR_GLOW;
    halo.material.color.set(LIGHT[rarity]);
    rays.material.color.set(LIGHT[rarity]);
    for (const rim of rims) rim.intensity = RIM_LIGHT;
    burstAt = seconds - 10;
    setPhase("revealed");
  };

  /** Fits the show to the stage's shape. */
  function layout(width: number, height: number) {
    camera.aspect = width / height;
    // Wide screens get a narrower view, so the pack isn't lost in the middle.
    camera.fov = camera.aspect > 0.75 ? 26 : 32;
    camera.updateProjectionMatrix();
    const tall = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // The pack a little above the middle, with the hint below it; what's inside higher up, with
    // its name and the buttons below.
    packY = tall * 0.06;
    const middle = tall * (0.5 - 0.35);
    const room = tall * 0.47;
    const wide = tall * camera.aspect * 0.86;
    const standing = inside?.height ?? 1.5;
    revealY = middle;
    floorY = -standing / 2;
    reveal.scale.setScalar(Math.min(1, room / standing, wide / (inside?.width ?? 1)));
  }

  return {
    scene,
    camera,
    open: () => {
      if (phase === "waiting") {
        openedAt = seconds;
        if (calm) {
          buzz([20]);
          void preparing.then(showInside);
          return;
        }
        buzz(BUZZ[rarity].build);
        setPhase("building");
      } else if (phase === "building") {
        // Straight to the burst.
        openedAt = seconds - BUILD[rarity];
      }
    },
    resize: (width, height) => {
      size = { width, height };
      layout(width, height);
    },
    frame: (now, dt) => {
      seconds = now;
      const t = seconds;

      // Waiting: it floats and turns, so the foil catches the light.
      if (phase === "waiting") {
        pack.object.position.set(0, packY + (calm ? 0 : Math.sin(t * 1.6) * 0.05), 0);
        pack.object.rotation.set(
          calm ? 0 : Math.sin(t * 0.9) * 0.06,
          calm ? 0.2 : Math.sin(t * 0.7) * 0.42,
          0,
        );
        if (pack.ball) pack.ball.rotation.set(t * 0.8, 0.4, 0);
        rays.rotation.z = t * 0.05;
      }

      if (phase === "building") {
        const b = Math.min(1, (t - openedAt) / BUILD[rarity]);
        const ease = b * b;
        // Its light: a legendary teases blue, then flares gold.
        const flare =
          rarity === "legendary" ? THREE.MathUtils.smoothstep(b, UPGRADE, UPGRADE + 0.08) : 1;
        lightColour.copy(rarity === "legendary" ? tease : rarityColour).lerp(rarityColour, flare);
        const pulse = rarity === "legendary" && b > UPGRADE && b < UPGRADE + 0.15 ? 1.6 : 1;
        // Square on to the camera, nearer, and shaking harder and harder.
        const shake = SHAKE[rarity] * ease;
        pack.object.position.set(
          Math.sin(t * 57) * shake + Math.sin(t * 83) * shake * 0.5,
          packY + Math.cos(t * 61) * shake,
          0.45 * easeInOut(b),
        );
        pack.object.rotation.set(0, pack.object.rotation.y * 0.9, Math.sin(t * 47) * shake * 2);
        if (pack.ball) pack.ball.rotation.x += dt * (1 + ease * 14);
        pack.foil.emissive.copy(lightColour);
        pack.foil.emissiveIntensity = ease * 0.35 * pulse;
        pack.seam.material.opacity = ease * pulse;
        pack.seam.material.color.copy(lightColour);
        halo.material.color.copy(lightColour);
        halo.material.opacity = 0.55 + 0.45 * b;
        halo.scale.setScalar((3.2 + ease * 2.5) * pulse);
        rays.material.color.copy(lightColour);
        rays.material.opacity = 0.18 + 0.5 * ease;
        rays.rotation.z += dt * (0.05 + ease * 1.2);
        // Motes of light drawn in towards it.
        if (rarity !== "common" && Math.random() < 0.5 + b) {
          const a = Math.random() * Math.PI * 2;
          const from = new THREE.Vector3(Math.cos(a) * 1.6, packY + Math.sin(a) * 1.6, 0.3);
          spark.add({
            position: from,
            velocity: new THREE.Vector3(0, packY, 0.3).sub(from).multiplyScalar(2.6),
            life: 0.38,
            age: 0,
            colour: lightColour.clone(),
          });
        }
        // It only bursts once what's inside is ready, holding at its peak until then.
        if (b >= 1 && inside) burst();
      }

      if (phase === "burst" || phase === "revealed") {
        // Worked out here, after the build, which may just have burst it.
        const since = seconds - burstAt;
        // The pack tears: the lid flies off, the rest drops away.
        if (pack.object.visible) {
          lidVelocity.y -= 9 * dt;
          bodyVelocity.y -= 7 * dt;
          pack.lid.position.addScaledVector(lidVelocity, dt);
          pack.lid.rotation.z += dt * 4;
          pack.lid.rotation.x -= dt * 2;
          pack.body.position.addScaledVector(bodyVelocity, dt);
          pack.body.rotation.x += dt * 1.6;
          pack.body.rotation.z -= dt * 0.5;
          pack.seam.material.opacity = Math.max(0, 1 - since * 4);
          if (since > 1.2) pack.object.visible = false;
        }
        // A flash of light that settles into a soft glow behind what came out, from as bright as
        // the build left it.
        const settle = Math.min(1, since / 0.5);
        halo.material.color.copy(rarityColour);
        halo.material.opacity = THREE.MathUtils.lerp(1, AFTERGLOW[rarity].halo, easeInOut(settle));
        halo.scale.setScalar(
          THREE.MathUtils.lerp(9, rarity === "common" ? 3.2 : 4.4, easeInOut(settle)),
        );
        halo.position.y = revealY;
        rays.position.y = revealY;
        rays.material.color.copy(rarityColour);
        rays.material.opacity = THREE.MathUtils.lerp(0.9, AFTERGLOW[rarity].rays, settle);
        rays.rotation.z += dt * (rarity === "legendary" ? 0.3 : 0.15);
        rays.scale.setScalar(1 + (1 - settle) * 0.3);
        // What's inside rises out of the light, overshooting a little.
        const grow = calm ? 1 : easeOutBack(THREE.MathUtils.clamp(since / 0.55, 0, 1));
        reveal.position.set(0, revealY, 0.3);
        if (inside) {
          inside.object.scale.setScalar(Math.max(grow, 0.001));
          inside.object.position.y = 0;
          inside.pose(since, seconds, calm);
        }
        floor.position.set(0, floorY, 0);
        floor.material.opacity = FLOOR_GLOW * Math.min(1, since / 0.6);
        for (const rim of rims) rim.intensity = RIM_LIGHT * Math.min(1, since / 0.4);
        if (phase === "burst" && since > 0.45) setPhase("revealed");
        // A legendary keeps glittering.
        if (rarity === "legendary" && !calm && Math.random() < 0.6) {
          spark.add({
            position: new THREE.Vector3(
              (Math.random() - 0.5) * 1.8,
              revealY - 0.8 + Math.random() * 0.4,
              0.4,
            ),
            velocity: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.6 + Math.random() * 0.6, 0),
            life: 1.4 + Math.random(),
            age: 0,
            colour: rarityColour.clone().multiplyScalar(0.9),
          });
        }
      }

      punch = Math.max(0, punch - dt * 3);
      camera.position.z = CAMERA_Z - Math.sin(punch * Math.PI) * 0.35;
      spark.update(dt, -0.8);
      foil.update(dt);
      // A calm show is still once it's drawn; otherwise it's always moving.
      return !calm || phase === "building" || phase === "burst";
    },
    dispose: () => {
      gone.now = true;
      inside?.dispose();
      freeShot(scene);
      for (const material of [pack.foil, rays.material, halo.material, floor.material]) {
        material.dispose();
      }
    },
  };
};
