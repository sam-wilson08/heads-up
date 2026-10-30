import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { GoalStyle, Venue, VenueId } from "../venues";
import { BACKDROP_Z, backdropReady, buildBackdrop, pictureColours } from "./backdrop";
import { buildGround, GOAL_WIDTH, GOAL_Z, grassOverFloor, PITCH_FRONT } from "./ground";
import { type Lights, lightVenue, lookOf, venueEnvironment } from "./look";
import { dragonReady } from "./props/dragon";
import { venueLife } from "./props/life";
import { hasVenueProp, placedProps, venuePropReady } from "./props/models";
import { sharkReady } from "./props/shark";
import { buildSky, skyDome } from "./sky";
import { glowTexture, NET_TILE, netTexture } from "./textures";

// Everything around the player: the ground, the goal, the venue's backdrop, which is its sky and
// everything round the pitch that stays put, painted as one picture (see ./backdrop.ts), and in
// front of that what moves or what the twist needs. (The crowd is in ./crowd.) Units are metres.
// The player stands on the origin facing down -Z, towards the goal.

const GOAL_HEIGHT = 2.44;
const POST_RADIUS = 0.06;
/**
 * How far back the net goes behind the line: along the top, where supports run back from the tops
 * of the posts, and along the ground, where they come down to meet it.
 */
const NET = { top: 0.9, bottom: 2 };
/** How long each side of a hexagon in the net's mesh is, which makes them 14 cm across. */
const NET_HEX = 0.07;

/** Scenery that moves: drifting clouds, falling snow and so on. */
export interface Scenery {
  readonly object: THREE.Object3D;
  update(seconds: number, dt: number): void;
}

/** A bar of the goal's frame, from one point to another. */
const tube = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 12),
    material,
  );
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
};

/**
 * A sheet of net bent into shape: `at(u, v)` gives where each point of it goes, for u and v from 0
 * to 1, and how far it is across and along the net in metres, so the mesh keeps its size however
 * the sheet is stretched.
 */
const netSheet = (
  columns: number,
  rows: number,
  at: (u: number, v: number) => { point: THREE.Vector3; across: number; along: number },
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const { point, across, along } = at(column / columns, row / rows);
      positions.push(point.x, point.y, point.z);
      uvs.push(across / (NET_HEX * NET_TILE.across), along / (NET_HEX * NET_TILE.down));
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/** A soft-edged dark patch on the ground, for the shade under the net. */
const shadeTexture = () => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(size, size);
    const edge = (t: number) => THREE.MathUtils.smoothstep(Math.min(t, 1 - t), 0, 0.3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const shade = Math.round(255 * edge((x + 0.5) / size) * edge((y + 0.5) / size));
        image.data.set([shade, shade, shade, 255], (y * size + x) * 4);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  return new THREE.CanvasTexture(canvas);
};

/** White posts and a white net: the goal at any venue without one of its own. */
const CLASSIC_GOAL: GoalStyle = {
  frame: "#ffffff",
  finish: "paint",
  supports: "#e4e7eb",
  net: "#f6f6f2",
};

/** The goal frame's surface: painted, bare metal or rough. A glowing one lights itself. */
const frameMaterial = (colour: string, finish: GoalStyle["finish"], glow = false) =>
  new THREE.MeshStandardMaterial({
    color: colour,
    roughness: finish === "metal" ? 0.3 : finish === "paint" ? 0.5 : 0.9,
    metalness: finish === "metal" ? 0.6 : 0,
    emissive: glow ? colour : "#000000",
    emissiveIntensity: glow ? 0.9 : 0,
  });

/**
 * The shapes in a group merged into one mesh for each material, each in place, so a goal with
 * dozens of bands round its posts is still only a few draw calls, in its shadow as in the picture.
 */
const mergeByMaterial = (group: THREE.Group): THREE.Group => {
  group.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    const shapes = byMaterial.get(mesh.material) ?? [];
    shapes.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    byMaterial.set(mesh.material, shapes);
  });
  const merged = new THREE.Group();
  for (const [material, shapes] of byMaterial) {
    merged.add(new THREE.Mesh(mergeGeometries(shapes), material));
    for (const shape of shapes) shape.dispose();
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose();
  });
  return merged;
};

