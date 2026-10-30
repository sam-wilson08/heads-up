import * as THREE from "three";
import type { Kit } from "../kits";
import type { Venue } from "../venues";
import { EYE } from "./backdrop";
import { buildCrowd, CROWD_SIZE, crowdFor } from "./crowd";
import { ANIMATE } from "./decoys";
import {
  arrivalOf,
  CLASSIC_DECOYS,
  duckProgress,
  FREE_PLAY,
  GHOST,
  isFootball,
  isSkied,
  isSkimmed,
  type Item,
  jumpProgress,
  LANDING_MS,
  type Lane,
  LANES,
  progressOf,
  type Round,
  type RoundEvent,
  type Rules,
  skies,
  sweptFrom,
} from "./engine";
import { GOAL_Z, groundReady } from "./ground";
import { buildHighBalls } from "./highball";
import { buildHurdle } from "./hurdles";
import { prepareRenderer } from "./look";
import { type FlyingKind, itemFactory, MOTION } from "./objects";
import { buildPlayer, PLAYER_HEIGHT, type Side, WAIST } from "./player";
import { type Quality, SHOW_PERF } from "./quality";
import { buildRainbow, glowFor } from "./rainbow";
import { freeScene, keepShaders, roomEnvironment, texturesIn } from "./renderer";
import { buildScenery } from "./scenery";
import { shadowTexture } from "./textures";
import { buildTwist } from "./twists";
import { SHOWN } from "./twists/view";

// Draws a round of Heads Up in 3D. Units are metres and seconds. The player stands on the origin
// facing down -Z towards the goal, and the camera looks over their shoulders from behind.

/**
 * How far apart the lanes are at the player's feet. The player steps into a lane, leaning a little
 * into it, which puts their head about half a metre out. Any further and a portrait phone would
 * cut off their elbows.
 */
const STEP = 0.42;
const TILT = THREE.MathUtils.degToRad(6);
/**
 * The camera, behind and above the player, looking down the pitch past them. It's framed like a
 * broadcast's camera behind the play: the player whole in the bottom half of a phone held upright,
 * their boots clear of the bottom edge, the goal across two thirds of the screen above them, and
 * only a band of sky over the stadium behind it, where things are lobbed in.
 */
const CAMERA = {
  position: EYE.clone(),
  target: new THREE.Vector3(0, 0.5, -12),
  /** How much it sees, top to bottom, in degrees. */
  fov: 38,
  /** How far it slides across with the player, so a side lane stays on a portrait screen. */
  follow: 0.35,
};
/**
 * The most pixels a frame's drawn at: about twice a phone's on the highest quality, so a round
 * filling a laptop's screen (see wide.ts) still draws at 60 frames a second.
 */
const PIXEL_BUDGET = 2_600_000;
/** The width of a portrait phone over its height, 390 by 844, which the camera is framed for. */
const PORTRAIT = 390 / 844;
/** Turns a view's height into its width, or back, in degrees, for a screen's width over height. */
const viewAcross = (fov: number, aspect: number) =>
  THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect));
/**
 * How much the camera sees, top to bottom, on a screen: the usual amount, or on a screen narrower
 * than a phone's, enough more that it sees as far across as a phone does, so a player leaning into
 * a side lane still has their elbows on it.
 */
const fovFor = (aspect: number) =>
  Math.max(CAMERA.fov, viewAcross(viewAcross(CAMERA.fov, PORTRAIT), 1 / aspect));
/**
 * Where the camera eases back and up to, and what it looks down at, when a player who falls by
 * themselves is knocked out: they fall back towards it, off the bottom of the screen otherwise.
 */
const KNOCKED_OUT = {
  position: new THREE.Vector3(0, 3.8, 8.4),
  target: new THREE.Vector3(0, 0, -2.5),
  ms: 700,
};
const LAUNCH = { z: GOAL_Z + 3, y: 1.8, spread: 1.1 };
/**
 * How high above a straight line the items are lobbed, at the top of their flight. Frisbees
 * skimmed in at head height (see isSkimmed) are thrown flat and low, and only float up a little.
 */
const LOB = 2.6;
const SKIM_LOB = 0.3;
const GRAVITY = -9.8;

const SIZE = { football: 0.48, decoy: 0.5 };
/** How high a jump takes the player's feet. */
const JUMP_HEIGHT = 0.8;

const sizeOf = (item: Item) => (isFootball(item.kind) ? SIZE.football : SIZE.decoy);

/** 0 below 0, 1 above 1, and a smooth curve between. */
const smooth01 = (x: number) => THREE.MathUtils.smoothstep(x, 0, 1);

/** The lean into a lane. Leaning right is a clockwise turn, seen from behind. */
const leanFor = (lane: Lane) => -lane * TILT;

/** How far in front of the head, towards the camera, things land. */
const CONTACT_Z = 0.35;

/**
 * Where an item meets the player in a lane: at the top of their head as they stand in it, on the
 * camera's side of it, so it lands over the head rather than disappearing behind it. Being nearer
 * the camera would push it outwards on screen, so it's drawn in by the same proportion to sit over
 * the head.
 */
