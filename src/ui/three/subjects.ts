import * as THREE from "three";
import { BACKDROP_Z } from "../../game/backdrop";
import { buildCrowd } from "../../game/crowd";
import { lookOf, TONE_MAPPING } from "../../game/look";
import { itemFactory } from "../../game/objects";
import { buildPlayer, loadPlayerModel, PLAYER_HEIGHT, type Player } from "../../game/player";
import { buildScenery, sceneryReady } from "../../game/scenery";
import { shadowTexture } from "../../game/textures";
import type { Kit } from "../../kits";
import type { Venue } from "../../venues";
import { freeShot, studio, studioEnvironment, type Shot } from "./studio";

// What the menus show in 3D, set up to be pictured: the ball, the player in a kit, and a venue as
// the game draws it. Each is built from the game's own pieces, so it looks just as it will in play.

/** Lit like a photo studio: a soft light all round, a key light and a cool light from behind. */
export const studioLights = (scene: THREE.Scene, rim: THREE.ColorRepresentation = 0x9fc4ff) => {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a66, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(-2, 3, 4);
  const back = new THREE.DirectionalLight(rim, 2.2);
  back.position.set(3, 2, -4);
  scene.add(key, back);
};

let ball: { object: THREE.Object3D; free(): void } | undefined;

/** The football, as it flies at the player, 1 m across. One is made and kept, for every picture. */
export const football = (golden = false): THREE.Object3D | undefined => {
  const environment = studioEnvironment();
  if (!environment) return undefined;
  if (!ball) {
    const items = itemFactory(environment);
    ball = { object: items.make("ball"), free: items.dispose };
  }
  if (!golden) return ball.object.clone();
  return itemFactory(environment).make("golden");
};

/** The ball on the title screen, spinning in the sun. */
export const titleBall = (): (Shot & { spin(seconds: number): void }) | undefined => {
  const object = football();
  if (!object) return undefined;
  const scene = new THREE.Scene();
  studioLights(scene, 0xffe6b0);
  scene.add(object);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  camera.position.set(0, 0, 2.05);
  return {
    scene,
    camera,
    spin: (seconds) => {
      // Tipped forward a little, as if it's been headed.
      object.rotation.set(seconds * 1.6, 0.5, 0.25);
    },
  };
};

/** The player in a kit, with their name and number on the back. */
export const dressedPlayer = async (kit: Kit, name: string, number: number): Promise<Player> =>
  buildPlayer(await loadPlayerModel(), name, number, kit);

/** How far into their idle the player stands for a still picture: at ease, not in the model's T. */
const STANDING = 0.6;

/** A soft shadow on the floor, for something standing on the origin. */
export const floorShadow = (width: number) => {
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * 0.6),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.005;
  return blob;
};

/**
 * The player in a kit, full length, seen from the front and a little to one side, as a picture
 * for the kit to choose. `aspect` is its width over its height.
 */
export const kitShot = async (
  kit: Kit,
  name: string,
  number: number,
  aspect: number,
): Promise<Shot> => {
  const player = await dressedPlayer(kit, name, number);
  player.update(STANDING);
  const scene = new THREE.Scene();
  studioLights(scene);
  scene.add(player.object, floorShadow(1.1));
  // The player faces the goal, down -Z, so the camera's out that way to see their front.
  const camera = new THREE.PerspectiveCamera(26, aspect, 0.1, 20);
  camera.position.set(-1.6, 1.25, -4);
  camera.lookAt(0, 0.92, 0);
  return { scene, camera, dispose: () => freeShot(scene) };
};

/** A moving picture of the player: a shot that moves on, `seconds` in and `dt` since its last. */
export interface PlayerShow extends Shot {
  update(seconds: number, dt: number): void;
}

/**
 * Keepy-ups on the head: how long the ball takes from one header to the next, in seconds, how high
 * it goes, in metres above the head, and how long before it lands the header starts, so the head
 * meets it. The ball is a real one's size.
 */
const KEEPY_UPS = { every: 1.15, high: 0.6, lead: 0.24, ball: 0.22 } as const;
/** Where the top of the forehead is from the head's bone, in metres: up, and forward. */
const HEAD_TOP = { up: 0.17, forward: 0.06 } as const;
/** How fast the player keeping the ball up turns round, in radians a second. */
const TURN = 0.3;

/** The point a camera looks at, and how far back it stands, to fit a box from `low` to `high`. */
const framing = (
  fov: number,
  aspect: number,
  low: number,
  high: number,
  wide: number,
): { y: number; distance: number } => {
  const half = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const distance = Math.max((high - low) / 2 / half, wide / 2 / (half * aspect)) * 1.08;
  return { y: (low + high) / 2, distance };
};

/**
 * The player in their kit, moving. `keepy-ups` is all of them, keeping the ball up on their head
 * and slowly turning round, so their name and number come by; `back` is their back from the waist
 * up, idling, to read the name and number. `aspect` is its width over its height. Still if `calm`:
 * for a player who's asked for less motion, the ball sits at their feet.
 */