/**
 * The goal: posts and bar, with supports running back from the tops of the posts and down to the
 * ground, and the net hung from them. The net is a fine mesh of hexagons that, from the far end of
 * the pitch, shows as a veil, and where it isn't held by the frame it hangs loose: the top sags and
 * the back bellies out. Each venue can dress it in its own style.
 */
const goal = (anisotropy: number, style: GoalStyle): THREE.Object3D => {
  const group = new THREE.Group();
  const white = frameMaterial(style.frame, style.finish, style.glow === "all");
  const half = GOAL_WIDTH / 2;
  const post = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HEIGHT, 16);
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(post, white);
    upright.position.set(side * half, GOAL_HEIGHT / 2, 0);
    group.add(upright);
  }
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_WIDTH + POST_RADIUS * 2, 16),
    white,
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.y = GOAL_HEIGHT;
  group.add(bar);

  // Rings round the posts and along the bar.
  if (style.bands) {
    const { colour, every, width, glow } = style.bands;
    const material = frameMaterial(colour, style.finish, glow);
    const ring = new THREE.CylinderGeometry(POST_RADIUS * 1.06, POST_RADIUS * 1.06, width, 16);
    for (const side of [-1, 1]) {
      for (let y = every / 2; y < GOAL_HEIGHT - width; y += every) {
        const band = new THREE.Mesh(ring, material);
        band.position.set(side * half, y, 0);
        group.add(band);
      }
    }
    for (let x = -half + every / 2; x < half; x += every) {
      const band = new THREE.Mesh(ring, material);
      band.rotation.z = Math.PI / 2;
      band.position.set(x, GOAL_HEIGHT, 0);
      group.add(band);
    }
  }

  // Snow lying along the top of the bar, and banked round the feet of the posts.
  if (style.snow) {
    const snow = new THREE.MeshStandardMaterial({ color: "#fbfdff", roughness: 0.9 });
    const drift = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, GOAL_WIDTH + 0.06, 4, 12), snow);
    drift.rotation.z = Math.PI / 2;
    drift.scale.set(0.6, 1, 1.1);
    drift.position.y = GOAL_HEIGHT + 0.05;
    group.add(drift);
    const mound = new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(mound, snow);
      bank.position.set(side * half, 0, 0);
      bank.scale.set(1, 0.45, 1);
      group.add(bank);
    }
  }

  // The supports, thinner than the posts, and the bars along the ground that peg the net down.
  const support = frameMaterial(style.supports ?? style.frame, style.finish, style.glow === "all");
  const corner = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const side of [-1, 1]) {
    const x = side * half;
    group.add(
      tube(corner(x, GOAL_HEIGHT, 0), corner(x, GOAL_HEIGHT, -NET.top), 0.025, support),
      tube(corner(x, GOAL_HEIGHT, -NET.top), corner(x, 0, -NET.bottom), 0.025, support),
      tube(corner(x, 0.02, 0), corner(x, 0.02, -NET.bottom), 0.02, support),
    );
  }
  group.add(tube(corner(-half, 0.02, -NET.bottom), corner(half, 0.02, -NET.bottom), 0.02, support));

  const texture = netTexture();
  texture.anisotropy = anisotropy;
  // The net takes the venue's colour; the texture only says where the cords are.
  const cord = new THREE.MeshStandardMaterial({
    roughness: 0.85,
    color: style.net,
    emissive: style.glow ? style.net : "#000000",
    emissiveIntensity: style.glow ? 0.8 : 0,
    alphaMap: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // The roof and back as one sheet, following the frame's outline from the bar back along the
  // top, then down to the ground behind. Away from the frame at the sides it hangs looser.
  const slope = Math.hypot(NET.bottom - NET.top, GOAL_HEIGHT);
  const length = NET.top + slope;
  const outline = (along: number) => {
    if (along < NET.top) return { y: GOAL_HEIGHT, z: -along };
    const down = (along - NET.top) / slope;
    return { y: GOAL_HEIGHT * (1 - down), z: -NET.top - (NET.bottom - NET.top) * down };
  };
  const main = netSheet(28, 24, (u, v) => {
    const along = v * length;
    const { y, z } = outline(along);
    const loose = Math.sin(Math.PI * u);
    const sag = 0.3 * loose * Math.sin(Math.PI * Math.min(along / 1.8, 1));
    const belly = 0.3 * loose * Math.sin((Math.PI * along) / length);
    return {
      point: new THREE.Vector3((u * 2 - 1) * half, y - sag, z - belly),
      across: u * GOAL_WIDTH,
      along,
    };
  });
  group.add(new THREE.Mesh(main, cord));

  // The sides fill the frame's outline, bulging out a little in the middle.
  for (const side of [-1, 1]) {
    const wall = netSheet(10, 12, (u, v) => {
      const y = v * GOAL_HEIGHT;
      const z = -u * (NET.bottom - (NET.bottom - NET.top) * v);
      const bulge = 0.06 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      return { point: new THREE.Vector3(side * (half + bulge), y, z), across: -z, along: y };
    });
    group.add(new THREE.Mesh(wall, cord));
  }

  // The grass under the net is a little shaded by it.
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL_WIDTH + 0.6, NET.bottom + 0.6),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: shadeTexture(),
      transparent: true,
      // A glowing net throws less shade.
      opacity: style.glow ? 0.1 : 0.22,
      depthWrite: false,
    }),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.set(0, 0.01, -NET.bottom / 2);
  group.add(shade);

  // Its shadow on the grass is painted into the pitch (see ./ground.ts), since it never moves.
  const merged = mergeByMaterial(group);
  merged.position.z = GOAL_Z;
  return merged;
};