const contactPoint = (item: Item): THREE.Vector3 => {
  const radius = sizeOf(item) / 2;
  const head = new THREE.Vector3(0, PLAYER_HEIGHT - WAIST - radius * 0.2, 0)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), leanFor(item.lane))
    .add(new THREE.Vector3(item.lane * STEP, WAIST, 0));
  const nearer = (CAMERA.position.z - CONTACT_Z) / CAMERA.position.z;
  return new THREE.Vector3(head.x * nearer, head.y, CONTACT_Z);
};

const launchPoint = (item: Item) =>
  new THREE.Vector3(item.lane * LAUNCH.spread, LAUNCH.y, LAUNCH.z);

const lobOf = (item: Item) => (isSkimmed(item) ? SKIM_LOB : LOB);

/**
 * Where an item is on its way in: a lob from near the goal down onto the player's head, or for a
 * skimmed frisbee, a flat throw at it.
 */
const inFlight = (item: Item, p: number): THREE.Vector3 =>
  launchPoint(item)
    .lerp(contactPoint(item), p)
    .add(new THREE.Vector3(0, lobOf(item) * 4 * p * (1 - p), 0));

/** A number from 0 to 1 that's fixed for each item, to vary how things bounce. */
const jitter = (item: Item, salt: number) => (Math.sin(item.id * 12.9898 + salt * 78.233) + 1) / 2;

/**
 * Where an item is after reaching the player, `t` seconds on. A header sends it straight up and
 * out over the top of the screen; a decoy that hits bounces off; anything else carries on past
 * and out of view.
 */
const afterwards = (item: Item, t: number): THREE.Vector3 => {
  const start = contactPoint(item);
  let velocity: THREE.Vector3;
  switch (item.outcome) {
    case "header":
      // Up and away to its own side, out of the lanes the next balls come in on. Going back towards
      // the goal, it would cross their path and be hard to tell from them.
      velocity = new THREE.Vector3(
        (item.lane || (jitter(item, 1) < 0.5 ? -1 : 1)) * (2 + jitter(item, 2)),
        11,
        -2,
      );
      break;
    case "hit":
      // A bonk: it pops up off the head and drops away to the side, staying in view a moment.
      velocity = new THREE.Vector3(
        (item.lane || (jitter(item, 2) < 0.5 ? -1 : 1)) * (0.8 + jitter(item, 3) * 0.6),
        3.2,
        0.6,
      );
      break;
    default: {
      // The way it was already going: the slope of its lob at the moment it arrived.
      const seconds = item.flightMs / 1000;
      velocity = contactPoint(item)
        .sub(launchPoint(item))
        .add(new THREE.Vector3(0, -4 * lobOf(item), 0))
        .divideScalar(seconds);
    }
  }
  return start.addScaledVector(velocity, t).add(new THREE.Vector3(0, 0.5 * GRAVITY * t * t, 0));
};

/** How high the player is off the ground at a moment, in metres. */
const liftAt = (round: Round, at: number) => {
  const p = jumpProgress(round, at);
  return p === undefined ? 0 : Math.sin(Math.PI * p) * JUMP_HEIGHT;
};

/**
 * How far down the player is in a duck at a moment: 0 standing, 1 all the way down. Down fast, held,
 * then back up, all inside the duck the engine counts (see engine.ts).
 */
const duckedAt = (round: Round) => {
  const p = duckProgress(round);
  return p === undefined ? 0 : smooth01(p / 0.15) * (1 - smooth01((p - 0.8) / 0.2));
};

/** How long the player takes to topple over once their last life has gone, in milliseconds. */
const TOPPLE_MS = 700;
/** How high the player is raised once lying down, so their side or front isn't in the ground. */
const LYING_LIFT = 0.2;

/**
 * How far over the player has fallen, `ms` after losing their last life: 0 standing, 1 flat on
 * the grass. It speeds up as it goes, like anything toppling, then bumps once on landing.
 */
const fallenAt = (ms: number) => {
  const t = Math.min(ms / TOPPLE_MS, 1);
  const landed = (ms - TOPPLE_MS) / 250;
  const bump = landed > 0 && landed < 1 ? Math.sin(landed * Math.PI) * 0.04 : 0;
  return t * t - bump;
};

/**
 * The turn that lays the player flat when their last life goes. They always fall forwards, face
 * down towards the goal, since a portrait screen is too narrow to show them lying sideways. Over a
 * hurdle they go straight down; a knock to the head angles them off the way they were leaning, or
 * away from the bounce if they were upright.
 */
const toppleFor = (event: RoundEvent): { x: number; z: number } => {
  if (!toTheHead(event)) return { x: -Math.PI / 2, z: 0 };
  return { x: -Math.PI / 2, z: -knockedTo(event.item) * 0.35 };
};

/** Whether a knock was to the head: a decoy, or a frisbee skimmed at head height and not ducked. */
const toTheHead = (event: RoundEvent) =>
  event.type === "hit" || (event.type === "tripped" && isSkimmed(event.item));

