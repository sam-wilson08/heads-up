import * as THREE from "three";
import { GHOST, type Item, type Round } from "../engine";
import { type Dim, dims, fadeOf, flashAt, GLOOM, gloomAt } from "./schedule";
import { PUFF_KINDS, puffCloud } from "./smoke";
import type { TwistRule } from "./twist";
import { PLAIN, screenFrame, type TwistContext, type TwistView } from "./view";

// The Haunted Castle: the hall's lit by candles and torches, and every so often they gutter,
// smoking and shrinking for a beat, then die, and the hall drops into near darkness for a few
// seconds before they flicker back. Things thrown in the dark are still clear at first, against
// the moonlit windows, then fade from sight partway through their flight, to be headed or dodged
// from memory; nothing in the castle changes lane, so a good look early is enough (see
// twists.test.ts). Now and then lightning flashes through the windows and lights everything for a
// moment. Ghost balls come too, beside real ones: see-through, wobbling, and casting no shadow,
// which is how to tell them apart. It all comes from the round's seed (see schedule.ts). The
// castle shows things early, then takes them away.

/** How much of the hall's painted light is left with the candles out: what the moon gives it. */
const DARK_HALL = 0.22;
/** How much of each light is left with the candles out: next to nothing. */
const LEFT = { ambient: 0.12, candle: 0.05 };
/** The moonlight through the windows, which stays when the candles go, so it's never pitch black. */
const MOON = { colour: 0x9fb4ff, intensity: 0.7 };
/** How bright a flash of lightning is. */
const LIGHTNING = { colour: 0xe6efff, intensity: 3.2 };
/** How dark the screen's edges are, lit and dim. */
const VIGNETTE = { lit: 0.3, dim: 0.8 };
/** How many wisps of smoke rise from the snuffed candles. */
const WISPS = 14;

/** A dark ring round the screen's edge, as a grey alpha map: clear in the middle. */
const vignetteTexture = () => {
  const width = 64;
  const height = 96;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = Math.hypot((x / width - 0.5) * 1.3, (y / height - 0.56) * 1.05) * 2;
        const grey = Math.round(255 * THREE.MathUtils.smoothstep(d, 0.5, 1.2));
        image.data.set([grey, grey, grey, 255], (y * width + x) * 4);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  return new THREE.CanvasTexture(canvas);
};

/** On and off a few times a second, the same every time for the same moment: a guttering flame. */
const stutter = (ms: number) => (Math.sin(ms * 0.043) + Math.sin(ms * 0.091 + 1.7) > 0.3 ? 1 : 0);

/**
 * How lit the candles are at a moment, from 0 to 1: guttering in the warning, shrinking as they
 * go, out while it's dim, flickering back after.
 */
const candlesAt = (spells: readonly Dim[], now: number) => {
  const dim = spells.find((d) => now >= d.warnFrom && now < d.to + GLOOM.relightMs);
  if (!dim) return { level: 1, smoking: 0 };
  if (now < dim.from) {
    const k = (now - dim.warnFrom) / (dim.from - dim.warnFrom);
    return { level: (1 - k * 0.7) * (0.15 + 0.85 * stutter(now)), smoking: 0.4 + k * 0.6 };
  }
  if (now < dim.to) return { level: 0, smoking: 1 };
  const k = (now - dim.to) / GLOOM.relightMs;
  return { level: k * (k > 0.8 ? 1 : stutter(now * 1.3)), smoking: 1 - k };
};

/** Makes a thing see-through, by `alpha`, with materials of its own so the rest don't fade too. */
const fader = (object: THREE.Object3D) => {
  const own: { material: THREE.Material; opacity: number }[] = [];
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite)) return;
    const shape = o as THREE.Mesh;
    const materials = Array.isArray(shape.material) ? shape.material : [shape.material];
    const copies = materials.map((m) => {
      const copy = m.clone();
      copy.transparent = true;
      own.push({ material: copy, opacity: m.opacity });
      return copy;
    });
    shape.material = Array.isArray(shape.material) ? copies : (copies[0] ?? shape.material);
  });
  return {
    to: (alpha: number) => {
      for (const { material, opacity } of own) material.opacity = opacity * alpha;
    },
    dispose: () => {
      for (const { material } of own) material.dispose();
    },
  };
};

