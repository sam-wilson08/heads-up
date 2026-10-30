import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// One WebGL renderer for every 3D picture outside the game: the ball on the title screen, the kits
// and venues to choose from, and the pack. Browsers allow only a handful of WebGL contexts at once,
// so rather than a canvas each, pictures are drawn here and then either copied onto a plain 2D
// canvas, saved as an image to show again, or, for the pack, which fills the screen on its own,
// drawn straight onto the page by this renderer's own canvas.

/** A picture to take: a scene, the camera on it, and what to free once it's taken. */
export interface Shot {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /**
   * How its light reaches the picture, for a venue lit as the game lights it (see game/look.ts).
   * Pictures without one are drawn as they're lit.
   */
  readonly look?: { readonly toneMapping: THREE.ToneMapping; readonly exposure: number };
  dispose?(): void;
}

let renderer: THREE.WebGLRenderer | undefined;
let environment: THREE.Texture | undefined;
let unavailable = false;
/** The element the renderer's canvas is shown in, while something has the stage. */
let stagedIn: HTMLElement | undefined;
/** How many holds there are on taking pictures (see holdPictures). */
let holds = 0;

/** The renderer, made the first time it's needed. Undefined if this browser has no WebGL. */
export const studio = (): THREE.WebGLRenderer | undefined => {
  if (renderer || unavailable) return renderer;
  try {
    const made = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    made.outputColorSpace = THREE.SRGBColorSpace;
    // Sizes are given in the canvas's own pixels, already scaled for the screen.
    made.setPixelRatio(1);
    made.setClearColor(0x000000, 0);
    // A venue's picture has the sun's shadows, as in the game.
    made.shadowMap.enabled = true;
    made.shadowMap.type = THREE.PCFShadowMap;
    made.domElement.className = "studio-canvas";
    // If the phone takes the GPU back, the next picture makes a new renderer. Saved pictures keep.
    made.domElement.addEventListener("webglcontextlost", () => {
      if (renderer === made) {
        renderer = undefined;
        environment = undefined;
      }
    });
    renderer = made;
  } catch (error) {
    console.warn("No WebGL for the menus' 3D pictures, so they're drawn flat", error);
    unavailable = true;
  }
  return renderer;
};

/** A softly lit room for shiny things to reflect, as in the game: the ball, the pack's foil. */
export const studioEnvironment = (): THREE.Texture | undefined => {
  const r = studio();
  if (!r) return undefined;
  if (!environment) {
    const pmrem = new THREE.PMREMGenerator(r);
    environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return environment;
};

/** How many pixels to draw for each CSS pixel: the screen's, but no more than 2. */
export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);

const size = new THREE.Vector2();

/** Draws a shot through its own tone mapping and exposure, if it has them. */
const render = (r: THREE.WebGLRenderer, shot: Shot) => {
  r.toneMapping = shot.look?.toneMapping ?? THREE.NoToneMapping;
  r.toneMappingExposure = shot.look?.exposure ?? 1;
  r.render(shot.scene, shot.camera);
};

/**
 * Draws a scene into the renderer's bottom-left corner, `width` by `height` pixels, growing its
 * canvas if it's too small. It never shrinks, since a new size means a new drawing buffer.
 */
const draw = (r: THREE.WebGLRenderer, shot: Shot, width: number, height: number) => {
  r.getSize(size);
  if (size.x < width || size.y < height) {
    r.setSize(Math.max(size.x, width), Math.max(size.y, height), false);
    r.getSize(size);
  }
  r.setViewport(0, 0, width, height);
  r.setScissor(0, 0, width, height);
  r.setScissorTest(true);
  render(r, shot);
  r.setScissorTest(false);
  return size.y - height;
};

/**
 * Draws a scene onto a 2D canvas, at the canvas's size. Copying it straight away, in the same
 * task, is what lets the renderer skip keeping its picture. False if it couldn't be drawn.
 */
export const paint = (target: HTMLCanvasElement, shot: Shot): boolean => {
  const r = studio();
  const ctx = target.getContext("2d");
  if (!r || !ctx || stagedIn || target.width === 0 || target.height === 0) return false;
  const top = draw(r, shot, target.width, target.height);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(
    r.domElement,
    0,
    top,
    target.width,
    target.height,
    0,
    0,
    target.width,
    target.height,
  );
  return true;
};

// --- Moving pictures ----------------------------------------------------------------------------

/** Draws one frame, `seconds` in; returns whether there's more to come. */
export type Frame = (seconds: number, dt: number) => boolean;

const playing = new Set<{ frame: Frame; start: number }>();
let loop = 0;
let last = 0;