/**
 * Which way a knock to the head sends the player, as +1 to the right or -1 to the left: the way
 * they were leaning, or away from the bounce if they were upright.
 */
const knockedTo = (item: Item): 1 | -1 => item.lane || (jitter(item, 2) < 0.5 ? 1 : -1);

/** Things still on their way when the player goes down fade out, since nothing reaches them now. */
const fadeOnceDown = (item: Item, round: Round) =>
  round.downAt === undefined || item.outcome
    ? 1
    : Math.max(0, 1 - (round.now - round.downAt) / 300);

/** How something in the round is drawn: it updates itself each frame, and cleans up after. */
interface View {
  update(item: Item, round: Round): void;
  dispose(): void;
}

/** A soft round shadow lying on the ground. */
const groundShadow = (texture: THREE.Texture) => {
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  return blob;
};

/** Marks where the player is drawn, in the stencil buffer, for ghosts to show over. */
const PLAYER_STENCIL = 1;

/**
 * How frames drawn behind the loading screen settle: at most for `ms`, until `frames` in a row come
 * as quickly as a 30-frame-a-second frame (`quickMs`), or nearly as quickly as the quickest yet, on
 * a device that can't manage that.
 */
const SETTLE = { ms: 4000, frames: 3, quickMs: 34 };

/**
 * Draws a frame each time the screen refreshes until the frames come quickly and steadily, or the
 * time's up, or `stopped` says the round's gone. A phone's driver finishes a shader only when it
 * first really draws with it, so these frames are slow until it has, then quick. `draw` waits for
 * the GPU to finish each one, so the time between refreshes is what a frame costs. `progress`
 * hears how far through the time it is, from 0 to 1.
 */
const settle = async (
  draw: () => void,
  stopped: () => boolean,
  progress: (done: number) => void,
): Promise<void> => {
  const refresh = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
  const start = await refresh();
  let last = start;
  let quickest = Infinity;
  let quick = 0;
  while (!stopped() && quick < SETTLE.frames && last - start < SETTLE.ms) {
    draw();
    const now = await refresh();
    const ms = now - last;
    last = now;
    quickest = Math.min(quickest, ms);
    quick = ms <= Math.max(SETTLE.quickMs, quickest * 1.25) ? quick + 1 : 0;
    progress(Math.min((now - start) / SETTLE.ms, 1));
  }
};

const ghosts = new WeakMap<THREE.Material, THREE.Material>();

/**
 * A see-through copy of a material, for the parts of a hurdle hidden behind the player. The camera
 * is low behind them, so whatever comes down their own lane would otherwise be out of sight until
 * it reached their feet. A ghost draws only over the player and only where it's further away than
 * them, so the rest of the hurdle shows as usual.
 */
const ghostOf = (material: THREE.Material): THREE.Material => {
  let ghost = ghosts.get(material);
  if (!ghost) {
    ghost = material.clone();
    ghost.transparent = true;
    ghost.opacity = 0.6;
    ghost.depthWrite = false;
    ghost.depthFunc = THREE.GreaterDepth;
    ghost.stencilWrite = true;
    ghost.stencilRef = PLAYER_STENCIL;
    ghost.stencilFunc = THREE.EqualStencilFunc;
    ghosts.set(material, ghost);
  }
  return ghost;
};

/**
 * Gives every shape in a hurdle a ghost, which follows it as it moves: all but those that say
 * they've none, like the blur behind a ninja's staff, which would show through the player at the
 * ghost's own strength.
 */
const addGhosts = (object: THREE.Object3D) => {
  const meshes: THREE.Mesh[] = [];
  object.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noGhost) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    if (!Array.isArray(mesh.material)) {
      mesh.add(new THREE.Mesh(mesh.geometry, ghostOf(mesh.material)));
    }
  }
};

export interface GameSceneOptions {
  readonly venue: Venue;
  readonly name: string;
  readonly number: number;
  readonly kit: Kit;
  readonly model: THREE.Object3D | undefined;
  /** The round's rules, for its twist. Free play's, if not given. */
  readonly rules?: Rules;
  /** The round's seed, which the twists that only change what's seen are drawn from. */
  readonly seed?: number;
  /** How finely it's drawn (see ./quality.ts). As designed, if not given. */
  readonly quality?: Quality;
}

