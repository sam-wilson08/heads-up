import * as THREE from "three";
import { arrivalOf, canReach, type Item, JUMP_MS, type Lane, progressOf } from "./engine";
import { type Dressing, glowDisc, SHOWN } from "./twists/view";

// How a skied ball is drawn: the base game's high ball, which has to be headed at the top of a
// jump. It's told apart from the moment it's thrown, and from the Funfair's trampoline balls and
// the golden ball, by three things together:
//
// - its flight: launched twice as steeply as a lob, up into the sky near the top of the screen,
//   then down into the head's place at the top of a jump, and over a player who stays down;
// - a white streak behind it, turning teal at its tail, and a white glow round it;
// - a jump pad on the grass in its lane from the moment it's thrown, with chevrons saying jump,
//   and a ring closing in on it that meets it just as it's time to jump. It's greyed out while
//   the player couldn't get up to meet it, too tired or still landing.
//
// The pad's down on the grass, where nothing flies, so it never hides anything coming in. No
// twist touches a skied ball (see engine.ts), and none hides it: it's drawn over the flare smoke,
// the dust devils and the dark round the screen's edges, so it shows from launch at every venue. The scene dresses it here rather than with the venue's twist.

/** How far above its straight line a skied ball goes, and how early in its flight it peaks. */
const SKY = { height: 7, early: 2 };
/** How much higher the head is at the top of a jump than standing: scene.ts's jump height. */
const HEAD_UP = 0.8;
/**
 * How far through its flight the jump pad's fully up: the tell. It's near enough the throw that
 * there's longer to act on it than on a trampoline's BOING (see highball.test.ts).
 */
export const SKIED_TELL = 0.06;
/** How much of its flight the streak behind it stretches back over, and how many steps it takes. */
const TRAIL = { span: 0.22, steps: 20 };
/** Drawn after the venues' smoke, dust and darkened edges, so nothing hides it. */
const OVER = 1000;
/** The jump pad, across, and how much bigger its closing ring starts. */
const PAD = { size: 1.15, ring: 2.2 };
const COLOURS = {
  ready: new THREE.Color("#ffffff"),
  tired: new THREE.Color("#6f7787"),
  head: new THREE.Color("#ffffff"),
  tail: new THREE.Color("#00e8da"),
};

const lerp = THREE.MathUtils.lerp;
const smoothstep = (edge0: number, edge1: number, x: number) =>
  THREE.MathUtils.smoothstep(x, edge0, edge1);

/** How far above the straight line from the throw to where it's met a skied ball is, `p` through. */
const riseAt = (p: number) => SKY.height * p * (1 - p) * (1 + SKY.early * (1 - p));

/**
 * Where a skied ball is, `p` through its flight, from `launch` to `meet`, the head's place at the
 * top of a jump. It covers the ground as a lob does, so it's no further off at any moment, but goes
 * up steeply, high, and down again. Past the player, it carries on over and drops away.
 */
export const skiedAt = (launch: THREE.Vector3, meet: THREE.Vector3, p: number): THREE.Vector3 => {
  const at = launch.clone().lerp(meet, p);
  at.y = lerp(launch.y, meet.y, p) + riseAt(p);
  return at;
};

/** When to jump to meet a high ball at the top of the jump: what the closing ring counts down to. */
export const jumpCueOf = (item: Item): number => arrivalOf(item) - JUMP_MS / 2;

/** A picture on a canvas. */
const canvasTexture = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/** The dark edge round the pad's white and teal, so it shows on snow as well as grass. */
const EDGE = "rgba(2, 35, 92, 0.9)";

/** A white ring with a dark edge. */
const ringTexture = (width: number) =>
  canvasTexture((ctx) => {
    ctx.beginPath();
    ctx.arc(128, 128, 116 - width / 2, 0, Math.PI * 2);
    ctx.lineWidth = width + 12;
    ctx.strokeStyle = EDGE;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  });

/** The pad: a ring, filled faintly, with two chevrons pointing up the pitch in the game's teal. */
const padTexture = () =>
  canvasTexture((ctx) => {
    ctx.beginPath();
    ctx.arc(128, 128, 104, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 232, 218, 0.22)";
    ctx.fill();
    ctx.lineWidth = 34;
    ctx.strokeStyle = EDGE;
    ctx.stroke();
    ctx.lineWidth = 20;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const y of [104, 162]) {
      ctx.beginPath();
      ctx.moveTo(80, y + 26);
      ctx.lineTo(128, y - 22);
      ctx.lineTo(176, y + 26);
      ctx.lineWidth = 40;
      ctx.strokeStyle = EDGE;
      ctx.stroke();
      ctx.lineWidth = 24;
      ctx.strokeStyle = "#00e8da";
      ctx.stroke();
    }
  });

