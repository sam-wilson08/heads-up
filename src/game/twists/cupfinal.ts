import * as THREE from "three";
import type { Item, Round } from "../engine";
import { DRESS, runner } from "../props/invader";
import { type Flare, flareAt, flares, SMOKE, smokeOf } from "./schedule";
import { PUFF_KINDS, puffCloud, type Spark, sparkShower } from "./smoke";
import type { TwistRule } from "./twist";
import {
  glowDisc,
  glowSprite,
  PLAIN,
  progress,
  SHOWN,
  type TwistContext,
  type TwistView,
} from "./view";

// The Cup Final: every so often a pitch invader sprints on from the side, a lit flare in their
// hand, with two stewards chasing, plants it out on the pitch in one lane and runs off towards the
// far corner. Thick red smoke billows up from it and drifts back down that lane towards the goal,
// hiding whatever's coming down it until it's out in front, with time to act (see twists.test.ts).
// The smoke never stops moving: it pours up off the flare and rolls on down the lane, and the
// flare spits sparks and throws a flickering red light over the grass and the smoke round it.
// The smoke hangs a few seconds, then thins and clears. The invader and stewards are only the
// warning: they're down on the grass, under everything in the air, and gone before the smoke is
// thick. It all comes from the round's seed (see schedule.ts).

/**
 * How many puffs the smoke rolling down the lane is made of, how many stay put along it so it's
 * never thin anywhere, and how many pour up off the flare.
 */
const PLUME = 22;
const ANCHORS = 3;
const COLUMN = 10;
/** How fast the smoke rolls down the lane, in lengths of it a second, and pours up off the flare. */
const ROLL = 0.035;
const POUR = 0.28;
/** How many sparks the flare spits, how big they are, in metres, and how hard they're thrown. */
const SPARKS = 36;
const SPARK_SIZE = 0.11;
const SPARK_SPEED = [1.8, 3.4] as const;
/** The flare's light: how bright, how far it reaches, and its colour. */
const LIGHT = { intensity: 10, distance: 7, colour: 0xff3d1f } as const;
/** How far the smoke's puffs sit in front of the path things fly along, so they're hidden behind. */
const NEARER = 0.7;
/** How long the invader takes to plant the flare, run off, and how far behind the stewards are. */
const PLANT_MS = 320;
const OFF_MS = 1900;
const CHASE_MS = [650, 900] as const;
/** How fast the runners' legs go, in radians of stride a millisecond. */
const STRIDE = 0.019;

const smoothstep = (edge0: number, edge1: number, x: number) =>
  THREE.MathUtils.smoothstep(x, edge0, edge1);