export interface GameScene {
  /** The canvas it draws on. */
  readonly canvas: HTMLCanvasElement;
  /**
   * Gets everything the round can show onto the GPU before its clock starts, so nothing stutters
   * the first time it appears: compiles every shader, uploads every picture, and draws frames
   * behind the loading screen until they come quickly. `progress` hears how far
   * through it is, from 0 to 1. Without it, the first render does the compiling, all at once.
   */
  prepare(progress?: (done: number) => void): Promise<void>;
  /**
   * Compiles the round's shaders and does nothing else, for a scene built only to warm the
   * renderer up before anyone presses play (see Game.tsx's preload). The browser compiles them in
   * the background, and the round that's played finds them ready.
   */
  warm(): void;
  /** Draws the round as it now stands, given what has just happened in it. */
  render(round: Round, events: readonly RoundEvent[], dtMs: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/**
 * Builds a round's scene. Drawn by the game's renderer, which is kept from round to round (see
 * ./renderer.ts), or on a canvas with a renderer of its own, as the venue previews do.
 */
export const createGameScene = (
  target: HTMLCanvasElement | THREE.WebGLRenderer,
  { venue, name, number, kit, model, rules = FREE_PLAY, seed = 0, quality }: GameSceneOptions,
): GameScene => {
  const owned = target instanceof HTMLCanvasElement;
  const renderer = owned
    ? new THREE.WebGLRenderer({ canvas: target, antialias: true, stencil: true })
    : target;
  if (owned) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  /** The pixels drawn to each of the screen's, before a big window draws fewer (see resize). */
  const pixelRatio = renderer.getPixelRatio();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // The venue's tone mapping and exposure, and soft shadows (see ./look.ts).
  prepareRenderer(renderer, venue);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, PORTRAIT, 0.1, 400);
  camera.position.copy(CAMERA.position);
  camera.lookAt(CAMERA.target);
  /** Which way up the camera is between moves, before a twist leans it over. */
  const level = camera.quaternion.clone();

  const scenery = buildScenery(venue, scene, renderer, quality?.bakeEnvironment ?? true);
  /** Sets how many texels a side the sun's shadow map has, or with 0, turns its shadows off. */
  const shadowMap = (size: number) => {
    const { key } = scenery.lights;
    if (size === 0) {
      renderer.shadowMap.enabled = false;
      key.castShadow = false;
    } else if (key.castShadow && key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      // Made again at the new size the next time it's drawn.
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
  };
  // Shadows as fine as the round's quality has them (see ./quality.ts).
  if (quality) shadowMap(quality.shadowMapSize);
  // A softly lit room for the shiny things to reflect: the gold ball, the stopwatch, the hat band.
  const room = roomEnvironment(renderer);
  const items = itemFactory(room.texture);
  const crowd = buildCrowd(venue.crowd, kit);
  scene.add(crowd.object);
  /** At most how many of the crowd come out, for the round's quality: none on a cliff's edge. */
  const crowdCap = venue.ledge === undefined ? (quality?.crowd ?? CROWD_SIZE) : 0;

  const player = buildPlayer(model, name, number, kit);
  player.object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    // The player casts the only shadow that moves with the sun's, and shades themselves: their
    // arms on their sides, their head on their back.
    o.castShadow = true;
    o.receiveShadow = true;
    const material = (o as THREE.Mesh).material;
    for (const m of Array.isArray(material) ? material : [material]) {
      m.stencilWrite = true;
      m.stencilRef = PLAYER_STENCIL;
      m.stencilZPass = THREE.ReplaceStencilOp;
    }
  });
  scene.add(player.object);

  const shadow = shadowTexture();
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Everything the round throws.
  const thrown: FlyingKind[] = ["ball", "golden", ...CLASSIC_DECOYS, ...(venue.decoys ?? [])];
  // The castle's ghost balls aren't among its decoys: its twist throws them.
  if (rules.twist?.kind === "haunt") thrown.push(GHOST);
  // The venue's twist, which makes it play its own way (see ./twists).
  const context = {
    scene,
    camera,
    rules,
    seed,
    calm,
    thrown,
    make: (kind: FlyingKind) => items.make(kind),
    pathAt: (item: Item, lane: Lane, p: number) => inFlight({ ...item, lane }, p),
    contactAt: (item: Item, lane: Lane) => contactPoint({ ...item, lane }),
  };
  const twist = buildTwist(context);
  // Skied balls, which the base game dresses itself, never the twist (see ./highball.ts).
  const highBalls = buildHighBalls(context);
  const views = new Map<number, View>();
  const rainbow = buildRainbow(scene, calm);
  /** How strongly the footballs glow, easing towards what the streak calls for. */
  let streakGlow = 0;

  let seconds = 0;
  let lean = 0;
  /** Where the player stands across the lanes, and the step they're taking to get there. */
  let across = 0;
  let step = { from: 0, to: 0 };
  let headedAt = -10;
  let hitAt = -10;
  let trippedAt = -10;
  let landedAt = -10;
  let wasUp = false;
  let topple = { x: 0, z: 0 };
  /** The way a player who falls over by themselves went, once a knock to the head put them down. */
  let fellTo: Side | undefined;
  /** What the camera looks at while it follows them down. */
  const aim = new THREE.Vector3();
  // Kept to work in, so drawing a frame makes nothing new for the garbage collector to clear.
  const tumble = new THREE.Quaternion();
  const reach = new THREE.Vector3();

