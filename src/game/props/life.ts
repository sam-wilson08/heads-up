import * as THREE from "three";
import type { VenueId } from "../../venues";
import { BACKDROP_Z, EYE } from "../backdrop";
import type { Scenery } from "../scenery";

// Life in front of each venue's backdrop, so the picture behind the goal doesn't look still: birds
// and bats crossing its sky, gulls gliding, a school of fish, saucers, satellites and drones,
// balloons floating up, and camera flashes in the stands. Each kind is one draw call: its copies
// share one small shape, drawn together, each moved every frame, and their wings (or tails) beat
// in the vertex shader, each in its own time. They keep to the sky and the far end, between the
// crowd and the backdrop, and away from the lanes, and low enough in the sky that the score and
// the lives at the top of the screen don't hide them. Units are metres; the goal is down -Z, 30 m
// away, and the backdrop 34.

type Shape = "bird" | "bat" | "fish" | "saucer" | "satellite" | "balloon" | "drone";

interface Kind {
  readonly shape: Shape;
  readonly count: number;
  /** Their colours, one for each copy in turn. */
  readonly colours: readonly number[];
  /** How big each is, in metres across. */
  readonly size: number;
  /**
   * How far down the screen they fly, from and to, as a share of its height from the top: SKY if
   * not given. Balloons float up from the second to the first. And how fast they go, in metres a
   * second.
   */
  readonly sky?: readonly [number, number];
  readonly speed: number;
  /** How far down the pitch they keep, from and to, if not across the whole far end (DEPTH). */
  readonly depth?: readonly [number, number];
  /** How fast their wings or tails beat, in beats a second, and how far, in metres at the tip. */
  readonly beat?: number;
  readonly sweep?: number;
}

/** A shape and which of its points beat: 0 at the body, 1 at a wing's tip or a tail's end. */
interface Built {
  readonly geometry: THREE.BufferGeometry;
  /** The way its beating points move: up and down for wings, side to side for a tail. */
  readonly axis: THREE.Vector3;
}

/** A shape from triangles, each point with how much it beats, facing +X, the way it travels. */
const triangles = (points: readonly (readonly [number, number, number, number])[]) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      points.flatMap(([x, y, z]) => [x, y, z]),
      3,
    ),
  );
  geometry.setAttribute(
    "beat",
    new THREE.Float32BufferAttribute(
      points.map((p) => p[3]),
      1,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
};

/** A bird: a slim body and two wings, flat, spanning 1 m. */
const bird = (): Built => ({
  geometry: triangles([
    // The body, a long diamond.
    [0.28, 0, 0, 0],
    [0, 0, 0.05, 0],
    [-0.24, 0, 0, 0],
    [0.28, 0, 0, 0],
    [-0.24, 0, 0, 0],
    [0, 0, -0.05, 0],
    // The wings, swept back.
    [0.1, 0, 0.04, 0],
    [-0.08, 0, 0.04, 0],
    [-0.1, 0, 0.5, 1],
    [0.1, 0, -0.04, 0],
    [-0.1, 0, -0.5, 1],
    [-0.08, 0, -0.04, 0],
  ]),
  axis: new THREE.Vector3(0, 1, 0),
});

/** A bat: a stub of a body and ragged wings. */
const bat = (): Built => ({
  geometry: triangles([
    [0.12, 0, 0, 0],
    [0, 0, 0.05, 0],
    [-0.12, 0, 0, 0],
    [0.12, 0, 0, 0],
    [-0.12, 0, 0, 0],
    [0, 0, -0.05, 0],
    [0.08, 0, 0.04, 0],
    [-0.06, 0, 0.04, 0],
    [0.06, 0, 0.5, 1],
    [-0.06, 0, 0.04, 0],
    [-0.14, 0, 0.32, 0.7],
    [0.06, 0, 0.5, 1],
    [0.08, 0, -0.04, 0],
    [0.06, 0, -0.5, 1],
    [-0.06, 0, -0.04, 0],
    [-0.06, 0, -0.04, 0],
    [0.06, 0, -0.5, 1],
    [-0.14, 0, -0.32, 0.7],
  ]),
  axis: new THREE.Vector3(0, 1, 0),
});

/** A fish: a body seen side on, and a tail that beats from side to side. */
const fish = (): Built => ({
  geometry: triangles([
    [0.5, 0, 0, 0],
    [0, 0.18, 0, 0],
    [-0.3, 0, 0, 0.3],
    [0.5, 0, 0, 0],
    [-0.3, 0, 0, 0.3],
    [0, -0.16, 0, 0],
    [-0.28, 0, 0, 0.3],
    [-0.5, 0.16, 0, 1],
    [-0.5, -0.16, 0, 1],
  ]),
  axis: new THREE.Vector3(0, 0, 1),
});

/** The shapes that don't beat: a saucer, a satellite, a balloon and a drone, 1 m across. */
const still = (shape: Exclude<Shape, "bird" | "bat" | "fish">): Built => {
  const parts: THREE.BufferGeometry[] = [];
  if (shape === "saucer") {
    parts.push(new THREE.SphereGeometry(0.5, 16, 8).scale(1, 0.22, 1));
    parts.push(
      new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.06, 0),
    );
  } else if (shape === "satellite") {
    parts.push(new THREE.BoxGeometry(0.24, 0.24, 0.3));
    for (const side of [-1, 1])
      parts.push(new THREE.BoxGeometry(0.03, 0.2, 0.36).translate(0, 0, side * 0.34));
  } else if (shape === "balloon") {
    parts.push(new THREE.SphereGeometry(0.5, 14, 10).scale(0.9, 1.1, 0.9));
    parts.push(new THREE.ConeGeometry(0.06, 0.1, 6).translate(0, -0.58, 0));
  } else {
    parts.push(new THREE.BoxGeometry(0.3, 0.08, 0.3));
    for (const [x, z] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ] as const) {
      parts.push(
        new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12).translate(x * 0.22, 0.05, z * 0.22),
      );
    }
  }
  const geometry = mergeAll(parts);
  geometry.setAttribute(
    "beat",
    new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count), 1),
  );
  return { geometry, axis: new THREE.Vector3() };
};