export interface HighBallContext {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /** Whether the player has asked for less motion. */
  readonly calm: boolean;
  /** Where something on its way down `lane` is, `p` through its flight, as the scene lobs it. */
  readonly pathAt: (item: Item, lane: Lane, p: number) => THREE.Vector3;
  /** Where something meets the player in a lane: over their head. */
  readonly contactAt: (item: Item, lane: Lane) => THREE.Vector3;
  /** Builds one of the things that fly, as the game does. */
  readonly make: (kind: "ball") => THREE.Object3D;
}

export interface HighBalls {
  /** Dresses a skied ball, `object`, giving it materials of its own that nothing hides. */
  dress(item: Item, object: THREE.Object3D): Dressing;
  /** Its own shapes, to compile before the first frame so nothing stutters the first time. */
  readonly warmUp: readonly THREE.Object3D[];
  dispose(): void;
}

export const buildHighBalls = (context: HighBallContext): HighBalls => {
  const { scene, camera, calm, pathAt, contactAt } = context;
  const padMap = padTexture();
  const ringMap = ringTexture(14);
  const disc = glowDisc();
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const halo = new THREE.SpriteMaterial({
    map: disc,
    color: "#eefaff",
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const streak = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  // The ball's own materials, copied once for every skied ball: without fog, so the dark doesn't
  // hide it, and drawn among the see-through things, after the smoke, dust and darkened edges.
  const copies = new Map<THREE.Material, THREE.Material>();
  const ownMaterial = (material: THREE.Material) => {
    let copy = copies.get(material);
    if (!copy) {
      copy = material.clone();
      if ("fog" in copy) copy.fog = false;
      copy.transparent = true;
      copies.set(material, copy);
    }
    return copy;
  };
  const adopt = (object: THREE.Object3D) =>
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mesh = o as THREE.Mesh;
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(ownMaterial);
      else mesh.material = ownMaterial(mesh.material);
      mesh.renderOrder = OVER;
    });

  /** Something flat on the grass, lit by nothing, so it shows the same in the dark. */
  const onGrass = (map: THREE.Texture) => {
    const mesh = new THREE.Mesh(
      flat,
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false }),
    );
    mesh.renderOrder = OVER;
    return mesh;
  };

  const toCamera = new THREE.Vector3();
  const along = new THREE.Vector3();
  const side = new THREE.Vector3();
  const tint = new THREE.Color();

  const warmBall = context.make("ball");
  adopt(warmBall);
  // A streak's colours have their own alpha, and it has no normals, both of which its shader's
  // compiled for, so the warm-up's is the same.
  const warmShape = new THREE.PlaneGeometry(1, 1);
  warmShape.deleteAttribute("normal");
  warmShape.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Float32Array(4 * 4).fill(1), 4),
  );
  const warmStreak = new THREE.Mesh(warmShape, streak);
  const warmPad = onGrass(padMap);
  const warmUp = [warmBall, warmStreak, warmPad, new THREE.Sprite(halo)];

  return {
    dress: (item, object) => {
      adopt(object);
      const lane = item.lane;
      const launch = pathAt(item, lane, 0);
      const contact = contactAt(item, lane);
      const meet = contact.clone().add(new THREE.Vector3(0, HEAD_UP, 0));
      const pathTo = (p: number) => skiedAt(launch, meet, p);

      const glow = new THREE.Sprite(halo);
      glow.renderOrder = OVER;
      // The streak: a ribbon along the path behind it, turned to face the camera each frame.
      const points = TRAIL.steps + 1;
      const positions = new Float32Array(points * 2 * 3);
      const colours = new Float32Array(points * 2 * 4);
      const index: number[] = [];
      for (let i = 0; i < TRAIL.steps; i++) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const shape = new THREE.BufferGeometry();
      const position = new THREE.BufferAttribute(positions, 3);
      const colour = new THREE.BufferAttribute(colours, 4);
      shape.setAttribute("position", position);
      shape.setAttribute("color", colour);
      shape.setIndex(index);
      const trail = new THREE.Mesh(shape, streak);
      trail.renderOrder = OVER;
      // It moves every frame, so its bounds never hold for long.
      trail.frustumCulled = false;

      // The pad, on the grass where the player stands in its lane, and the ring closing in on it.
      const pad = onGrass(padMap);
      const closing = onGrass(ringMap);
      for (const mark of [pad, closing]) mark.position.set(contact.x, 0.03, 0);
      closing.position.y = 0.035;
      scene.add(glow, trail, pad, closing);

      const cue = jumpCueOf(item);
      const arrival = arrivalOf(item);
      const ribbon = (current: Item, p: number, size: number, fade: number) => {
        for (let i = 0; i < points; i++) {
          const k = i / TRAIL.steps;
          const q = Math.max(0, p - TRAIL.span * k);
          const at = pathTo(q);
          along.copy(pathTo(q + 0.01)).sub(at);
          toCamera.copy(camera.position).sub(at);
          side.crossVectors(along, toCamera).normalize();
          // Tapering to nothing at its tail, fading, and turning teal.
          const half = size * 0.45 * (1 - k) ** 0.7;
          positions.set([at.x + side.x * half, at.y + side.y * half, at.z + side.z * half], i * 6);
          positions.set(
            [at.x - side.x * half, at.y - side.y * half, at.z - side.z * half],
            i * 6 + 3,
          );
          const alpha = 0.95 * (1 - k) ** 1.2 * fade * Math.min(1, p / 0.04);
          tint.copy(COLOURS.head).lerp(COLOURS.tail, Math.min(1, k * 1.6));
          colours.set([tint.r, tint.g, tint.b, alpha, tint.r, tint.g, tint.b, alpha], i * 8);
        }
        position.needsUpdate = true;
        colour.needsUpdate = true;
        trail.visible = current.outcome !== "header" && fade > 0;
      };

      return {
        // Off the throw steeply, high over its lane, and down into the head's place at the top of
        // a jump. Headed, it flies off as any header does; let go, it carries on over the head.
        move: (current, _round, p) => {
          if (p >= 1 && current.outcome === "header") return undefined;
          const air = pathTo(p);
          return { air, ground: new THREE.Vector3(air.x, 0, air.z) };
        },
        update: (current, round, _object, at, size) => {
          const now = round.now;
          const p = progressOf(current, now);
          const since = now - arrival;
          glow.position.copy(at);
          glow.scale.setScalar(size * 2.6);
          glow.visible = size > 0.001;
          ribbon(current, Math.min(p, 1.15), size, since > 0 ? Math.max(0, 1 - since / 200) : 1);

          // The pad comes up with the throw, and goes once the ball's arrived: springing out
          // under a header, fading under one that's gone over.
          const shown = smoothstep(0, SKIED_TELL, p);
          const headed = current.outcome === "header";
          const gone = since <= 0 ? 1 : Math.max(0, 1 - since / (headed ? 260 : 180));
          const pop = since > 0 && headed ? 1 + since / 250 : 1;
          // Grey while the player couldn't get up to it: too tired, or still landing.
          const ready = since > 0 || canReach(round, arrival);
          const strength = (ready ? 1 : 0.6) * shown * gone;
          // A gentle pulse, and a flash as the closing ring meets it: jump now.
          const toCue = now - cue;
          const flash = !calm && toCue >= 0 && toCue < 180 ? Math.sin((toCue / 180) * Math.PI) : 0;
          const pulse = calm ? 1 : 1 + 0.04 * Math.sin(now * 0.012);
          pad.scale.setScalar(PAD.size * (pulse + flash * 0.22) * pop);
          pad.material.color.copy(ready ? COLOURS.ready : COLOURS.tired);
          pad.material.opacity = strength;
          // The ring closes in from the throw, and meets the pad just as it's time to jump.
          const closed = THREE.MathUtils.clamp(
            (now - current.launchedAt) / (cue - current.launchedAt),
            0,
            1,
          );
          closing.scale.setScalar(PAD.size * lerp(PAD.ring, 1, closed));
          closing.material.color.copy(ready ? COLOURS.ready : COLOURS.tired);
          closing.material.opacity = strength * (closed < 1 ? 0.95 : 0);
          pad.visible = strength > 0.01;
          closing.visible = pad.visible && closed < 1;
          return SHOWN;
        },
        dispose: () => {
          scene.remove(glow, trail, pad, closing);
          shape.dispose();
          pad.material.dispose();
          closing.material.dispose();
        },
      };
    },
    warmUp,
    dispose: () => {
      for (const copy of copies.values()) copy.dispose();
      copies.clear();
      warmStreak.geometry.dispose();
      warmPad.material.dispose();
      flat.dispose();
      halo.dispose();
      streak.dispose();
      for (const texture of [padMap, ringMap, disc]) texture.dispose();
    },
  };
};