  /** Something in the air, that flies in and then off. */
  const flyingView = (item: Item, kind: FlyingKind): View => {
    const object = items.make(kind);
    const blob = groundShadow(shadow);
    // On a cliff's edge, what's in the air is over the drop, with no ground under it for a shadow.
    blob.visible = venue.ledge === undefined;
    scene.add(object, blob);
    // A skied ball gets materials of its own first, so the rainbow below glows on those.
    const dressing = isSkied(item) ? highBalls.dress(item, object) : twist.dress(item);
    // Footballs glow with a rainbow while the player's on a streak.
    const glow = isFootball(kind) ? rainbow.attach(object) : undefined;
    const motion = MOTION[kind];
    // Each tumbling thing turns about its own axis, so no two look alike.
    const axis = new THREE.Vector3(
      jitter(item, 5) - 0.5,
      jitter(item, 6) - 0.5,
      jitter(item, 7) - 0.5,
    ).normalize();
    const rate = 3 + jitter(item, 8) * 2.5;
    const phase = jitter(item, 9) * Math.PI * 2;
    const size = sizeOf(item);
    /** How high a jump had lifted the head when it arrived, kept as it flies off. */
    let liftOnArrival: number | undefined;

    return {
      update: (current, round) => {
        const now = round.now;
        const arrival = arrivalOf(current);
        const p = progressOf(current, now);
        const since = Math.max(0, (now - arrival) / 1000);
        const t = (now - current.launchedAt) / 1000;
        let position: THREE.Vector3;
        if (now < arrival) {
          // It homes in on the head as it comes down, even if the player has jumped.
          position = inFlight(current, p);
          position.y += liftAt(round, now) * THREE.MathUtils.smoothstep(p, 0.6, 1);
        } else {
          liftOnArrival ??= liftAt(round, arrival);
          position = afterwards(current, since);
          position.y += liftOnArrival;
        }
        // A twist can move it off its lane's path: blown, warped, swaying or dropping from above.
        const moved = dressing?.move?.(current, round, p, position);
        if (moved) position = moved.air;
        const ground = moved?.ground ?? position;

        object.position.copy(position);
        if (motion.kind === "spin") {
          object.rotation.set(t * 9, 0.4, 0);
        } else if (motion.kind === "twirl") {
          // Tipped a little towards the camera, so the crown and band both show.
          object.rotation.set(0.3, t * 5 + phase, Math.sin(t * 2 + phase) * 0.15);
        } else {
          object.rotation.set(
            Math.sin(t * 1.7 + phase) * 0.15,
            Math.sin(t * 3 + phase) * motion.turn,
            Math.sin(t * 2.2 + phase) * motion.rock,
          );
        }
        // Wings flap, flames flicker and so on.
        ANIMATE[kind]?.(object, t);
        // A decoy that hits the player is knocked tumbling.
        if (current.outcome === "hit") {
          object.quaternion.premultiply(tumble.setFromAxisAngle(axis, since * rate * 3));
        }
        // It pops into view as it's launched, and shrinks away once it's done.
        const grow = Math.min(1, p * 8);
        // A headed ball is gone in a third of a second, even where the screen is tall enough that
        // it hasn't left by then.
        // Anything that carries on past the player shrinks as it comes, rather than looming over
        // the screen on its way through the camera. A knocked decoy stays a moment to be seen.
        const shrink =
          current.outcome === "header"
            ? 1 - smooth01((since - 0.2) / 0.15)
            : current.outcome === "hit"
              ? 1 - smooth01((since - 0.4) / 0.3)
              : 1 - smooth01(since / 0.2);
        const scale = size * grow * shrink * fadeOnceDown(current, round);
        object.scale.setScalar(Math.max(scale, 0.0001));
        const shown = dressing?.update(current, round, object, position, scale) ?? SHOWN;
        object.visible = shown.show && scale > 0.001 && position.z < camera.position.z - 0.6;
        glow?.follow(position, scale, object.visible && shown.glow);

        blob.position.set(ground.x, 0.02, ground.z);
        const height = Math.max(0, position.y);
        blob.scale.setScalar(size * (1 + height * 0.08));
        // Shadows fade out as things come close, so none land at the player's feet.
        const near = THREE.MathUtils.clamp((-ground.z - 1) / 5, 0, 1);
        const fade =
          (current.outcome ? Math.max(0, 1 - since / 0.7) : Math.min(1, p * 6)) *
          fadeOnceDown(current, round);
        blob.material.opacity = Math.min(
          1,
          fade * near * Math.max(0.15, 1 - height / 8) * (shown.shadow ?? 1),
        );
      },
      dispose: () => {
        dressing?.dispose();
        scene.remove(object, blob);
        glow?.dispose();
        blob.geometry.dispose();
        blob.material.dispose();
      },
    };
  };

  /**
   * A frisbee skimmed in at Sunny Park, to be ducked (see isSkimmed). It covers every lane, so it
   * comes as a flight of frisbees, one down each, thrown like anything else but flat and low.
   * Ducked, they all fly on over; if not, the one in the player's lane catches them on the head.
   */
  const skimView = (item: Item): View => {
    // Each its own id, only so they don't all spin alike.
    const flight = LANES.map((lane) => ({
      lane,
      view: flyingView({ ...item, lane, id: item.id + lane / 4 }, "frisbee"),
    }));
    /** The lane the player was in when it reached them. */
    let caught: Lane | undefined;
    return {
      update: (current, round) => {
        if (current.outcome) caught ??= round.lane;
        for (const { lane, view } of flight) {
          // Only the one that reached the player's head is a knock; the rest carry on past.
          const knocked = current.outcome === "tripped" && lane === caught;
          const outcome = current.outcome && (knocked ? "hit" : "dodged");
          view.update({ ...current, lane, ...(outcome ? { outcome } : {}) }, round);
        }
      },
      dispose: () => {
        for (const { view } of flight) view.dispose();
      },
    };
  };