const tick = (time: number) => {
  // A long gap (a hidden tab, a slow frame) counts as a short one, so nothing jumps ahead.
  const dt = Math.min((time - last) / 1000, 0.1);
  last = time;
  for (const view of playing) {
    if (!view.frame((time - view.start) / 1000, dt)) playing.delete(view);
  }
  loop = playing.size > 0 ? requestAnimationFrame(tick) : 0;
};

/**
 * Plays a moving picture, a frame each time the screen refreshes, until it says it's done or is
 * stopped. Every picture playing shares the one loop, and the loop stops when none are.
 */
export const play = (frame: Frame): (() => void) => {
  const view = { frame, start: performance.now() };
  playing.add(view);
  if (!loop) {
    last = performance.now();
    loop = requestAnimationFrame(tick);
  }
  return () => {
    playing.delete(view);
    if (playing.size === 0 && loop) {
      cancelAnimationFrame(loop);
      loop = 0;
    }
  };
};

/**
 * Gives a picture the whole stage: the renderer's own canvas goes into `container`, filling it,
 * so a big moving picture is drawn with no copying. Pictures waiting to be taken wait until it's
 * handed back. Undefined if there's no WebGL, or the stage is taken.
 */
export const stage = (
  container: HTMLElement,
):
  | { render(shot: Shot): void; resize(): { width: number; height: number }; release(): void }
  | undefined => {
  const r = studio();
  if (!r || stagedIn) return undefined;
  stagedIn = container;
  const canvas = r.domElement;
  container.append(canvas);
  const resize = () => {
    const ratio = pixelRatio();
    const width = Math.max(1, Math.round(container.clientWidth * ratio));
    const height = Math.max(1, Math.round(container.clientHeight * ratio));
    r.setSize(width, height, false);
    return { width, height };
  };
  resize();
  return {
    render: (shot) => {
      r.getSize(size);
      r.setViewport(0, 0, size.x, size.y);
      render(r, shot);
    },
    resize,
    release: () => {
      canvas.remove();
      // Shrunk back, so a full screen's drawing buffer isn't kept for the next small picture.
      r.setSize(1, 1, false);
      if (stagedIn === container) stagedIn = undefined;
      if (holds === 0) waiting.splice(0).forEach((go) => go());
    },
  };
};

/**
 * Stops pictures being taken until what it returns is called: for a round, which needs all of a
 * phone. Each picture of a venue builds it, compiles its shaders on this renderer's own context
 * and draws it, and a page of them, like the stages, can still be queued when play is pressed:
 * on a phone, seconds at a few frames a second at the start of the round.
 */
export const holdPictures = (): (() => void) => {
  holds++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds--;
    if (holds === 0 && !stagedIn) waiting.splice(0).forEach((go) => go());
  };
};

// --- Saved pictures -----------------------------------------------------------------------------

const taken = new Map<string, Promise<string | undefined>>();
let queue: Promise<unknown> = Promise.resolve();
const waiting: (() => void)[] = [];

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const offStage = () =>
  stagedIn || holds > 0 ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve();

/**
 * Takes a picture once and keeps it, as an image address for an <img>: `key` says what it's of,
 * and asking again gives the same one. Pictures are taken one at a time, a frame apart, so a page
 * of them doesn't stop the screen. Undefined if it couldn't be taken.
 */
export const snapshot = (
  key: string,
  width: number,
  height: number,
  set: () => Promise<Shot> | Shot,
): Promise<string | undefined> => {
  const ratio = pixelRatio();
  const id = `${key}@${width}x${height}x${ratio}`;
  let picture = taken.get(id);
  if (!picture) {
    picture = (queue = queue.then(async () => {
      if (!studio()) return undefined;
      await offStage();
      await nextFrame();
      let shot: Shot | undefined;
      try {
        shot = await set();
        await offStage();
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        if (!paint(canvas, shot)) return undefined;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        return blob ? URL.createObjectURL(blob) : undefined;
      } catch (error) {
        console.warn(`Couldn't take the picture of ${key}`, error);
        return undefined;
      } finally {
        shot?.dispose?.();
      }
    })) as Promise<string | undefined>;
    taken.set(id, picture);
  }
  return picture;
};

/**
 * Frees what a picture's scene holds on the GPU: its shapes, its players' bones, and the pictures
 * drawn for it on a canvas. Loaded images, like the player's skin and the grass photos, are shared by every picture,
 * so they're kept, as are materials, so their compiled shaders carry over to the next picture.
 */
export const freeShot = (root: THREE.Object3D) => {
  root.traverse((o) => {
    if ("geometry" in o && o.geometry instanceof THREE.BufferGeometry) o.geometry.dispose();
    // A skinned player's bones are on the GPU as a picture of their own.
    if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    if (!("material" in o)) return;
    for (const material of [o.material].flat()) {
      if (!(material instanceof THREE.Material)) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && value.image instanceof HTMLCanvasElement) {
          value.dispose();
        }
      }
    }
  });
};