export const cupFinal = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, camera, rules, seed, pathAt, calm } = context;
  if (rule.kind !== "flare") return PLAIN;
  const spells = flares(rule, rules.roundMs, seed);
  const probe: Item = { id: 0, kind: "ball", lane: 0, launchedAt: 0, flightMs: 1000 };
  const added: THREE.Object3D[] = [];

  // The invader and the stewards after them.
  const invader = runner(DRESS.invader);
  const stewards = CHASE_MS.map(() => runner(DRESS.steward));
  for (const r of [invader, ...stewards]) {
    r.object.visible = false;
    added.push(r.object);
  }

  // The flare: a red stick burning bright at its tip, carried, then stuck in the grass.
  const disc = glowDisc();
  const flare = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.36, 6),
    new THREE.MeshStandardMaterial({ color: 0xc81e24, roughness: 0.6 }),
  );
  stick.position.y = 0.18;
  const burn = glowSprite(disc, "#ff4a2a");
  burn.position.y = 0.4;
  const core = glowSprite(disc, "#fff0c8");
  core.position.y = 0.4;
  core.scale.setScalar(0.25);
  const glare = glowSprite(disc, "#ff2a1a");
  glare.position.y = 0.05;
  flare.add(stick, burn, core, glare);
  flare.visible = false;
  added.push(flare);

  // Its light, always there so the scene's shaders never change, and dark until the flare's lit.
  const light = new THREE.PointLight(LIGHT.colour, 0, LIGHT.distance, 1.6);
  added.push(light);
  const tip = new THREE.Vector3();

  // The sparks it spits: each thrown up and out from the tip and falling back, over and over, on
  // its own beat, the same each time.
  const shower = sparkShower(SPARKS, "#ff7a3a", SPARK_SIZE);
  shower.object.renderOrder = 1;
  added.push(shower.object);
  const throws = Array.from({ length: SPARKS }, (_, k) => {
    const turn = k * 2.39996;
    const up = 0.55 + ((k * 0.618) % 1) * 0.4;
    const speed = THREE.MathUtils.lerp(SPARK_SPEED[0], SPARK_SPEED[1], (k * 0.381) % 1);
    const flat = Math.sqrt(1 - up * up);
    return {
      velocity: new THREE.Vector3(Math.cos(turn) * flat, up, Math.sin(turn) * flat).multiplyScalar(
        speed,
      ),
      every: 0.45 + ((k * 0.723) % 1) * 0.35,
      offset: (k * 0.457) % 1,
      at: new THREE.Vector3(),
    };
  });
  const sparks: Spark[] = [];

  // The smoke: puffs rolling back down the lane, a few that stay put along it, and a column of
  // them pouring up off the flare, all drawn at once.
  const cloud = puffCloud(PLUME + ANCHORS + COLUMN);
  added.push(cloud.object);
  const shades = ["#d0262e", "#e04040", "#b8202a", "#e8564c"].map((c) => new THREE.Color(c));
  const hot = new THREE.Color("#ffb070");
  const puffs = Array.from({ length: PLUME + ANCHORS + COLUMN }, (_, k) => ({
    at: new THREE.Vector3(),
    size: 0,
    spin: 0,
    opacity: 0,
    colour: new THREE.Color(),
    kind: k % PUFF_KINDS,
  }));
  scene.add(...added);

  const towardCamera = new THREE.Vector3();
  /** Where a puff of the plume sits: on the lane's path, `p` through, a little nearer the camera. */
  const onPath = (lane: Flare["lane"], p: number) => {
    const at = pathAt(probe, lane, p);
    towardCamera.copy(camera.position).sub(at).normalize();
    return at.addScaledVector(towardCamera, NEARER);
  };

  /** The invader's way on, to the flare's spot and off, as a place at `t` ms after running on. */
  const route = (spell: Flare, plant: THREE.Vector3) => {
    // From just off the side of a phone's screen, so they're seen for most of their run.
    const start = new THREE.Vector3(spell.side * 6.5, 0, plant.z - 2);
    const stand = plant.clone().add(new THREE.Vector3(spell.side * 0.45, 0, 0.1));
    const exit = new THREE.Vector3(-spell.side * 11, 0, plant.z - 14);
    return (t: number): { at: THREE.Vector3; heading: THREE.Vector3; crouch: number } => {
      if (t < SMOKE.runMs) {
        const k = t / SMOKE.runMs;
        return { at: start.clone().lerp(stand, k), heading: stand.clone().sub(start), crouch: 0 };
      }
      if (t < SMOKE.runMs + PLANT_MS) {
        const k = (t - SMOKE.runMs) / PLANT_MS;
        return {
          at: stand.clone(),
          heading: plant.clone().sub(stand),
          crouch: Math.sin(k * Math.PI),
        };
      }
      const k = Math.min(1, (t - SMOKE.runMs - PLANT_MS) / OFF_MS);
      return { at: stand.clone().lerp(exit, k), heading: exit.clone().sub(stand), crouch: 0 };
    };
  };

  const place = (
    r: ReturnType<typeof runner>,
    way: ReturnType<ReturnType<typeof route>>,
    t: number,
  ) => {
    r.object.position.copy(way.at);
    r.object.rotation.y = Math.atan2(way.heading.x, way.heading.z);
    r.pose(calm ? 0 : t * STRIDE, way.crouch);
  };

  return {
    dress: (item) => {
      if (item.kind === "hurdle") return undefined;
      return {
        // In the smoke, the streak's glow and the shadow on the grass would give it away.
        update: (current, round) => {
          const spell = flareAt(spells, round.now);
          const hidden =
            spell?.lane === current.lane &&
            smokeOf(spell, round.now) > 0.3 &&
            progress(current, round.now) < spell.hidesTo;
          return hidden ? { show: true, glow: false, shadow: 0 } : SHOWN;
        },
        dispose: () => undefined,
      };
    },

    update: (round: Round, seconds: number) => {
      const spell = flareAt(spells, round.now);
      for (const r of [invader, ...stewards]) r.object.visible = false;
      flare.visible = false;
      light.intensity = 0;
      sparks.length = 0;
      for (const puff of puffs) puff.opacity = 0;
      // Whatever's lit below, drawn at the end, however it ends.
      const draw = () => {
        cloud.draw(puffs, camera);
        shower.draw(sparks);
      };
      if (!spell) {
        draw();
        return;
      }
      const now = round.now;
      const t = now - spell.warnFrom;
      const plant = pathAt(probe, spell.lane, spell.hidesTo).setY(0);
      const way = route(spell, plant);

      // The invader, carrying the flare until it's planted, and the stewards hard on their heels.
      if (t < SMOKE.runMs + PLANT_MS + OFF_MS) {
        invader.object.visible = true;
        place(invader, way(t), t);
      }
      stewards.forEach((steward, k) => {
        const lag = CHASE_MS[k] ?? 0;
        if (t < lag || t > lag + SMOKE.runMs + PLANT_MS + OFF_MS) return;
        steward.object.visible = true;
        const chasing = way(t - lag);
        // They don't stop to plant anything: they run straight on after the invader.
        place(steward, { ...chasing, crouch: 0 }, t);
        steward.object.position.x += (k ? -0.6 : 0.6) * spell.side;
      });

      // The flare burns from when it's planted until the smoke's gone.
      const smoke = smokeOf(spell, now);
      const planted = now >= spell.plantedAt;
      flare.visible = true;
      if (planted) {
        if (flare.parent !== scene) scene.add(flare);
        flare.position.copy(plant);
        flare.rotation.set(0, 0, 0.2);
      } else {
        invader.hand.add(flare);
        flare.position.set(0, -0.1, 0);
        flare.rotation.set(Math.PI * 0.85, 0, 0);
      }
      const flicker = calm
        ? 1
        : 0.8 + Math.sin(seconds * 37) * 0.12 + Math.sin(seconds * 23) * 0.08;
      burn.scale.setScalar(1.3 * flicker);
      glare.scale.setScalar((planted ? 2.6 : 1.2) * flicker);
      glare.material.opacity = 0.7;

      // It lights up what's round it, flickering, and dies down as the smoke clears.
      const clearing = now > spell.to ? (now - spell.to) / SMOKE.clearMs : 0;
      const lit = flicker * (1 - clearing);
      burn.getWorldPosition(tip);
      light.position.copy(tip);
      light.intensity = LIGHT.intensity * lit;

      // And spits sparks, each thrown from the tip and falling back, fading as it goes.
      if (!calm) {
        for (const spark of throws) {
          const age = (seconds / spark.every + spark.offset) % 1;
          const t = age * spark.every;
          spark.at
            .copy(tip)
            .addScaledVector(spark.velocity, t)
            .add({ x: 0, y: -4.9 * t * t, z: 0 });
          if (spark.at.y < 0.02) continue;
          sparks.push({ at: spark.at, glow: (1 - age) ** 1.5 * lit });
        }
      }

      // The smoke billows up from the flare, then rolls back down the lane, each part in turn;
      // it's all thick by the time the smoke's meant to hide anything. Every puff's always
      // moving, but there are always as many along the lane, evenly spread, so it's never thin.
      if (smoke > 0) {
        const top = onPath(spell.lane, spell.hidesTo - 0.04);
        puffs.forEach((puff, k) => {
          const column = k >= PLUME + ANCHORS;
          const anchor = !column && k >= PLUME;
          // How far along its way each is: up the column, or back down the lane from the flare.
          const order = column
            ? calm
              ? (k - PLUME - ANCHORS) / COLUMN
              : ((k - PLUME - ANCHORS) / COLUMN + seconds * POUR) % 1
            : anchor
              ? (k - PLUME) / (ANCHORS - 1)
              : calm
                ? k / PLUME
                : (((k / PLUME - seconds * ROLL) % 1) + 1) % 1;
          const start =
            spell.plantedAt + (column ? order * 0.25 : 0.25 + (1 - order) * 0.4) * SMOKE.billowMs;
          const grown = smoothstep(start, start + SMOKE.billowMs * 0.35, now) * smoke;
          if (grown <= 0) return;
          const drift = calm ? 0 : Math.sin(seconds * 0.9 + k * 1.7) * 0.12;
          const heave = calm ? 0 : Math.sin(seconds * 0.7 + k * 2.3) * 0.08;
          const swell = calm ? 1 : 1 + Math.sin(seconds * 1.3 + k * 2.1) * 0.07;
          puff.spin = calm ? k : seconds * (0.2 + (k % 3) * 0.08) * (k % 2 ? 1 : -1) + k;
          let size: number;
          // Faded in and out at the ends of its way, where another takes over.
          let ends = 1;
          if (column) {
            // From the flare up to where the plume starts, nearer the camera than the flare,
            // swelling as it rises, and twisting faster the nearer the flare.
            puff.at
              .copy(plant)
              .lerp(top, 0.05 + order * 0.95)
              .add({ x: drift * (1 - order) * 2, y: 0.35, z: 0.3 });
            size = 0.6 + order * 1.2;
            ends = smoothstep(0, 0.12, order) * (1 - smoothstep(0.8, 1, order));
            puff.spin += calm ? 0 : seconds * (1 - order) * 0.8;
          } else {
            // From just in front of the flare back to the goal, across the path things fly along.
            const p = 0.02 + order * (spell.hidesTo - 0.07);
            puff.at.copy(onPath(spell.lane, p));
            puff.at.x += drift;
            puff.at.y += heave;
            size = 1.5 + order * 0.6;
            if (!anchor) ends = smoothstep(0, 0.08, order) * (1 - smoothstep(0.92, 1, order));
          }
          // Thinning out, it spreads.
          puff.size = size * swell * (1 + clearing * 0.8);
          puff.opacity = grown * spell.density * ends;
          // Lit from inside, near the flare: brighter, and orange.
          const near = Math.max(0, 1 - puff.at.distanceTo(tip) / 2.4) ** 2 * lit;
          puff.colour
            .copy(shades[k % shades.length] ?? hot)
            .lerp(hot, near * 0.6)
            .multiplyScalar(1 + near * 0.8);
        });
      }
      draw();
    },
    warmUp: [glowSprite(disc, "#ff4a2a"), cloud.warmUp, shower.warmUp],
    dispose: () => {
      flare.removeFromParent();
      scene.remove(...added);
      for (const r of [invader, ...stewards]) {
        r.object.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose();
        });
      }
      stick.geometry.dispose();
      stick.material.dispose();
      for (const sprite of [burn, core, glare]) sprite.material.dispose();
      cloud.dispose();
      shower.dispose();
      disc.dispose();
    },
  };
};