export const haunted = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, camera, rules, seed, calm } = context;
  if (rule.kind !== "haunt") return PLAIN;
  const spells = dims(rule, rules.roundMs, seed);
  const added: THREE.Object3D[] = [];

  // The scenery's lights are the candles' and torches'; the moon's and the lightning's are added.
  const lights: { light: THREE.Light; full: number; left: number }[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight)
      lights.push({ light: o, full: o.intensity, left: LEFT.ambient });
    else if (o instanceof THREE.DirectionalLight)
      lights.push({ light: o, full: o.intensity, left: LEFT.candle });
  });
  // The light the hall's surroundings give off, which goes with the candles too.
  const environment = scene.environmentIntensity;
  const moon = new THREE.DirectionalLight(MOON.colour, MOON.intensity);
  moon.position.set(2, 10, -20);
  const lightning = new THREE.DirectionalLight(LIGHTNING.colour, 0);
  lightning.position.set(-4, 12, -30);
  added.push(moon, lightning);

  // The candles and torches, and the windows the lightning flashes through.
  const flames: THREE.Sprite[] = [];
  scene.getObjectByName("candles")?.traverse((o) => {
    if (o instanceof THREE.Sprite) flames.push(o as THREE.Sprite);
  });
  const glass: THREE.MeshBasicMaterial[] = [];
  scene.getObjectByName("windows")?.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      o.material instanceof THREE.MeshBasicMaterial &&
      !glass.includes(o.material)
    ) {
      glass.push(o.material);
    }
  });
  const moonlit = glass.map((m) => m.color.clone());
  const white = new THREE.Color(0xf4f8ff);

  // The hall and the sky over it, painted as one (see ../backdrop.ts), which go dark with the
  // candles and the lightning lights up. The windows are drawn live over it, for their moonlight.
  const backdrop = scene.getObjectByName("backdrop");
  const painted =
    backdrop instanceof THREE.Mesh && backdrop.material instanceof THREE.MeshBasicMaterial
      ? backdrop.material
      : undefined;

  // Wisps of smoke from the snuffed flames, curling up and thinning away, all drawn at once.
  const smoke = puffCloud(WISPS);
  added.push(smoke.object);
  const grey = new THREE.Color(0x9a96a8);
  const wisps = Array.from({ length: WISPS }, (_, k) => ({
    at: new THREE.Vector3(),
    size: 0,
    spin: 0,
    opacity: 0,
    colour: grey,
    kind: k % PUFF_KINDS,
    stretch: 1,
  }));

  // The dark round the edges, drawn straight onto the screen over everything, so it covers it
  // exactly wherever the camera's slid to follow the player.
  const vignetteMap = vignetteTexture();
  const vignetteMaterial = new THREE.ShaderMaterial({
    uniforms: { edges: { value: vignetteMap }, opacity: { value: VIGNETTE.lit } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D edges;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(edges, vUv).r * opacity);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  // Clear in the middle, so the middle needn't be drawn at all. The picture's rows run down from
  // its top, and the screen's v up from its bottom.
  const square = screenFrame((u, v) => Math.hypot((u - 0.5) * 1.3, (0.44 - v) * 1.05) * 2, 0.5);
  const vignette = new THREE.Mesh(square, vignetteMaterial);
  vignette.renderOrder = 999;
  vignette.frustumCulled = false;
  added.push(vignette);
  scene.add(...added);

  let candleLevel = 1;
  return {
    dress: (item) => {
      if (item.kind === "hurdle") return undefined;
      const ghost = item.kind === GHOST;
      let faded: ReturnType<typeof fader> | undefined;
      return {
        // A ghost ball wobbles as it comes, never quite steady.
        move: ghost
          ? (current, round, p, path) => {
              if (p >= 1) return undefined;
              const t = round.now * 0.001;
              const wobble = calm ? 0.5 : 1;
              const air = path
                .clone()
                .add(
                  new THREE.Vector3(
                    Math.sin(t * 11 + current.id) * 0.09 * wobble,
                    Math.sin(t * 7.3 + current.id * 2) * 0.07 * wobble,
                    0,
                  ),
                );
              return { air, ground: path };
            }
          : undefined,
        update: (current: Item, round: Round, object: THREE.Object3D) => {
          const fade = fadeOf(spells, current, round.now);
          if (fade > 0 || faded) {
            faded ??= fader(object);
            faded.to(1 - fade);
          }
          return {
            show: fade < 0.99,
            // The streak's glow goes out with the candles: it'd give away a faded ball.
            glow: candleLevel > 0.5,
            // A ghost casts no shadow; a ball's fades with it.
            shadow: ghost ? 0 : 1 - fade,
          };
        },
        dispose: () => faded?.dispose(),
      };
    },

    update: (round: Round, seconds: number, dt: number) => {
      const now = round.now;
      const candles = candlesAt(spells, now);
      // Lights follow the flames quickly, but not instantly, as flames die and catch.
      candleLevel += (candles.level - candleLevel) * Math.min(1, dt * 25);
      const gloom = gloomAt(spells, now);
      const flash = flashAt(spells, now);
      for (const { light, full, left } of lights) {
        light.intensity = full * THREE.MathUtils.lerp(left, 1, candleLevel);
      }
      lightning.intensity = LIGHTNING.intensity * flash;
      scene.environmentIntensity =
        environment * (THREE.MathUtils.lerp(LEFT.ambient, 1, candleLevel) + flash * 1.5);
      for (const flame of flames) {
        flame.scale.multiplyScalar(0.25 + 0.75 * candles.level);
        flame.visible = candles.level > 0.02;
      }
      glass.forEach((material, i) => {
        const moonlight = moonlit[i];
        if (moonlight) material.color.copy(moonlight).lerp(white, flash * 0.9);
      });
      painted?.color.setScalar(THREE.MathUtils.lerp(DARK_HALL, 1, candleLevel) + flash * 1.4);

      // Smoke curls up from each flame as it gutters and goes out: thin and tall off the wick,
      // spreading and turning as it rises, and gone by the top.
      wisps.forEach((wisp, k) => {
        const flame = flames[Math.floor((k / WISPS) * flames.length)];
        wisp.opacity = 0;
        if (!flame || candles.smoking <= 0.02) return;
        const age = (seconds * 0.6 + k * 0.37) % 1;
        wisp.at
          .copy(flame.position)
          .add({ x: calm ? 0 : Math.sin(seconds * 2 + k) * 0.15 * age, y: 0.2 + age * 1.6, z: 0 });
        wisp.size = 0.3 + age * 1.3;
        wisp.stretch = 1.6 - age * 0.6;
        wisp.spin = calm ? k : (k % 2 ? 1 : -1) * age * 2.2 + k;
        wisp.opacity =
          candles.smoking * 0.8 * THREE.MathUtils.smoothstep(age, 0, 0.12) * (1 - age * 0.7);
      });
      smoke.draw(wisps, camera);

      const edges = vignetteMaterial.uniforms.opacity;
      if (edges) edges.value = THREE.MathUtils.lerp(VIGNETTE.lit, VIGNETTE.dim, gloom);
    },
    // One of everything thrown, faded: see-through, its materials need shaders of their own. And
    // a wisp of smoke.
    warmUp: [
      ...context.thrown.map((kind) => {
        const thing = context.make(kind);
        fader(thing).to(0.5);
        return thing;
      }),
      smoke.warmUp,
    ],
    dispose: () => {
      scene.remove(...added);
      smoke.dispose();
      vignetteMap.dispose();
      vignetteMaterial.dispose();
      square.dispose();
      painted?.color.setScalar(1);
    },
  };
};