  /**
   * A hurdle, or whatever the venue has instead, sliding along its lanes to the player. Cleared or
   * stepped round, it carries on past them and out of view; tripped over, it stops where it is,
   * shows the trip its own way, and fades away.
   */
  const hurdleView = (item: Item): View => {
    const built = buildHurdle(venue.hurdle, item.lanes ?? LANES, STEP, sweptFrom(item));
    const hurdle = built.object;
    // With ghosts, to show it through the player. Its shadow's the soft one under it: only the
    // player casts one of their own (see look.ts).
    addGhosts(hurdle);
    const blob = groundShadow(shadow);
    blob.scale.set(built.shadow.width, built.shadow.depth, 1);
    scene.add(hurdle, blob);

    return {
      update: (current, round) => {
        const now = round.now;
        // A spear or a ninja's staff doesn't come along the ground: it comes in from the side, and
        // goes back out.
        if (built.thrust) {
          built.thrust(now - arrivalOf(current), current.outcome === "tripped");
          hurdle.visible = fadeOnceDown(current, round) > 0;
          blob.visible = false;
          return;
        }
        const speed = -LAUNCH.z / current.flightMs;
        const travelled = (now - current.launchedAt) * speed;
        const since = Math.max(0, now - arrivalOf(current));
        const tripped = current.outcome === "tripped";
        const z = tripped ? Math.min(LAUNCH.z + travelled, 0.25) : LAUNCH.z + travelled;
        hurdle.position.set(0, 0, z);
        built.trip(tripped ? Math.min(since / 180, 1) : 0);
        const fade = tripped
          ? Math.max(0, 1 - Math.max(0, since - 500) / 300)
          : fadeOnceDown(current, round);
        hurdle.scale.setScalar(Math.max(fade, 0.001));
        hurdle.visible = z < camera.position.z - 0.8 && fade > 0;
        blob.position.set(built.shadow.x, 0.02, z + built.shadow.z);
        blob.material.opacity = 0.45 * fade * Math.min(1, progressOf(current, now) * 4);
      },
      dispose: () => {
        scene.remove(hurdle, blob);
        hurdle.traverse((o) => {
          if ("geometry" in o && o.geometry instanceof THREE.BufferGeometry) o.geometry.dispose();
        });
        blob.geometry.dispose();
        blob.material.dispose();
      },
    };
  };

  const playerShadow = groundShadow(shadow);
  scene.add(playerShadow);

  // One of everything this venue throws, to compile its shaders before the first frame, so
  // nothing stutters the first time it flies in.
  let warmUp: THREE.Group | undefined = new THREE.Group();
  /** Whether the round's been let go of, so nothing more's drawn while it warms up. */
  let disposed = false;
  for (const kind of thrown) warmUp.add(items.make(kind));
  const warmHurdle = buildHurdle(venue.hurdle, LANES, STEP).object;
  addGhosts(warmHurdle);
  warmUp.add(warmHurdle);
  // And the twist's own: a UFO, a clump of snow, a portal. And a skied ball's, if there'll be any.
  for (const extra of twist.warmUp) warmUp.add(extra);
  if (skies(rules)) for (const extra of highBalls.warmUp) warmUp.add(extra);
  // And a football's rainbow, which starts hidden and so would be skipped, then stutter the first
  // time a streak lights it.
  const warmBall = items.make("ball");
  warmUp.add(warmBall);

  /**
   * Puts the warm-up's things in the scene, with a football's rainbow lit and the whole crowd out,
   * and returns what takes them away again.
   */
  const showWarmUp = (group: THREE.Group) => {
    const warmGlow = rainbow.attach(warmBall);
    rainbow.update(1, 0);
    warmGlow.follow(warmBall.position, 0.5, true);
    scene.add(group);
    crowd.update(0, 1, crowdCap);
    return () => {
      scene.remove(group);
      warmGlow.dispose();
      rainbow.update(0, 0);
      crowd.update(0, 1, 0);
    };
  };

  // With ?perf in the address, the scene's left where a profiler can find it, to time its parts.
  if (SHOW_PERF) Object.assign(window, { headsUp: { scene, camera, renderer } });

