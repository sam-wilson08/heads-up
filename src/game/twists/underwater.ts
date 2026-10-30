import * as THREE from "three";
import type { Lane, Round } from "../engine";
import { buildShark } from "../props/shark";
import { SHARK, sharkAt, sharks, swayOf } from "./schedule";
import type { TwistRule } from "./twist";
import { glowDisc, PLAIN, progress, type TwistContext, type TwistView } from "./view";

// Underwater: currents sway everything from side to side across the lanes as it comes, so it's
// hard to tell from the thing itself where it'll land. Its shadow on the seabed doesn't sway, so
// it always shows the lane, and stands out more than usual. Everything settles into its lane well
// before it arrives. Now and then a great white swims slowly across the pitch, in front of where
// things are thrown, and hides whatever's behind it as it passes; they come out in front of it with
// over half their flight to go. The sways and the sharks come from the round's seed (see
// schedule.ts).

export const underwater = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, rules, seed, pathAt } = context;
  if (rule.kind !== "sway") return PLAIN;
  const disc = glowDisc();
  const shade = new THREE.MeshBasicMaterial({
    color: "#02121a",
    alphaMap: disc,
    transparent: true,
    depthWrite: false,
  });
  const plane = new THREE.PlaneGeometry(1, 1);

  // The shark, if its model's loaded, and its shadow on the seabed under it.
  const passes = sharks(rule, rules.roundMs, seed);
  const shark = buildShark(SHARK.length);
  const sharkShadow = new THREE.Mesh(plane, shade.clone());
  sharkShadow.rotation.x = -Math.PI / 2;
  sharkShadow.scale.set(SHARK.length * 0.9, SHARK.length * 0.3, 1);
  sharkShadow.material.opacity = 0.45;
  if (shark) {
    shark.object.visible = sharkShadow.visible = false;
    scene.add(shark.object, sharkShadow);
  }
  const swim = (round: Round, seconds: number) => {
    if (!shark) return;
    const pass = passes.find((p) => round.now >= p.warnFrom && round.now <= p.gone);
    const x = pass && sharkAt(pass, round.now);
    shark.object.visible = sharkShadow.visible = x !== undefined;
    if (!pass || x === undefined) return;
    // Nose first the way it's going, gliding up and down a little, its body yawing to each stroke
    // of its tail, which sweeps in its shader (see props/shark.ts).
    shark.object.position.set(x, SHARK.y + Math.sin(seconds * 0.8) * 0.15, SHARK.z);
    shark.object.rotation.set(
      0,
      (pass.way > 0 ? 0 : Math.PI) + Math.sin(seconds * 6 + 0.6) * 0.05,
      Math.sin(seconds * 0.8 + 1) * 0.04,
    );
    shark.time.value = seconds;
    sharkShadow.position.set(x, 0.026, SHARK.z);
  };

  return {
    dress: (item) => {
      if (item.kind === "hurdle") return undefined;
      const shadow = new THREE.Mesh(plane, shade.clone());
      shadow.rotation.x = -Math.PI / 2;
      scene.add(shadow);
      return {
        move: (current, _round, p, path) => {
          if (p >= 1) return undefined;
          const sway = swayOf(rule, rules.roundMs, seed, current, p);
          // Towards the next lane over, or away from it past the edge lanes.
          const way = sway >= 0 ? 1 : -1;
          const next = current.lane + way;
          const air =
            next >= -1 && next <= 1
              ? path.clone().lerp(pathAt(current, next as Lane, p), Math.abs(sway))
              : path
                  .clone()
                  .lerp(pathAt(current, (current.lane - way) as Lane, p), -Math.abs(sway));
          return { air, ground: path };
        },
        update: (current, round) => {
          // Under where it'll land, darkening as it comes, until it's nearly there.
          const p = progress(current, round.now);
          const ground = pathAt(current, current.lane, Math.min(p, 1));
          shadow.position.set(ground.x, 0.025, ground.z);
          shadow.scale.setScalar(1.1);
          const near = THREE.MathUtils.clamp((-ground.z - 1.5) / 4, 0, 1);
          shadow.material.opacity = p < 1 ? 0.7 * Math.min(1, p * 5) * near : 0;
          return { show: true, glow: true, shadow: 0 };
        },
        dispose: () => {
          scene.remove(shadow);
          shadow.material.dispose();
        },
      };
    },
    update: (round, seconds) => swim(round, seconds),
    // A shark of its own, so its shader's compiled before it first swims past.
    warmUp: [buildShark(SHARK.length)?.object].filter((o) => o !== undefined),
    dispose: () => {
      if (shark) scene.remove(shark.object, sharkShadow);
      sharkShadow.material.dispose();
      shark?.object.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
      });
      disc.dispose();
      shade.dispose();
      plane.dispose();
    },
  };
};
