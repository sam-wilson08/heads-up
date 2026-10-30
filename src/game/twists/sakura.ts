import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Item, Round } from "../engine";
import { buildDragon } from "./dragon";
import { DRAGON, dragons } from "./schedule";
import { driftSpanOf, type TwistRule } from "./twist";
import {
  betweenLanes,
  PLAIN,
  progress,
  SHOWN,
  smooth,
  type TwistContext,
  type TwistView,
} from "./view";

// Sakura Peak: mountain gusts blow a whole wave across, one lane, or a lone thing two lanes in a
// strong gust (see twists/twist.ts). Cherry blossoms are always drifting over the cliff's edge on
// the breeze; just before a gust takes a wave, they stream across the pitch the way it's going, more
// of them and faster in a strong one, and what's caught leans into it as it's blown over. The
// blossom on the slopes in the backdrop's picture sways all the while, and bows the way a gust
// blows: the picture's pink is picked out and swayed in its shaders, so it needs no layer of its own.
// Every so often a long pink dragon flies across the sky out over the drop, its body and tail
// hiding whatever's coming behind them for a moment (see ./dragon.ts).

/** How many blossoms there are, and how many of them drift on the breeze between gusts. */
const BLOSSOMS = 360;
const DRIFTING = 0.35;
/** How far either side of the middle the blossoms blow before they come round again, fading out. */
const ACROSS = 9;
/** How long before a gust takes a wave that the blossoms start to stream, as a share of its flight. */
const WARNING = 0.16;
/**
 * How fast the wind blows the blossoms across, in metres a second: on the breeze between gusts, in
 * a gust, and in a strong one, two lanes across. And how quickly it gets up and dies down.
 */
const WIND = { breeze: 0.8, gust: 11, strong: 16, rise: 4, fall: 1.5 };
/**
 * How far the blossom in the picture sways to and fro on the breeze, in its pixels across, and how
 * far over it bows the way a gust blows, further in a strong one.
 */
const SWAY = { breeze: 1.6, gust: 3, strong: 4.5 };
/** How each blossom's tinted, so they're not all the same pink. */
const TINTS = ["#ffffff", "#fff2f6", "#ffe6ee", "#fbdbe6", "#fff8fa"];

const driftOf = (item: Item) => (item.twist?.kind === "drift" ? item.twist : undefined);

/** A blossom's colours: deep pink at its heart, paling to almost white at its petals' tips. */
const HEART = new THREE.Color("#d4547a");
const TIP = new THREE.Color("#fbd3e0");

/**
 * A cherry blossom, 4 cm across, lying flat on X and Y: five rounded petals, each notched at its
 * tip, deep pink at the heart and paling out to the tips. They're drawn two or three times that,
 * to show from the far end of the pitch on a phone.
 */
const blossomShape = (): THREE.BufferGeometry => {
  const petal = new THREE.Shape();
  petal.moveTo(0, 0);
  petal.bezierCurveTo(0.009, 0.004, 0.011, 0.015, 0.0045, 0.021);
  petal.lineTo(0, 0.0175);
  petal.lineTo(-0.0045, 0.021);
  petal.bezierCurveTo(-0.011, 0.015, -0.009, 0.004, 0, 0);
  // Each a hair in front of the last, so where they overlap at the heart none flickers.
  const petals = Array.from({ length: 5 }, (_, k) =>
    new THREE.ShapeGeometry(petal, 6).rotateZ((k * 2 * Math.PI) / 5).translate(0, 0, k * 0.0002),
  );
  const blossom = mergeGeometries(petals);
  for (const each of petals) each.dispose();
  const position = blossom.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const out = Math.hypot(position.getX(i), position.getY(i)) / 0.021;
    colour.copy(HEART).lerp(TIP, THREE.MathUtils.smoothstep(out, 0.05, 0.6));
    colour.toArray(colours, i * 3);
  }
  blossom.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return blossom;
};

/** How the blossom in a backdrop's picture is swayed, in its pixels: see swayBlossom. */
interface Sway {
  readonly time: { value: number };
  /** How far it sways to and fro. */
  readonly sway: { value: number };
  /** How far over it bows, to the right, or to the left if negative. */
  readonly bend: { value: number };
}

/**
 * Sways the pink in a backdrop's picture, the blossom, in its shader. The pink's told from a
 * blurred look at the picture, so the trees' edges sway with them.
 */