  return {
    canvas: renderer.domElement,

    prepare: async (progress = () => undefined) => {
      const group = warmUp;
      if (!group) return;
      warmUp = undefined;
      // The grass photos are laid over the pitch once they've loaded (see ./ground.ts), which
      // changes its shader, so they're waited for first. They're fetched on the title screen.
      await groundReady();
      progress(0.1);
      const hide = showWarmUp(group);
      try {
        // Compiles in parallel where the browser can (KHR_parallel_shader_compile), so the
        // loading screen keeps moving.
        await renderer.compileAsync(scene, camera);
        progress(0.7);
        // Every picture, even those on things not shown yet, so none uploads mid-round.
        for (const texture of texturesIn(scene)) renderer.initTexture(texture);
        progress(0.85);
        // Frames drawn in full behind the loading screen, with one of everything out, until they
        // come quickly. They compile the shadows' own shaders, which compiling the materials
        // doesn't reach, upload every shape, the crowd's included, and give a phone's driver the
        // real draws it finishes its shaders on. Without them, the round's first seconds crawl at
        // a few frames a second, which also steps the quality down (see ./quality.ts). Reading a
        // pixel back makes each frame wait for the GPU to finish it: a browser can otherwise leave
        // a hidden canvas's frames queued, undrawn, until the canvas shows, mid-round.
        const pixel = new Uint8Array(4);
        await settle(
          () => {
            renderer.render(scene, camera);
            const gl = renderer.getContext();
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          },
          () => disposed,
          (done) => progress(0.85 + 0.15 * done),
        );
      } finally {
        hide();
      }
      keepShaders(renderer);
      progress(1);
    },

    warm: () => {
      const group = warmUp;
      if (!group) return;
      warmUp = undefined;
      const hide = showWarmUp(group);
      // The browser compiles them while it gets on with other things, until something draws.
      renderer.compile(scene, camera);
      hide();
      keepShaders(renderer);
    },

    render: (round, events, dtMs) => {
      if (warmUp) {
        // Not prepared: compiles everything now, before the first frame.
        const hide = showWarmUp(warmUp);
        renderer.compile(scene, camera);
        hide();
        warmUp = undefined;
      }
      const dt = dtMs / 1000;
      seconds += dt;

      for (const event of events) {
        if (event.type === "header" || event.type === "cleared") crowd.cheer(seconds);
        if (event.type === "header") {
          headedAt = seconds;
          player.head();
        }
        if (event.type === "hit" || event.type === "tripped") hitAt = seconds;
        if (event.type === "tripped" && !toTheHead(event)) trippedAt = seconds;
        if ((event.type === "hit" || event.type === "tripped") && event.lives === 0) {
          topple = toppleFor(event);
          // Knocked back by a blow to the head, a player who can falls over by themselves. Over a
          // hurdle they're still pitched forwards.
          if (toTheHead(event) && player.falls) {
            fellTo = knockedTo(event.item) > 0 ? "right" : "left";
          }
        }
      }

      // The player steps across to their lane, and leans a little into it, quickly, so a move feels
      // instant but doesn't snap. Each step has a little hop in it. Once down, they stay where they
      // are and straighten up as they fall.
      const down = round.downAt !== undefined;
      if (!down && round.lane * STEP !== step.to) {
        // Facing the goal, the player's right is +X.
        player.step(round.lane * STEP > step.to ? "right" : "left");
        step = { from: across, to: round.lane * STEP };
      }
      across += (step.to - across) * Math.min(1, dt * 18);
      const stepped = step.to === step.from ? 1 : (across - step.from) / (step.to - step.from);
      const stepHop = Math.sin(THREE.MathUtils.clamp(stepped, 0, 1) * Math.PI) * 0.06;
      lean += ((down ? 0 : leanFor(round.lane)) - lean) * Math.min(1, dt * 22);
      const sinceHit = seconds - hitAt;
      const wobble = sinceHit < 0.5 ? Math.sin(sinceHit * 40) * 0.08 * (1 - sinceHit / 0.5) : 0;
      player.lean(lean + wobble);
      // A duck: the player's own crouch, or a bow from the waist and a crouch (see player.ts).
      player.duck(duckedAt(round));
      // A player animated in Mixamo plays its own steps, and its jump in time with the game's, and
      // falls over by itself when it's knocked out.
      player.jump(jumpProgress(round, round.now));
      if (fellTo && round.downAt !== undefined) {
        player.fall(fellTo, Math.max(0, round.now - round.downAt) / 1000);
      }
      player.update(dt);

      // Jumping, with a little hop into each header, and a crouch on landing that they rise out of
      // as they get their legs back, ready to jump again.
      const lift = liftAt(round, round.now);
      if (wasUp && lift === 0) landedAt = seconds;
      wasUp = lift > 0;
      const sinceHeader = seconds - headedAt;
      const hop = sinceHeader < 0.2 ? Math.sin((sinceHeader / 0.2) * Math.PI) * 0.06 : 0;
      // Toppled whole, unless they're falling over by themselves.
      const fallen = round.downAt === undefined || fellTo ? 0 : fallenAt(round.now - round.downAt);
      player.object.position.x = across;
      player.object.position.y = lift + hop + stepHop + fallen * LYING_LIFT;
      const sinceLanding = seconds - landedAt;
      const recovery = LANDING_MS / 1000;
      const squash =
        sinceLanding < 0.08
          ? (sinceLanding / 0.08) * 0.1
          : 0.1 * (1 - smooth01((sinceLanding - 0.08) / (recovery - 0.08)));
      player.object.scale.set(1 + squash / 2, 1 - squash, 1 + squash / 2);
      // A trip pitches the player forwards, then they right themselves, unless it was their last
      // life and they go on over. A knock to the head on their last life topples them too.
      const sinceTrip = seconds - trippedAt;
      const stumble = sinceTrip < 0.45 ? -Math.sin((sinceTrip / 0.45) * Math.PI) * 0.3 : 0;
      player.object.rotation.x = Math.min(stumble, topple.x * fallen);
      player.object.rotation.z = topple.z * fallen;
      // The sun casts the player's shadow (see ./look.ts); this is the soft dark where they stand,
      // out of the sky's light, which stretches out along the ground under them as they fall.
      // Where the sun casts none, on a phone that can't spare it, it's bigger and darker.
      const blob = scenery.lights.key.castShadow ? 1 : 1.3;
      reach.set(0, PLAYER_HEIGHT, 0).applyEuler(player.object.rotation);
      playerShadow.position.set(across + reach.x / 2, 0.02, reach.z / 2);
      playerShadow.scale.set(
        (0.75 - lift * 0.3) * blob + Math.abs(reach.x) * 0.8,
        (0.42 - lift * 0.2) * blob + Math.abs(reach.z) * 0.8,
        1,
      );
      playerShadow.material.opacity = Math.max(0, 0.42 * blob - lift * 0.5);

      // The glow eases in as a streak builds, and fades when it's lost.
      streakGlow += (glowFor(round.streak) - streakGlow) * Math.min(1, dt * 4);
      rainbow.update(streakGlow, seconds);

      const live = new Set<number>();
      for (const item of round.items) {
        live.add(item.id);
        let view = views.get(item.id);
        if (!view) {
          view =
            item.kind !== "hurdle"
              ? flyingView(item, item.kind)
              : isSkimmed(item)
                ? skimView(item)
                : hurdleView(item);
          views.set(item.id, view);
        }
        view.update(item, round);
      }
      for (const [id, view] of views) {
        if (!live.has(id)) {
          view.dispose();
          views.delete(id);
        }
      }

      crowd.update(seconds, dt, Math.min(crowdFor(round.streak), crowdCap));
      scenery.update(seconds, dt);
      twist.update(round, seconds, dt);

      // Knocked back by themselves, the player's followed down: the camera eases back to see them
      // lying there, or for a player who's asked for less motion, cuts to it.
      const pulled =
        fellTo && round.downAt !== undefined
          ? calm
            ? 1
            : smooth01((round.now - round.downAt) / KNOCKED_OUT.ms)
          : 0;
      camera.position.lerpVectors(CAMERA.position, KNOCKED_OUT.position, pulled);
      camera.position.x += across * CAMERA.follow;
      if (pulled > 0) {
        aim.lerpVectors(CAMERA.target, KNOCKED_OUT.target, pulled);
        aim.x += across * CAMERA.follow;
        camera.lookAt(aim);
      } else camera.quaternion.copy(level);
      // At the Leaning Tower, the screen leans over, turning about the middle of it.
      const leaning = twist.lean?.(round) ?? 0;
      if (leaning !== 0) camera.rotateZ(leaning);
      // A knock from a decoy, or a trip, shakes the camera.
      if (sinceHit < 0.3 && !calm) {
        const shake = 0.05 * (1 - sinceHit / 0.3);
        camera.position.x += Math.sin(sinceHit * 90) * shake;
        camera.position.y += Math.cos(sinceHit * 70) * shake;
      }
      renderer.render(scene, camera);
    },

    resize: (width, height) => {
      // A window filling a laptop's screen draws fewer pixels to each of its own, so a frame costs
      // no more than PIXEL_BUDGET. A phone's is well within it, so it's drawn as it always was.
      renderer.setPixelRatio(
        Math.min(pixelRatio, Math.sqrt(PIXEL_BUDGET / Math.max(1, width * height))),
      );
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = fovFor(camera.aspect);
      camera.updateProjectionMatrix();
      crowd.layout(camera);
    },

    dispose: () => {
      // Frees what's on the GPU: shapes, pictures and shadow maps. The renderer carries on to the
      // next round, keeping the shaders this one compiled (see ./renderer.ts). The player model is
      // shared with the next game too, but three uploads it again when that game first draws it.
      disposed = true;
      keepShaders(renderer);
      for (const view of views.values()) view.dispose();
      views.clear();
      twist.dispose();
      highBalls.dispose();
      items.dispose();
      rainbow.dispose();
      room.dispose();
      scenery.dispose();
      warmHurdle.traverse((o) => {
        if ("geometry" in o && o.geometry instanceof THREE.BufferGeometry) o.geometry.dispose();
      });
      // The player model's own pictures stay, since every round wears them.
      freeScene(scene, model && texturesIn(model));
      if (owned) renderer.dispose();
    },
  };
};
