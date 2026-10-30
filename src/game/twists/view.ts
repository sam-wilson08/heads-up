import * as THREE from "three";
import type { Item, Lane, Round, Rules } from "../engine";
import type { FlyingKind } from "../objects";

// How a venue's twist is drawn. The scene asks it to dress each thing in the air (to move it off
// its lane's path, glow, or hide it in snow), and moves its venue-wide effects on each frame: the
// UFO, gusts of sand, dust devils, the castle's candles. Everything here is drawn from the round as the
// engine left it, and from its seed and clock, so a level looks the same each time it's played.

export interface TwistContext {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly rules: Rules;
  readonly seed: number;
  /** Whether the player has asked for less motion. */
  readonly calm: boolean;
  /** Every kind of thing the round throws. */
  readonly thrown: readonly FlyingKind[];
  /** Builds one of the things that fly, as the game does. */
  readonly make: (kind: FlyingKind) => THREE.Object3D;
  /** Where something on its way down `lane` is, `p` through its flight, as the scene flies it. */
  readonly pathAt: (item: Item, lane: Lane, p: number) => THREE.Vector3;
  /** Where something meets the player in a lane: over their head. */
  readonly contactAt: (item: Item, lane: Lane) => THREE.Vector3;
}

/** What a twist does to how one thing in the air is drawn. */
export interface Dressing {
  /**
   * Where it's drawn (`air`) and where its shadow falls (`ground`), given where its lane's path
   * puts it, `p` through its flight; undefined to leave it where it is.
   */
  move?(item: Item, round: Round, p: number, path: THREE.Vector3): Placed | undefined;
  /** Shows the twist on it, once it's placed and sized, and says how the thing itself shows. */
  update(item: Item, round: Round, object: THREE.Object3D, at: THREE.Vector3, size: number): Shown;
  dispose(): void;
}

export interface Placed {
  readonly air: THREE.Vector3;
  readonly ground: THREE.Vector3;
}

export interface Shown {
  /** Whether the thing itself shows: not while it's in snow, or once it's exploded. */
  readonly show: boolean;
  /** Whether a football's streak glow shows with it. */
  readonly glow: boolean;
  /** How strongly its shadow shows, against the usual 1. */
  readonly shadow?: number;
}

export const SHOWN: Shown = { show: true, glow: true };

export interface TwistView {
  /** How the twist dresses something new in the air, if it does. */
  dress(item: Item): Dressing | undefined;
  /** Moves the venue-wide effects on, to the round as it now stands. */
  update(round: Round, seconds: number, dt: number): void;
  /** How far the twist leans the screen at the round as it now stands, in radians, clockwise. */
  lean?(round: Round): number;
  /** Its own shapes, to compile before the first frame so nothing stutters the first time. */
  readonly warmUp: readonly THREE.Object3D[];
  dispose(): void;
}

/** A twist with nothing to draw: the park's, or a round without one. */
export const PLAIN: TwistView = {
  dress: () => undefined,
  update: () => undefined,
  warmUp: [],
  dispose: () => undefined,
};

// --- Shared pieces --------------------------------------------------------------------------------

export const smooth = (edge0: number, edge1: number, x: number): number =>
  THREE.MathUtils.smoothstep(x, edge0, edge1);

/** How far through its flight something is: 0 at launch, 1 when it reaches the player. */
export const progress = (item: Item, now: number): number =>
  (now - item.launchedAt) / item.flightMs;

const canvasTexture = (size: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** A soft round glow, white, for tinting. */
export const glowDisc = (): THREE.Texture =>
  canvasTexture(64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

/** A glowing ring, white, for tinting: portals and where a lava bomb will land. */
export const ringTexture = (): THREE.Texture =>
  canvasTexture(128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.12)");
    g.addColorStop(0.55, "rgba(255,255,255,0.25)");
    g.addColorStop(0.72, "rgba(255,255,255,1)");
    g.addColorStop(0.82, "rgba(255,255,255,0.65)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });

/** A sprite that glows: light added to whatever's behind it. */
export const glowSprite = (map: THREE.Texture, colour: THREE.ColorRepresentation) =>
  new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      color: colour,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );

/** Frees a shape's own geometry and materials, and their pictures. */
export const disposeDeep = (object: THREE.Object3D): void => {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite || o instanceof THREE.Points))
      return;
    const shape = o as THREE.Mesh;
    if (!(o instanceof THREE.Sprite)) shape.geometry.dispose();
    for (const m of Array.isArray(shape.material) ? shape.material : [shape.material]) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
};

/**
 * Where something is between two lanes' paths: `t` 0 on the first, 1 on the second, and past them
 * either way, for things swaying off the edge lanes.
 */
export const betweenLanes = (
  pathAt: TwistContext["pathAt"],
  item: Item,
  from: Lane,
  to: Lane,
  p: number,
  t: number,
): THREE.Vector3 => pathAt(item, from, p).lerp(pathAt(item, to, p), t);

/**
 * The screen as a grid of squares, in clip space (from -0.5 to 0.5, doubled by the shader that
 * draws it) with the screen's UVs, leaving out those where an overlay is always clear: where
 * `reach(u, v)`, which grows away from the middle, is under `clear` at every corner. A darkened
 * edge drawn on it needn't fill the middle of the screen at all.
 */
export const screenFrame = (
  reach: (u: number, v: number) => number,
  clear: number,
  cells = 12,
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const [u0, u1, v0, v1] = [i / cells, (i + 1) / cells, j / cells, (j + 1) / cells];
      if (Math.max(reach(u0, v0), reach(u1, v0), reach(u0, v1), reach(u1, v1)) < clear) continue;
      for (const [u, v] of [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v0],
        [u1, v1],
        [u0, v1],
      ] as const) {
        positions.push(u - 0.5, v - 0.5, 0);
        uvs.push(u, v);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
};
