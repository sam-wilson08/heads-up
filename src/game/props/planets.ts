import * as THREE from "three";
import { noise, type Prop, seeded, type Vec3 } from "./shapes";

// What hangs in the sky off Earth: the Earth over the Moon, Mars's two lumpy moons and a ringed
// planet over the Space Stadium. Units are metres; the goal is down -Z. Each is lit by a sun of
// its own, rather than the light the pitch is lit by, so it shows a lit side and a dark one
// whichever way the pitch's light comes from. The haze doesn't fade them: they're beyond it.

const VERTEX = /* glsl */ `
  varying vec4 vColour;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    #ifdef USE_COLOR_ALPHA
      vColour = color;
    #else
      vColour = vec4(color, 1.0);
    #endif
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 sunDirection;
  uniform vec3 atmosphere;
  uniform float night;
  varying vec4 vColour;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    #ifdef FACETED
      // Each face lit flat, for rock.
      vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    #else
      vec3 normal = normalize(vNormal);
    #endif
    #ifdef RING
      // Lit from either side.
      float light = 0.35 + 0.65 * abs(dot(normal, sunDirection));
    #else
      // A soft edge between day and night.
      float light = smoothstep(-0.15, 0.55, dot(normal, sunDirection));
    #endif
    vec3 colour = vColour.rgb * mix(night, 1.0, light);
    vec3 view = normalize(cameraPosition - vWorld);
    // Air glows round the edge of the lit side.
    float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.5);
    colour += atmosphere * rim * (0.15 + 0.85 * light);
    gl_FragColor = vec4(colour, vColour.a);
    #include <colorspace_fragment>
  }
`;

/** Lit by its own sun, `sun` the way towards it. */
const lit = (
  sun: THREE.Vector3,
  { atmosphere = 0x000000, night = 0.08, faceted = false, ring = false } = {},
) =>
  new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    vertexColors: true,
    uniforms: {
      sunDirection: { value: sun.clone().normalize() },
      atmosphere: { value: new THREE.Color(atmosphere) },
      night: { value: night },
    },
    defines: { ...(faceted ? { FACETED: "" } : {}), ...(ring ? { RING: "" } : {}) },
    transparent: ring,
    depthWrite: !ring,
    side: ring ? THREE.DoubleSide : THREE.FrontSide,
  });

/** Paints each point of a shape by where it is on it. */
const paint = (
  geometry: THREE.BufferGeometry,
  at: (p: THREE.Vector3) => THREE.ColorRepresentation,
) => {
  const positions = geometry.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    c.set(at(p.fromBufferAttribute(positions, i))).toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
};

const OCEAN = { deep: new THREE.Color(0x1b4f9c), shallow: new THREE.Color(0x2f86d4) };
const LAND = {
  green: new THREE.Color(0x4f8f3a),
  dry: new THREE.Color(0xb59a5c),
  high: new THREE.Color(0x6d6a4a),
};
const ICE = new THREE.Color(0xf4f8fb);

/**
 * The Earth from the Moon: blue oceans, green and sandy continents, white ice at the poles and
 * swirls of cloud, turning slowly, with a thin blue glow of air round it.
 */
export const earth = (): Prop => {
  const radius = 4.2;
  const land = noise(7, 4);
  const cloud = noise(19, 3);
  const dry = noise(31, 2);
  const geometry = paint(new THREE.SphereGeometry(radius, 64, 40), (p) => {
    const [x, y, z] = [p.x / radius, p.y / radius, p.z / radius];
    const height = land(x * 1.8, y * 1.8, z * 1.8) + 0.06;
    const latitude = Math.abs(y);
    const c = new THREE.Color();
    if (height < 0)
      c.copy(OCEAN.deep).lerp(OCEAN.shallow, THREE.MathUtils.smoothstep(height, -0.12, 0));
    else {
      // Deserts round the tropics, darker uplands inland.
      const desert = THREE.MathUtils.smoothstep(
        dry(x * 2, y * 2, z * 2) + 0.35 - latitude,
        0.2,
        0.5,
      );
      c.copy(LAND.green)
        .lerp(LAND.dry, desert)
        .lerp(LAND.high, THREE.MathUtils.smoothstep(height, 0.12, 0.3));
    }
    c.lerp(ICE, THREE.MathUtils.smoothstep(latitude + land(x * 4, y * 4, z * 4) * 0.08, 0.8, 0.86));
    const clouds = THREE.MathUtils.smoothstep(cloud(x * 2.5, y * 5, z * 2.5), 0.12, 0.38);
    return c.lerp(ICE, clouds * 0.85);
  });
  const globe = new THREE.Mesh(
    geometry,
    // The sun is off to the right, so it's a fat crescent with the night side towards the goal.
    lit(new THREE.Vector3(1, 0.35, 0.55), { atmosphere: 0x6fb4ff, night: 0.05 }),
  );
  globe.rotation.set(0.35, 0, 0.4);
  const object = new THREE.Group();
  object.add(globe);
  // Low over the hills to the left of the goal, clear of what comes down the lanes.
  object.position.set(-8.5, 13, -96);
  return {
    object,
    update: (seconds) => {
      globe.rotation.y = seconds * 0.04;
    },
  };
};

