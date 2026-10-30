import * as THREE from "three";
import { glowTexture } from "../textures";
import { type Prop, seeded } from "./shapes";
import { SEAT, terrace } from "./stands";

// The Space Stadium: a sleek open stand of aliens behind the goal, edged in neon, with a ring of
// lights along its top, LED boards round the pitch, and the stars and a ringed planet over it
// (see ./planets.ts). Units are metres; the goal is down -Z, 30 m away.

const LOWER = { z: -40, width: 76, rows: 14, from: 1.2 };
/** Neon, bright enough to glow through the tone mapping. */
const NEON = {
  cyan: new THREE.Color("#4ff3ff").multiplyScalar(2.2),
  pink: new THREE.Color("#ff4fd8").multiplyScalar(2),
};

/** A strip of neon from one end to the other, `y` up at `z`. */
const strip = (width: number, y: number, z: number, colour: THREE.Color) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.12, 0.08),
    new THREE.MeshBasicMaterial({ color: colour }),
  );
  mesh.position.set(0, y, z);
  return mesh;
};

/** The LED boards' picture: a gradient running from cyan to violet, with chevrons along it. */
const boardsTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
    gradient.addColorStop(0, "#1a0d4a");
    gradient.addColorStop(0.5, "#2a1470");
    gradient.addColorStop(1, "#1a0d4a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 32);
    ctx.strokeStyle = "#4ff3ff";
    ctx.lineWidth = 3;
    for (let x = 0; x < 1024; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x + 12, 16);
      ctx.lineTo(x, 26);
      ctx.stroke();
    }
    ctx.fillStyle = "#ff4fd8";
    ctx.font = `800 20px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = "middle";
    for (let x = 140; x < 1024; x += 340) ctx.fillText("HEADS UP", x, 17);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
};

export const spaceStadium = (): Prop => {
  const object = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    color: "#2a2550",
    roughness: 0.35,
    metalness: 0.6,
  });
  const fans = {
    colours: ["#7ed957", "#ae8cf0", "#6fc3ff", "#ff7ae0", "#c7ced8", "#fff36b"],
    coats: ["#2a2f45", "#3a2a5a", "#1f3a4a", "#c7ced8"],
    skins: ["#7ed957", "#5fd6ae", "#ae8cf0", "#a6e03c", "#6fc3ff"],
    seats: "#2a1c66",
    full: 0.95,
  };

  const crowd = terrace({ ...fans, seed: 41 }, LOWER.width, LOWER.rows, 0.55);
  crowd.position.set(0, LOWER.from, LOWER.z);
  object.add(crowd);
  // The stand's front wall, edged with neon along its top, and its back wall, with a ring of
  // lights and a strip of neon along the top.
  const front = new THREE.Mesh(new THREE.BoxGeometry(LOWER.width, LOWER.from, 0.4), hull);
  front.position.set(0, LOWER.from / 2, LOWER.z + 0.2);
  const top = LOWER.from + LOWER.rows * SEAT.rise;
  const back = LOWER.z - LOWER.rows * SEAT.depth;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(LOWER.width, top + 1.6, 0.5), hull);
  wall.position.set(0, (top + 1.6) / 2, back - 0.3);
  object.add(
    front,
    wall,
    strip(LOWER.width, LOWER.from + 0.06, LOWER.z + 0.42, NEON.cyan),
    strip(LOWER.width, top + 1.5, back - 0.02, NEON.pink),
  );
  // A ring of lights along the top, all one set of points.
  const glow = glowTexture();
  const lights: number[] = [];
  for (let x = -LOWER.width / 2; x <= LOWER.width / 2; x += 6) lights.push(x, top + 1.9, back);
  const ring = new THREE.BufferGeometry();
  ring.setAttribute("position", new THREE.Float32BufferAttribute(lights, 3));
  object.add(
    new THREE.Points(
      ring,
      new THREE.PointsMaterial({
        map: glow,
        color: "#e6dcff",
        size: 1.6,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );

  // LED boards round the pitch.
  const ads = boardsTexture();
  ads.repeat.set(3, 1);
  const boards = new THREE.Mesh(new THREE.BoxGeometry(80, 0.9, 0.2), [
    hull,
    hull,
    hull,
    hull,
    new THREE.MeshBasicMaterial({ map: ads, color: new THREE.Color(1.5, 1.5, 1.5) }),
    hull,
  ]);
  boards.position.set(0, 0.45, -37);
  object.add(boards);

  // Little lights moving about in the stands: the aliens' antennae, waving.
  const random = seeded(8);
  const count = 120;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const row = random() * LOWER.rows;
    positions.set(
      [
        (random() - 0.5) * LOWER.width,
        LOWER.from + row * SEAT.rise + 1.3,
        LOWER.z - row * SEAT.depth + 0.2,
      ],
      i * 3,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const antennae = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: glow,
      color: "#b6ff6b",
      size: 0.35,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  object.add(antennae);
  return {
    object,
    update: (seconds) => {
      antennae.position.y = Math.sin(seconds * 3) * 0.05;
    },
  };
};