/** Shapes merged into one, positions and normals only. */
const mergeAll = (parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const part of parts) {
    const flat = part.index ? part.toNonIndexed() : part;
    positions.push(...flat.getAttribute("position").array);
    normals.push(...flat.getAttribute("normal").array);
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
};

const build = (shape: Shape): Built =>
  shape === "bird" ? bird() : shape === "bat" ? bat() : shape === "fish" ? fish() : still(shape);

/** A repeatable number from 0 to 1 for a copy and a count: the same sky every game. */
const noise = (i: number, n: number) => {
  const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** How far either side they fly before they turn up again on the other. */
const ACROSS = 30;
/** How far down the pitch they fly: past the crowd, and in front of the backdrop. */
const DEPTH = [-16, BACKDROP_Z + 1.5] as const;
/**
 * How much bigger than life they're drawn: the far end is 30 m off, and a life-sized bird there is
 * a speck on a phone.
 */
const SEEN = 1.9;

/**
 * The band of sky they fly in, as a share of a phone's screen from its top: below the score and
 * the lives, which cover its top sixth or so, notch and all, and above the far end's scenery.
 */
const SKY = [0.16, 0.28] as const;

/** Where the game's camera looks between moves, and how much it sees top to bottom (see scene.ts). */
const VIEW = { aim: new THREE.Vector3(0, 0.5, -12), fov: 38 } as const;

/** How high something `z` down the pitch is, to be `down` the screen from its top, seen from EYE. */
const heightOnScreen = (down: number, z: number): number => {
  const tilt = Math.atan((EYE.y - VIEW.aim.y) / (EYE.z - VIEW.aim.z));
  const half = Math.tan(THREE.MathUtils.degToRad(VIEW.fov / 2));
  const up = Math.atan((0.5 - down) * 2 * half) - tilt;
  return EYE.y + Math.tan(up) * (EYE.z - z);
};

/** A flock of one kind: one draw call, every copy moved each frame. */
const flock = (kind: Kind): Scenery => {
  const { geometry, axis } = build(kind.shape);
  const phases = new Float32Array(kind.count);
  for (let i = 0; i < kind.count; i++) phases[i] = noise(i, 7) * Math.PI * 2;
  geometry.setAttribute("phase", new THREE.InstancedBufferAttribute(phases, 1));
  const time = { value: 0 };
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lifeTime = time;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float beat;\nattribute float phase;\nuniform float lifeTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        transformed += vec3(${axis.x.toFixed(1)}, ${axis.y.toFixed(1)}, ${axis.z.toFixed(1)}) * beat
          * sin(lifeTime * ${((kind.beat ?? 0) * Math.PI * 2).toFixed(3)} + phase) * ${(kind.sweep ?? 0).toFixed(3)};`,
      );
  };
  const mesh = new THREE.InstancedMesh(geometry, material, kind.count);
  // They fly all over, and it's cheaper to draw a few off screen than to work out which.
  mesh.frustumCulled = false;
  const colour = new THREE.Color();
  for (let i = 0; i < kind.count; i++) {
    mesh.setColorAt(i, colour.set(kind.colours[i % kind.colours.length] ?? 0xffffff));
  }
  const [top, bottom] = kind.sky ?? SKY;
  const flyers = Array.from({ length: kind.count }, (_, i) => {
    const depth = THREE.MathUtils.lerp(
      kind.depth?.[0] ?? DEPTH[0],
      kind.depth?.[1] ?? DEPTH[1],
      noise(i, 4),
    );
    return {
      start: (noise(i, 1) * 2 - 1) * ACROSS,
      way: kind.shape === "balloon" ? 1 : noise(i, 2) < 0.5 ? -1 : 1,
      // Its own height in the band, which is higher the further off it is; for a balloon, how
      // far up its float it starts, and the heights it floats up between.
      along: noise(i, 3),
      height: heightOnScreen(THREE.MathUtils.lerp(top, bottom, noise(i, 3)), depth),
      floats: [heightOnScreen(bottom, depth), heightOnScreen(top, depth)] as const,
      depth,
      speed: kind.speed * (0.75 + noise(i, 5) * 0.5),
      size: kind.size * SEEN * (0.8 + noise(i, 6) * 0.4),
      bob: noise(i, 8) * Math.PI * 2,
    };
  });
  const matrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  return {
    object: mesh,
    update: (seconds) => {
      time.value = seconds;
      flyers.forEach((f, i) => {
        if (kind.shape === "balloon") {
          // Up from behind the far end, drifting, then round again.
          const [from, to] = f.floats;
          const rise = to - from;
          const y = from + ((f.along * rise + seconds * f.speed) % rise);
          at.set(f.start * 0.6 + Math.sin(seconds * 0.4 + f.bob) * 0.8, y, f.depth);
          euler.set(0, f.bob, Math.sin(seconds * 0.7 + f.bob) * 0.08);
        } else {
          // Across, round again from the other side, rising and falling a little, and a bat
          // darting this way and that as it goes.
          const span = ACROSS * 2;
          const x =
            ((((f.start + f.way * seconds * f.speed + ACROSS) % span) + span) % span) - ACROSS;
          const dart = kind.shape === "bat" ? Math.sin(seconds * 2.3 + f.bob) * 0.8 : 0;
          at.set(x, f.height + Math.sin(seconds * 0.6 + f.bob) * 0.4 + dart, f.depth);
          // Facing the way it's going, banking a little, a saucer tilting.
          const bank = Math.sin(seconds * 0.5 + f.bob) * (kind.shape === "saucer" ? 0.25 : 0.12);
          euler.set(bank, f.way < 0 ? Math.PI : 0, kind.shape === "fish" ? 0 : bank * 0.5);
        }
        turn.setFromEuler(euler);
        scale.setScalar(f.size);
        mesh.setMatrixAt(i, matrix.compose(at, turn, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
};

/**
 * Flashes in the stands, from cameras and phones: points over the backdrop's stands, each going
 * off now and then, in its own time. One draw call.
 */
const flashes = (count: number): Scenery => {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const rates = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set([(noise(i, 11) * 2 - 1) * 12, 2.5 + noise(i, 12) * 6, BACKDROP_Z + 0.3], i * 3);
    phases[i] = noise(i, 13) * Math.PI * 2;
    rates[i] = 0.2 + noise(i, 14) * 0.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute("rate", new THREE.Float32BufferAttribute(rates, 1));
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { lifeTime: time },
    vertexShader: /* glsl */ `
      attribute float phase;
      attribute float rate;
      uniform float lifeTime;
      varying float vFlash;
      void main() {
        // A sharp peak, now and then: most of the time, nothing.
        vFlash = pow(max(0.0, sin(lifeTime * rate * 6.2832 + phase)), 40.0);
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 44.0 * vFlash * (40.0 / -view.z);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vFlash;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(vec3(1.0, 0.98, 0.92), smoothstep(1.0, 0.0, d) * vFlash);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    object: points,
    update: (seconds) => {
      time.value = seconds;
    },
  };
};

const BIRDS = [0x2b2b2e, 0x3a3631, 0x24262b];

/** What moves in front of each venue's backdrop. */
const LIFE: Record<VenueId, () => readonly Scenery[]> = {
  // Black kites riding the mountain's wind, wings out, hardly beating.
  fuji: () => [
    flock({
      shape: "bird",
      count: 4,
      colours: [0x3b2d25, 0x4a3a2e],
      size: 0.9,
      speed: 5,
      beat: 1.2,
      sweep: 0.12,
    }),
  ],
  // The piazza's pigeons.
  pisa: () => [
    flock({
      shape: "bird",
      count: 12,
      colours: [0x8a8d94, 0x6f727a, 0x9a9ca2],
      size: 0.45,
      speed: 3.5,
      beat: 5,
      sweep: 0.22,
    }),
  ],
  park: () => [
    flock({
      shape: "bird",
      count: 10,
      colours: BIRDS,
      size: 0.5,
      speed: 4,
      beat: 4,
      sweep: 0.22,
    }),
  ],
  beach: () => [
    flock({
      shape: "bird",
      count: 8,
      colours: [0xf4f4f2, 0xe8eaec],
      size: 0.7,
      speed: 3,
      beat: 1.6,
      sweep: 0.2,
    }),
  ],
  snow: () => [
    flock({
      shape: "bird",
      count: 6,
      colours: BIRDS,
      size: 0.45,
      speed: 3.5,
      beat: 4,
      sweep: 0.2,
    }),
  ],
  moon: () => [
    flock({
      shape: "satellite",
      count: 3,
      colours: [0xc9ccd2, 0xd8b45a],
      size: 1.2,
      // High in the band, as far off as they are.
      sky: [0.16, 0.21],
      speed: 0.8,
    }),
  ],
  underwater: () => [
    flock({
      shape: "fish",
      count: 14,
      colours: [0xf29a2e, 0xf6d23c, 0x58b8e8, 0xf2f2f2],
      size: 0.5,
      // Away at the far end, where they can't be taken for anything thrown.
      depth: [-26, BACKDROP_Z + 1.5],
      speed: 1.6,
      beat: 2.5,
      sweep: 0.12,
    }),
  ],
  volcano: () => [
    flock({
      shape: "bird",
      count: 6,
      colours: [0x141210],
      size: 0.6,
      speed: 3,
      beat: 3,
      sweep: 0.24,
    }),
  ],
  mars: () => [
    flock({
      shape: "drone",
      count: 4,
      colours: [0xe6e2dc, 0xb8b2a8],
      size: 0.8,
      speed: 2,
    }),
  ],
  space: () => [
    flashes(70),
    flock({
      shape: "saucer",
      count: 5,
      colours: [0x5ef0ff, 0xc77dff, 0x8affc1],
      size: 1.2,
      speed: 5,
    }),
  ],
  funfair: () => [
    flock({
      shape: "balloon",
      count: 12,
      colours: [0xe63946, 0xffd166, 0x3a86ff, 0xff5fa2, 0x2ec27e],
      size: 0.55,
      // From over the stalls, up at the far end, away from anything thrown, and off the top.
      sky: [-0.05, 0.36],
      depth: [-28, BACKDROP_Z + 1.5],
      speed: 0.6,
    }),
    flock({
      shape: "bird",
      count: 4,
      colours: BIRDS,
      size: 0.45,
      speed: 3.5,
      beat: 4,
      sweep: 0.2,
    }),
  ],
  castle: () => [
    flock({
      shape: "bat",
      count: 10,
      colours: [0x121216],
      size: 0.45,
      speed: 3,
      beat: 9,
      sweep: 0.25,
    }),
  ],
  final: () => [flashes(110)],
  colosseum: () => [
    flock({
      shape: "bird",
      count: 6,
      colours: [0xf2f0ea],
      size: 0.5,
      speed: 3,
      beat: 3.5,
      sweep: 0.2,
    }),
  ],
};

/** A venue's life: everything that moves in front of its backdrop, as one. */
export const venueLife = (venue: VenueId): Scenery => {
  const parts = LIFE[venue]();
  const object = new THREE.Group();
  object.name = "life";
  for (const part of parts) object.add(part.object);
  return {
    object,
    update: (seconds, dt) => {
      for (const part of parts) part.update(seconds, dt);
    },
  };
};