/** A lumpy, cratered moon like Mars's: a ball knocked out of shape and dented, its faces flat. */
const rock = (radius: number, seed: number, stretch: Vec3, sun: THREE.Vector3) => {
  const lumps = noise(seed, 3);
  const craters = noise(seed + 50, 2);
  const random = seeded(seed);
  const geometry = new THREE.IcosahedronGeometry(radius, 3);
  const positions = geometry.getAttribute("position");
  const p = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i).normalize();
    const lump = 1 + lumps(p.x * 1.4, p.y * 1.4, p.z * 1.4) * 0.28;
    // Round dents where the crater noise peaks.
    const dent = THREE.MathUtils.smoothstep(craters(p.x * 2.6, p.y * 2.6, p.z * 2.6), 0.25, 0.5);
    p.multiplyScalar(radius * (lump - dent * 0.08)).multiply(new THREE.Vector3(...stretch));
    positions.setXYZ(i, p.x, p.y, p.z);
  }
  // Its faces share no corners, so they're lit flat, like rock.
  const faceted = geometry;
  faceted.computeVertexNormals();
  const base = new THREE.Color(0x8a7563);
  const dark = new THREE.Color(0x5b4a3e);
  paint(faceted, (q) => {
    const n = q.clone().normalize();
    const dent = THREE.MathUtils.smoothstep(craters(n.x * 2.6, n.y * 2.6, n.z * 2.6), 0.2, 0.45);
    return base
      .clone()
      .lerp(dark, dent * 0.8)
      .multiplyScalar(0.9 + random() * 0.15);
  });
  return new THREE.Mesh(faceted, lit(sun, { faceted: true, night: 0.12, atmosphere: 0x3a2418 }));
};

/** Phobos and Deimos, high over Mars, tumbling very slowly. */
export const marsMoons = (): Prop => {
  // Low in the sky ahead, off to the right, as the venue's own sun is.
  const sun = new THREE.Vector3(0.8, 0.3, 0.4);
  const phobos = rock(1.7, 3, [1.35, 1, 0.95], sun);
  phobos.position.set(-9, 15, -95);
  const deimos = rock(1, 11, [1.15, 0.95, 1], sun);
  // Low enough to clear the score along the top of the screen, and off to the side of the sun,
  // which is a little right of ahead.
  deimos.position.set(7.5, 12, -100);
  const object = new THREE.Group();
  object.add(phobos, deimos);
  return {
    object,
    update: (seconds) => {
      phobos.rotation.set(0.3, seconds * 0.05, 0.2);
      deimos.rotation.set(-0.2, -seconds * 0.07, 0.5);
    },
  };
};

const BANDS = [0xf3d2a2, 0xe2a874, 0xf7e3c0, 0xc97c56, 0xeab98a, 0xd99366, 0xf5dcb4] as const;

/** Rings of dust round a planet, in bands of colour with gaps between, from `inner` to `outer`. */
const rings = (inner: number, outer: number, sun: THREE.Vector3) => {
  // Each band has its own ring of points either side, so its edges are sharp.
  const bands: { from: number; to: number; colour: number; alpha: number }[] = [
    { from: 0, to: 0.18, colour: 0xb88a68, alpha: 0.35 },
    { from: 0.2, to: 0.52, colour: 0xf0d7b0, alpha: 0.9 },
    { from: 0.52, to: 0.6, colour: 0xd6a67c, alpha: 0.75 },
    { from: 0.66, to: 0.92, colour: 0xe9c9a0, alpha: 0.8 },
    { from: 0.94, to: 1, colour: 0xc89d78, alpha: 0.45 },
  ];
  const segments = 96;
  const positions: number[] = [];
  const colours: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  for (const band of bands) {
    const start = positions.length / 3;
    c.set(band.colour);
    for (const t of [band.from, band.to]) {
      const r = inner + (outer - inner) * t;
      for (let s = 0; s <= segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
        normals.push(0, 1, 0);
        colours.push(c.r, c.g, c.b, band.alpha);
      }
    }
    for (let s = 0; s < segments; s++) {
      const a = start + s;
      const b = a + segments + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 4));
  geometry.setIndex(index);
  return new THREE.Mesh(geometry, lit(sun, { ring: true }));
};

/**
 * A ringed planet over the Space Stadium: banded in warm creams and rusts that stand out against
 * the violet sky, with a tilted ring and a little moon going round.
 */
export const ringedPlanet = (): Prop => {
  const radius = 4.6;
  const sun = new THREE.Vector3(0.9, 0.45, 0.6);
  const swirl = noise(5, 3);
  const globe = new THREE.Mesh(
    paint(new THREE.SphereGeometry(radius, 48, 48), (p) => {
      const y = p.y / radius + swirl(p.x * 0.6, p.y * 1.5, p.z * 0.6) * 0.06;
      const along = (y + 1) * 6.5;
      const band = Math.floor(along);
      const at = (k: number) =>
        BANDS[((k % BANDS.length) + BANDS.length) % BANDS.length] ?? 0xffffff;
      // Blended from one band into the next over a narrow edge, so they don't show steps.
      return new THREE.Color(at(band)).lerp(
        new THREE.Color(at(band + 1)),
        THREE.MathUtils.smoothstep(along - band, 0.7, 1),
      );
    }),
    lit(sun, { atmosphere: 0xffc89a, night: 0.07 }),
  );
  const ring = rings(radius * 1.35, radius * 2.25, sun);
  const moon = new THREE.Mesh(
    paint(new THREE.SphereGeometry(0.7, 20, 14), () => 0xb9b4c8),
    lit(sun, { night: 0.1 }),
  );
  const tilt = new THREE.Group();
  tilt.rotation.set(0.42, 0, 0.32);
  tilt.add(globe, ring);
  const object = new THREE.Group();
  object.add(tilt, moon);
  object.position.set(-10, 16, -95);
  return {
    object,
    update: (seconds) => {
      globe.rotation.y = seconds * 0.06;
      const orbit = seconds * 0.05 + 2;
      moon.position.set(Math.cos(orbit) * 13, 3 + Math.sin(orbit) * 2, Math.sin(orbit) * 6);
    },
  };
};