/**
 * Particles drifting through the air in front of the goal: snow falls, bubbles and embers rise.
 * They wrap round when they leave the box they live in.
 */
const drift = (count: number, colour: number, size: number, velocity: number): Scenery => {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (((i * 37) % 100) / 100) * 16 - 8;
    positions[i * 3 + 1] = (((i * 61) % 100) / 100) * 12;
    positions[i * 3 + 2] = -2 - (((i * 23) % 100) / 100) * 30;
  }
  const attribute = new THREE.BufferAttribute(positions, 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", attribute);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: colour,
      size,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
    }),
  );
  return {
    object: points,
    update: (seconds, dt) => {
      for (let i = 0; i < count; i++) {
        let y = (positions[i * 3 + 1] ?? 0) + velocity * dt;
        if (y < 0) y += 12;
        if (y > 12) y -= 12;
        positions[i * 3 + 1] = y;
        positions[i * 3] = (positions[i * 3] ?? 0) + Math.sin(seconds + i) * dt * 0.3;
      }
      attribute.needsUpdate = true;
    },
  };
};

/**
 * Craters dotted over the ground, for the Moon and Mars: a darker floor, `colour`, ringed by a low
 * rim thrown up round it, lit paler where it faces the sun. Only those from `near` to `far` metres
 * down the pitch (both negative, towards the goal) are made: those over the pitch are drawn live,
 * and those beyond it are painted into the backdrop. Every crater's floor is one shape, and every
 * rim another.
 */
export const craters = (
  colour: number,
  count: number,
  near: number,
  far: number,
): THREE.Object3D => {
  const group = new THREE.Group();
  const floors: THREE.BufferGeometry[] = [];
  const rims: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const [x, z] = [side * (2.5 + ((i * 13) % 10)), -4 - ((i * 29) % 60)];
    if (z > near || z <= far) continue;
    const size = 0.6 + (i % 4) * 0.5;
    // Flattened along the pitch, and the rim flattened so it's a low bank rather than a tyre.
    floors.push(
      new THREE.CircleGeometry(size, 24)
        .rotateX(-Math.PI / 2)
        .scale(1, 1, 0.7)
        .translate(x, 0.01, z),
    );
    rims.push(
      new THREE.TorusGeometry(size, 0.1 + (i % 4) * 0.03, 6, 32)
        .scale(1, 1, 0.4)
        .rotateX(-Math.PI / 2)
        .scale(1, 1, 0.7)
        .translate(x, 0, z),
    );
  }
  if (floors.length === 0) return group;
  group.add(
    new THREE.Mesh(
      mergeGeometries(floors),
      new THREE.MeshStandardMaterial({ color: colour, roughness: 1 }),
    ),
    new THREE.Mesh(
      mergeGeometries(rims),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(colour).lerp(new THREE.Color(0xffffff), 0.3),
        roughness: 1,
      }),
    ),
  );
  for (const shape of [...floors, ...rims]) shape.dispose();
  return group;
};

