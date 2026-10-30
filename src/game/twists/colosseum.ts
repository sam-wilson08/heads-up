import * as THREE from "three";
import type { Round } from "../engine";
import { arenaIn } from "../props/colosseum";
import { type BallColour, type TwistRule, verdictAt } from "./twist";
import { glowDisc, glowSprite, PLAIN, type TwistContext, type TwistView } from "./view";

// The Colosseum: balls come in green and red, and the emperor in his box gives his verdict with his
// thumb, up for green and down for red, which is the colour to head. The engine settles each ball's
// colour and when the emperor turns his thumb over (see twists/twist.ts); this paints the balls,
// glowing in their colour so they read from the far end, and has the emperor show his verdict. The
// verdict and the warnings of spears are on the screen too, where they can't be missed (see
// ../VerdictHud.tsx); the spears themselves come as hurdles (see ../hurdles.ts).

const COLOURS: Record<BallColour, THREE.Color> = {
  green: new THREE.Color("#35d65c"),
  red: new THREE.Color("#ff3b30"),
};

export const colosseum = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, camera, rules } = context;
  if (rule.kind !== "verdict") return PLAIN;
  const glow = glowDisc();
  // The arena's built with the rest of the venue (see ../scenery.ts).
  const arena = arenaIn(scene);

  return {
    dress: (item) => {
      const twist = item.twist;
      if (twist?.kind !== "colour") return undefined;
      const colour = COLOURS[twist.colour];
      const aura = glowSprite(glow, colour);
      aura.material.opacity = 0.6;
      scene.add(aura);
      /** Its own copies of the ball's materials, painted, made the first time it's drawn. */
      let painted: THREE.Material[] | undefined;
      return {
        update: (_current, _round, object, at, size) => {
          if (!painted) {
            const own: THREE.Material[] = [];
            object.traverse((o) => {
              if (!(o instanceof THREE.Mesh)) return;
              const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
              const copy = mesh.material.clone();
              copy.color.copy(colour);
              copy.emissive.copy(colour).multiplyScalar(0.25);
              mesh.material = copy;
              own.push(copy);
            });
            painted = own;
          }
          aura.position.copy(at);
          aura.scale.setScalar(size * 2.3);
          aura.visible = size > 0.001 && at.z < camera.position.z - 0.6;
          // The streak's rainbow would muddle its colour, so it goes without.
          return { show: true, glow: false };
        },
        dispose: () => {
          scene.remove(aura);
          aura.material.dispose();
          for (const material of painted ?? []) material.dispose();
        },
      };
    },
    update: (round: Round) => {
      const { thumb, since } = verdictAt(rule, rules.roundMs, round.now);
      arena?.verdict(thumb, since / 1000);
    },
    warmUp: [glowSprite(glow, COLOURS.green)],
    dispose: () => {
      glow.dispose();
    },
  };
};
