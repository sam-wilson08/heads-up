import * as THREE from "three";
import { seeded } from "./shapes";

// The stands: rows of spectators on terraces round a ground, too many and too far off to model
// one by one. Each stand's crowd is a picture of rows of people, painted on a canvas: heads and
// shoulders in coats, shirts and scarves, hats in the colours, some standing with their arms up,
// and seats showing through where there are gaps, each row a little hidden by the row in front.
// It's laid along a sloping terrace, so it catches the venue's light like everything else. Units
// are metres.

/** Who's in a crowd: what they wear, and the seats they sit in. */
export interface Fans {
  /** The colours they wear: the home side's, mostly, in shirts, scarves and hats. */
  readonly colours: readonly string[];
  /** The plain coats and jackets of everyone not in the colours. */
  readonly coats?: readonly string[];
  readonly seats: string;
  /** Their faces, if they're not people's: aliens' green and violet, say. */
  readonly skins?: readonly string[];
  /** How many seats are taken, from 0 to 1. */
  readonly full?: number;
  readonly seed?: number;
}

const SKIN = ["#f1c7a3", "#e2b08a", "#c68a5e", "#9a6440", "#6d4128", "#f5d2b5"] as const;
const HAIR = ["#2a1c14", "#3d2a1c", "#6e4a2a", "#14100c", "#8c7a68", "#b89a6a"] as const;
const COATS = [
  "#1f2530",
  "#2c3542",
  "#3b3a3a",
  "#4a4f3a",
  "#5a2a2a",
  "#26364f",
  "#6a6a6e",
] as const;

/** How the crowd's picture is laid out: rows of people, each so many pixels across and high. */
const PICTURE = { width: 1024, height: 512, row: 32, person: 12 };
/** How many people a row of the picture holds, and how many rows it has. */
export const PER_ROW = PICTURE.width / PICTURE.person;
export const ROWS = PICTURE.height / PICTURE.row;

const pick = <T>(random: () => number, from: readonly T[]): T =>
  from[Math.floor(random() * from.length)] ?? (from[0] as T);

const shaded = (colour: string, by: number) =>
  `#${new THREE.Color(colour).multiplyScalar(by).getHexString()}`;

/** Paints rows of fans, the back row at the top of the picture, so each row hides the one behind. */
const paintCrowd = (ctx: CanvasRenderingContext2D, fans: Fans) => {
  const { width, height, row, person } = PICTURE;
  const random = seeded(fans.seed ?? 11);
  const coats = fans.coats ?? COATS;
  ctx.fillStyle = shaded(fans.seats, 0.55);
  ctx.fillRect(0, 0, width, height);
  for (let top = 0; top < height; top += row) {
    // The seats along the row, and the dark step down in front of them.
    ctx.fillStyle = fans.seats;
    for (let x = 0; x < width; x += person) ctx.fillRect(x + 1, top + 14, person - 2, 12);
    ctx.fillStyle = shaded(fans.seats, 0.35);
    ctx.fillRect(0, top + row - 5, width, 5);
    for (let x = 0; x < width; x += person) {
      if (random() > (fans.full ?? 0.92)) continue;
      const inColours = random() < 0.5;
      const body = inColours ? pick(random, fans.colours) : pick(random, coats);
      const skin = pick(random, fans.skins ?? SKIN);
      const standing = random() < 0.35;
      const cx = x + person / 2 + (random() - 0.5) * 2;
      const lift = standing ? -6 : 0;
      // Shoulders and body, lit from above and shaded down into the row in front.
      const gradient = ctx.createLinearGradient(0, top + 12 + lift, 0, top + row);
      gradient.addColorStop(0, shaded(body, 1.15));
      gradient.addColorStop(0.5, body);
      gradient.addColorStop(1, shaded(body, 0.45));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(cx - 5, top + 13 + lift, 10, row - 13 - lift, [4, 4, 1, 1]);
      ctx.fill();
      // A scarf round the neck in the colours, or held up overhead.
      if (random() < 0.3) {
        const scarf = pick(random, fans.colours);
        if (standing && random() < 0.5) {
          ctx.fillStyle = scarf;
          ctx.fillRect(cx - 7, top + 1, 14, 3);
          ctx.fillStyle = skin;
          ctx.fillRect(cx - 7, top + 3, 2, 6);
          ctx.fillRect(cx + 5, top + 3, 2, 6);
        } else {
          ctx.fillStyle = scarf;
          ctx.fillRect(cx - 4, top + 13 + lift, 8, 2);
        }
      } else if (standing && random() < 0.4) {
        // Arms up.
        ctx.fillStyle = body;
        ctx.fillRect(cx - 6, top + 2 + lift, 2, 12);
        ctx.fillRect(cx + 4, top + 2 + lift, 2, 12);
        ctx.fillStyle = skin;
        ctx.fillRect(cx - 6, top + 1 + lift, 2, 2);
        ctx.fillRect(cx + 4, top + 1 + lift, 2, 2);
      }
      // The head, with a hat in the colours or hair.
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(cx, top + 10 + lift, 2.6, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = random() < 0.2 ? pick(random, fans.colours) : pick(random, HAIR);
      ctx.beginPath();
      ctx.ellipse(cx, top + 8.2 + lift, 2.8, 1.8, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }
};

const drawn = new Map<string, THREE.Texture>();

/** A crowd's picture, drawn once for each crowd and shared. It repeats across a stand. */
export const crowdTexture = (fans: Fans): THREE.Texture => {
  const key = JSON.stringify(fans);
  let texture = drawn.get(key);
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = PICTURE.width;
    canvas.height = PICTURE.height;
    const ctx = canvas.getContext("2d");
    if (ctx) paintCrowd(ctx, fans);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    drawn.set(key, texture);
  }
  return texture;
};

/** How wide a seat is, and how far each row of seats is up and back from the one in front. */
export const SEAT = { width: 0.55, rise: 0.42, depth: 0.8 };

/**
 * A crowd on a sloping terrace, lit by the venue: `rows` of seats from a front edge `width` wide,
 * each up and back from the last, darkened by `shade`. Its front edge is at the origin, facing +Z, for the stand to
 * place.
 */
export const terrace = (fans: Fans, width: number, rows: number, shade = 0.7): THREE.Mesh => {
  const depth = rows * SEAT.depth;
  const rise = rows * SEAT.rise;
  const slope = Math.hypot(depth, rise);
  const geometry = new THREE.PlaneGeometry(width, slope);
  // Tipped back to lie along the slope, front edge at the origin.
  geometry.rotateX(-Math.atan2(depth, rise));
  geometry.translate(0, rise / 2, -depth / 2);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * width) / (SEAT.width * PER_ROW), (uv.getY(i) * rows) / ROWS);
  }
  return new THREE.Mesh(
    geometry,
    // A little in shadow under the roof, and so as not to compete with what's thrown in front.
    new THREE.MeshStandardMaterial({
      map: crowdTexture(fans),
      color: new THREE.Color(shade, shade, shade),
      roughness: 0.92,
    }),
  );
};