const group = (...parts: (THREE.Object3D | Scenery)[]): Scenery => {
  const object = new THREE.Group();
  const moving: Scenery[] = [];
  for (const part of parts) {
    if (part instanceof THREE.Object3D) object.add(part);
    else {
      object.add(part.object);
      moving.push(part);
    }
  }
  return {
    object,
    update: (seconds, dt) => {
      for (const part of moving) part.update(seconds, dt);
    },
  };
};

/** Builds a venue's extras, once the props they're made of have loaded. */
type Dress = (venue: Venue) => Scenery;

/**
 * What each venue has round the pitch that moves, or that the twist needs, drawn live in front of
 * its backdrop (see ./backdrop.ts): the castle's candles, the emperor, the reef, the shark, snow
 * falling. Everything else round the pitch is in the backdrop. Each venue loads the props it needs
 * only when it's played or pictured.
 */
const DRESSING: Record<VenueId, () => Promise<Dress>> = {
  park: () => Promise.resolve(() => group()),
  beach: async () => {
    const { BEACH_PALMS, palms } = await import("./props/palms");
    // These palms stand in for Meshy's, where its haven't been built (see ./props/models.ts).
    return () => group(...(hasVenueProp("beach") ? [] : [palms(BEACH_PALMS)]));
  },
  snow: () => Promise.resolve(() => group(drift(220, 0xffffff, 0.12, -1.2))),
  moon: () => Promise.resolve(() => group(craters(0x8a8a8a, 18, 0, BACKDROP_Z))),
  underwater: async () => {
    // And the shark, which the twist swims across the pitch (see twists/underwater.ts).
    const [{ octopus, reef }, { rippleLight }] = await Promise.all([
      import("./props/reef"),
      import("./props/seabed"),
      sharkReady(),
    ]);
    return () =>
      group(
        drift(120, 0xc8f4ff, 0.14, 1.4),
        reef(),
        octopus(),
        rippleLight(PITCH_FRONT, BACKDROP_Z),
      );
  },
  volcano: () => Promise.resolve(() => group(drift(140, 0xff7a1a, 0.12, 1.8))),
  mars: () => Promise.resolve(() => group(craters(0x8f3d1f, 18, 0, BACKDROP_Z))),
  space: () => Promise.resolve(() => group()),
  // The trampolines are the twist's own (see twists/funfair.ts).
  funfair: async () => {
    const { funfairLive } = await import("./props/funfair");
    return () => group(funfairLive());
  },
  castle: async () => {
    const { castleLive } = await import("./props/castle");
    return () => group(castleLive());
  },
  final: async () => {
    const { cupFinalLive } = await import("./props/cupfinal");
    return () => group(cupFinalLive());
  },
  colosseum: async () => {
    const { colosseum } = await import("./props/colosseum");
    return () => colosseum();
  },
  // The tower's in the backdrop's picture.
  pisa: () => Promise.resolve(() => group()),
  // As are Fuji and the cherry trees, which sway in it (see twists/sakura.ts). The dragon, which
  // the twist flies over, is Meshy's if it's been built (see twists/dragon.ts).
  fuji: async () => {
    await dragonReady();
    return () => group();
  },
};

/** The venues' dressings that have loaded, and those loading. */
const dressings = new Map<VenueId, Dress>();
const loading = new Map<VenueId, Promise<void>>();

/**
 * Loads what a venue's dressed in, once. Build its scenery only once this has resolved: the
 * twists find their venue's props as the round's built, the castle's candles among them. If it can't load, it can be asked again.
 */