const swayBlossom = (material: THREE.MeshBasicMaterial, { time, sway, bend }: Sway) => {
  const width = (material.map?.image as { width?: number } | undefined)?.width ?? 2048;
  const pixel = { value: 1 / width };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      windTime: time,
      windSway: sway,
      windBend: bend,
      windPixel: pixel,
    });
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float windTime;
        uniform float windSway;
        uniform float windBend;
        uniform float windPixel;`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec3 soft = texture2D( map, vMapUv, 2.5 ).rgb;
          float blossom = smoothstep( 0.04, 0.12, min( soft.r - soft.g, soft.b - soft.g + 0.06 ) );
          vec2 swayed = vec2(
            sin( windTime * 2.3 + vMapUv.y * 90.0 + vMapUv.x * 40.0 ) * windSway + windBend,
            0.5 * sin( windTime * 3.1 + vMapUv.x * 70.0 ) * windSway
          ) * blossom * windPixel;
          diffuseColor *= texture2D( map, vMapUv + swayed );
        #endif`,
      );
  };
  material.customProgramCacheKey = () => "sakura-blossom";
  material.needsUpdate = true;
};

export const sakura = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, calm, rules, seed } = context;
  if (rule.kind !== "gale") return PLAIN;

  // The dragon, no nearer than where what's thrown is halfway to the player, so anything it hides
  // comes out in front of it with half its flight to go (see DRAGON).
  const probe: Item = { id: 0, kind: "ball", lane: 0, launchedAt: 0, flightMs: 1 };
  const dragon = buildDragon(context.pathAt(probe, 0, DRAGON.hidesTo).z);
  const passes = dragons(rule, rules.roundMs, seed);
  scene.add(dragon.object);

  // The blossoms, one draw: each its own pink, coming from its own place, the same every time.
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const blossoms = new THREE.InstancedMesh(blossomShape(), material, BLOSSOMS);
  blossoms.frustumCulled = false;
  blossoms.name = "blossoms";
  const r = (i: number, n: number) => ((((i + 1) * n) % 1) + 1) % 1;
  const colour = new THREE.Color();
  const flight = Array.from({ length: BLOSSOMS }, (_, i) => {
    blossoms.setColorAt(i, colour.set(TINTS[i % TINTS.length] ?? "#ffffff"));
    return {
      x: r(i, 0.618034) * ACROSS * 2 - ACROSS,
      y: 0.2 + r(i, 0.414214) * 4.2,
      z: 3 - r(i, 0.732051) * 19,
      pace: 0.7 + r(i, 0.271828) * 0.6,
      bob: r(i, 0.91) * Math.PI * 2,
      spin: [1 + r(i, 0.33) * 3, 1 + r(i, 0.577215) * 4, r(i, 0.19) * 2] as const,
      size: 2.3 + r(i, 0.12) * 1.1,
    };
  });
  scene.add(blossoms);
  const dummy = new THREE.Object3D();
  const tumbling = new THREE.Quaternion();
  /** A blossom streaming along the wind, its length across the screen. */
  const streaming = new THREE.Quaternion();
  const euler = new THREE.Euler();

  // The blossom in the picture, if there is one: the trees round the summit in its near layer,
  // and the slopes below in its far one.
  const picture: Sway = { time: { value: 0 }, sway: { value: SWAY.breeze }, bend: { value: 0 } };
  const backdrop = scene.getObjectByName("backdrop");
  for (const layer of [backdrop, backdrop?.getObjectByName("far")]) {
    if (
      !calm &&
      layer instanceof THREE.Mesh &&
      layer.material instanceof THREE.MeshBasicMaterial &&
      layer.material.map
    ) {
      swayBlossom(layer.material, picture);
    }
  }

  /** How hard the wind's blowing the blossoms now, in metres a second: negative to the left. */
  let wind = WIND.breeze;
  /** The way it last blew, which the breeze keeps on blowing between gusts. */
  let lastWay = 1;
  /** How many of the blossoms are out: those drifting on the breeze, or all of them in a gust. */
  let out = DRIFTING;

  return {
    dress: (item) => {
      const drift = driftOf(item);
      if (!drift) return undefined;
      const lanes = item.lane - drift.from;
      const way = Math.sign(lanes);
      const span = driftSpanOf(Math.abs(lanes));
      const across = (p: number) => smooth(drift.at, drift.at + span, p);
      return {
        move: (current, _round, p) => {
          if (p >= 1) return undefined;
          const at = betweenLanes(context.pathAt, current, drift.from, current.lane, p, across(p));
          return { air: at, ground: at };
        },
        update: (current, round, object) => {
          // Leaning into the gust as it's blown across.
          const p = progress(current, round.now);
          object.rotation.z -= way * Math.sin(Math.PI * across(p)) * 0.6;
          return SHOWN;
        },
        dispose: () => undefined,
      };
    },

    update: (round: Round, seconds: number, dt: number) => {
      const pass = passes.find((p) => round.now >= p.from && round.now < p.to);
      dragon.update(pass, round.now, seconds);

      // The gust blowing now, if any: from just before it takes a wave until it's set it down.
      const gust = round.items.find((i) => {
        const drift = driftOf(i);
        if (!drift) return false;
        const p = progress(i, round.now);
        const span = driftSpanOf(Math.abs(i.lane - drift.from));
        return p > drift.at - WARNING && p < drift.at + span;
      });
      const drift = gust && driftOf(gust);
      const lanes = gust && drift ? gust.lane - drift.from : 0;
      const way = Math.sign(lanes);
      if (way) lastWay = way;
      const strong = Math.abs(lanes) > 1;
      const target = way ? way * (strong ? WIND.strong : WIND.gust) : lastWay * WIND.breeze;
      wind += (target - wind) * Math.min(1, dt * (way ? WIND.rise : WIND.fall));
      const blown = Math.min(1, Math.abs(wind) / WIND.gust);
      out += ((way ? 1 : DRIFTING) - out) * Math.min(1, dt * 3);

      // The blossom sways, harder in a gust, and bows the way it's blowing.
      picture.time.value = seconds;
      picture.sway.value = SWAY.breeze * (1 + blown);
      picture.bend.value = Math.sign(wind) * (strong ? SWAY.strong : SWAY.gust) * blown;

      // The blossoms blow across with the wind, round the pitch so they keep coming, and fading out
      // towards either side, so none of them pops in or out. They tumble as they go, and sink
      // slowly, coming round again at the top. In a gust they stream along it, side on, so which
      // way it's blowing shows even at a glance. A player who's asked for less motion sees them
      // drift slowly, without the tumbling.
      const pace = calm ? 0.15 : 1;
      const span = ACROSS * 2;
      streaming.setFromEuler(euler.set(0, 0, Math.PI / 2));
      const along = calm ? 0 : blown * 0.8;
      for (const [i, blossom] of flight.entries()) {
        blossom.x += wind * blossom.pace * pace * dt;
        blossom.x = ((((blossom.x + ACROSS) % span) + span) % span) - ACROSS;
        blossom.y -= (0.25 - blown * 0.15) * pace * dt;
        if (blossom.y < 0.1) blossom.y += 4.2;
        const edges = 1 - THREE.MathUtils.smoothstep(Math.abs(blossom.x), ACROSS * 0.6, ACROSS);
        const shown = THREE.MathUtils.clamp((out * BLOSSOMS - i) / 8, 0, 1);
        const flutter = calm ? 0 : Math.sin(seconds * 1.7 + blossom.bob);
        dummy.position.set(blossom.x, blossom.y + flutter * 0.15, blossom.z);
        const tumble = calm ? 0.2 : 1 + blown * 2;
        const [a, b, c] = blossom.spin;
        tumbling.setFromEuler(
          euler.set(
            blossom.bob + seconds * a * tumble,
            seconds * b * tumble,
            blossom.bob * 2 + seconds * c,
          ),
        );
        dummy.quaternion.slerpQuaternions(tumbling, streaming, along);
        const size = Math.max(blossom.size * edges * shown, 0.0001);
        dummy.scale.set(size, size * (1 + along * 0.3), size);
        dummy.updateMatrix();
        blossoms.setMatrixAt(i, dummy.matrix);
      }
      blossoms.instanceMatrix.needsUpdate = true;
    },
    warmUp: dragon.warmUp,
    dispose: () => {
      scene.remove(dragon.object);
      dragon.dispose();
      scene.remove(blossoms);
      blossoms.geometry.dispose();
      material.dispose();
      blossoms.dispose();
    },
  };
};