export const playerShow = async (
  kit: Kit,
  name: string,
  number: number,
  aspect: number,
  view: "keepy-ups" | "back",
  calm: boolean,
): Promise<PlayerShow> => {
  const player = await dressedPlayer(kit, name, number);
  player.update(STANDING);
  const scene = new THREE.Scene();
  studioLights(scene);
  scene.add(player.object, floorShadow(1.1));
  const fov = 26;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 30);
  let head: THREE.Object3D | undefined;
  player.object.traverse((o) => {
    if (o instanceof THREE.Bone && o.name.endsWith("Head")) head = o;
  });

  if (view === "back") {
    // From behind, down +Z, a little to one side, on the shirt from the waist to the top of the
    // head. However tall the picture, the head's near its top, and any more room shows more of
    // the player below.
    const { distance } = framing(fov, aspect, 0.85, 1.9, 0.9);
    const y = 1.9 - Math.tan(THREE.MathUtils.degToRad(fov / 2)) * distance;
    camera.position.set(distance * 0.28, y + 0.08, distance);
    camera.lookAt(0, y, 0);
    return {
      scene,
      camera,
      update: (seconds, dt) => {
        player.update(dt);
        // Shifting their weight a little, as anyone stood waiting does.
        player.object.rotation.y = calm ? 0 : Math.sin(seconds * 0.6) * 0.12;
      },
      dispose: () => freeShot(scene),
    };
  }

  // All of them, and the ball at the top of its flight.
  const ball = football();
  ball?.scale.setScalar(KEEPY_UPS.ball);
  if (ball) scene.add(ball);
  const top = PLAYER_HEIGHT + KEEPY_UPS.high + KEEPY_UPS.ball;
  const { y, distance } = framing(fov, aspect, -0.05, top, 1.2);
  camera.position.set(0, y + 0.2, -distance);
  camera.lookAt(0, y, 0);
  const crown = new THREE.Vector3();
  /** Which header's next, counting from the first. */
  let next = 0;
  return {
    scene,
    camera,
    update: (seconds, dt) => {
      if (calm || !ball || !head) {
        player.update(dt);
        ball?.position.set(0.28, KEEPY_UPS.ball / 2, -0.25);
        return;
      }
      // Each header's started just before the ball comes down, to meet it.
      const landing = (next + 1) * KEEPY_UPS.every;
      if (seconds >= landing - KEEPY_UPS.lead) {
        player.head();
        next = Math.floor((seconds + KEEPY_UPS.lead) / KEEPY_UPS.every);
      }
      const turn = seconds * TURN;
      player.object.rotation.y = turn;
      player.update(dt);
      player.object.updateMatrixWorld(true);
      head.getWorldPosition(crown);
      // Up off the forehead and back down onto it, wherever it is, spinning as it goes. They
      // face down -Z before they turn.
      const u = (seconds / KEEPY_UPS.every) % 1;
      ball.position.set(
        crown.x - Math.sin(turn) * HEAD_TOP.forward,
        crown.y + HEAD_TOP.up + KEEPY_UPS.ball / 2 + KEEPY_UPS.high * 4 * u * (1 - u),
        crown.z - Math.cos(turn) * HEAD_TOP.forward,
      );
      ball.rotation.x -= dt * 5;
    },
    dispose: () => {
      // The ball's shape and picture are the one kept for every picture, so they stay.
      if (ball) scene.remove(ball);
      freeShot(scene);
    },
  };
};

/** How long a venue's sky and scenery have been going, in its pictures: clouds drift, palms sway. */
const SCENERY_SECONDS = 14;

/** Waits until the pitch's grass photos have been laid over it, or a second and a half. */
const pitchReady = (scene: THREE.Scene) =>
  new Promise<void>((resolve) => {
    const started = performance.now();
    const check = () => {
      const materials: unknown[] = [];
      scene.traverse((o) => {
        if ("material" in o) materials.push(o.material);
      });
      const ready = materials.some(
        (m) => m instanceof THREE.MeshStandardMaterial && m.normalMap !== null,
      );
      if (ready || performance.now() - started > 1500) resolve();
      else setTimeout(check, 50);
    };
    check();
  });

/** How far either side of the middle every venue's backdrop picture reaches, in metres. */
const PICTURE_REACH = 17;

/**
 * A venue as the game shows it, seen from just behind where the player stands, looking down the
 * pitch to the goal with its sky and scenery round it. A few of its crowd,
 * in the player's kit, watch from the sides. `aspect` is its width over its height.
 */
export const venueScene = async (venue: Venue, kit: Kit, aspect: number): Promise<Shot> => {
  const scene = new THREE.Scene();
  const r = studio();
  if (!r) throw new Error("No WebGL for the venue's picture");
  await sceneryReady(venue.id);
  const scenery = buildScenery(venue, scene, r);
  // Level, so the sky over the goal shows. A wide picture's view is narrower than the game's, so
  // the goal and what's round it fill it, and never wider than the venue's backdrop picture, which
  // reaches about 17 m either side of the middle (see game/backdrop.ts); a very wide one, like the
  // home screen's, is narrower still. Either way its top stays within the backdrop's card.
  const across = Math.atan(PICTURE_REACH / (3 - BACKDROP_Z));
  const fov = Math.min(
    aspect > 1 ? 34 : 38,
    THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(across) / aspect)),
  );
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 400);
  camera.position.set(0, 1.7, 3);
  camera.lookAt(0, aspect > 1 ? 2.4 : 1.6, -40);
  const crowd = buildCrowd(venue.crowd, kit);
  scene.add(crowd.object);
  crowd.layout(camera);
  // Twice, since they grow into place, and once more to strike a pose.
  crowd.update(SCENERY_SECONDS, 1, 10);
  crowd.update(SCENERY_SECONDS, 1, 10);
  scenery.update(SCENERY_SECONDS, 0.016);
  await pitchReady(scene);
  return {
    scene,
    camera,
    // Through the venue's own tone mapping and exposure, as the game draws it.
    look: { toneMapping: TONE_MAPPING, exposure: lookOf(venue.id).exposure },
    dispose: () => {
      scenery.dispose();
      freeShot(scene);
    },
  };
};

/** Lets go of the ball kept for pictures. */
export const freeBall = () => {
  ball?.free();
  ball = undefined;
};