export const sceneryReady = (venue: VenueId): Promise<void> => {
  let pending = loading.get(venue);
  if (!pending) {
    pending = Promise.all([DRESSING[venue](), backdropReady(venue), venuePropReady(venue)]).then(
      ([dress]) => {
        // The venue's Meshy prop, where it has one, stands with the rest (see ./props/models.ts),
        // and its life moves in front of its backdrop (see ./props/life.ts).
        dressings.set(venue, (v) => {
          const props = placedProps(v.id);
          return group(dress(v), ...(props ? [props] : []), venueLife(v.id));
        });
      },
      (error: unknown) => {
        loading.delete(venue);
        throw error;
      },
    );
    loading.set(venue, pending);
  }
  return pending;
};

/**
 * A venue's extras: built now if they've loaded, or else an empty group they're added to when
 * they do, for whatever was built without waiting.
 */
const extras = (venue: Venue): Scenery => {
  const dress = dressings.get(venue.id);
  if (dress) return dress(venue);
  const object = new THREE.Group();
  let late: Scenery | undefined;
  sceneryReady(venue.id)
    .then(() => {
      late = dressings.get(venue.id)?.(venue);
      if (late) object.add(late.object);
    })
    .catch((error: unknown) => {
      console.warn(`Couldn't load ${venue.name}'s scenery, so it's bare`, error);
    });
  return { object, update: (seconds, dt) => late?.update(seconds, dt) };
};

/** A venue, built: what needs moving each frame, its lights, and what to free once it's done. */
export interface BuiltScenery extends Scenery {
  readonly lights: Lights;
  dispose(): void;
}

/**
 * Builds the venue around the player: its ground, goal, backdrop and extras, its lights and haze,
 * and its surroundings as the light that shiny things reflect (see ./look.ts). Returns what needs
 * moving each frame. Without `bake`, for a phone that can't spare it (see ./quality.ts), there's
 * no baked light from the surroundings, and the sky's light all round makes up for it. A venue
 * without a backdrop picture has its sky drawn instead, over ground that runs to the horizon.
 */
export const buildScenery = (
  venue: Venue,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  bake = true,
): BuiltScenery => {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  // With a backdrop picture, the venue as its picture has it: the sky, the horizon's haze and the
  // ground the colours they are in it, so what shines reflects the picture's surroundings, and the
  // light and haze are its colours too (see ./look.ts).
  const picture = pictureColours(venue.id);
  const hex = (colour: THREE.Color) => `#${colour.getHexString(THREE.SRGBColorSpace)}`;
  const seen: Venue = picture
    ? {
        ...venue,
        sky: [hex(picture.sky), hex(picture.horizon)],
        haze: hex(picture.horizon),
        surround: hex(picture.ground),
      }
    : venue;
  // Past a backdrop picture there's only what a leaning screen swings into view at its top corners
  // (see twists/pisa.ts): the picture's own sky, carried on.
  scene.background = picture ? picture.sky.clone() : new THREE.Color(seen.haze);
  const lights = lightVenue(venue, scene, true, picture);
  const look = lookOf(venue.id);
  let environment: THREE.WebGLRenderTarget | undefined;
  if (bake) {
    const lighting = skyDome(seen);
    environment = venueEnvironment(renderer, seen, lighting);
    lighting.geometry.dispose();
    (lighting.material as THREE.Material).dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = look.environment;
  } else {
    lights.fill.intensity += look.environment * 0.6;
  }
  const backdrop = buildBackdrop(venue, anisotropy);
  if (backdrop) grassOverFloor(backdrop, venue, anisotropy);
  const sky = backdrop ? undefined : buildSky(venue);
  const parts = group(
    buildGround(venue, anisotropy, backdrop ? "near" : "all"),
    ...(venue.goal === false ? [] : [goal(anisotropy, venue.goal ?? CLASSIC_GOAL)]),
    backdrop ?? { object: sky?.object ?? new THREE.Group(), update: (_, dt) => sky?.update(dt) },
    extras(venue),
  );
  scene.add(parts.object);
  return { ...parts, lights, dispose: () => environment?.dispose() };
};
