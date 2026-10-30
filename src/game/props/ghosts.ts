import * as THREE from "three";
import type { Kit } from "../../kits";
import type { Figure } from "../crowd";
import { part, seeded, solid, turned } from "./shapes";

// The crowd at the Haunted Castle: ghosts in white sheets, faintly see-through, hovering off the
// floor and casting no shadow. Some wear a scarf in the player's colours. They bob as they float,
// and for a header they swoop up, waving their arms. Each is about 1.6 m tall, facing +Z.

/** Faintly see-through, and lit by the scene, so they glow pale in the candlelight. */
const SHEET = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.7,
  transparent: true,
  opacity: 0.82,
  emissive: 0x2a3040,
});

const WHITE = [0xf4f6fb, 0xe6ecf7, 0xf7f2ea] as const;
const FACE = 0x15121c;

/** How high a ghost swoops, `since` seconds into a cheer. */
const swooping = (since: number) =>
  since > 0 && since < 0.8 ? Math.sin((since / 0.8) * Math.PI) * 0.7 : 0;

export const ghost = (i: number, kit: Kit): Figure => {
  const random = seeded(i + 40);
  const colours = [kit.shirt[0] ?? kit.trim, kit.shirt[1] ?? kit.trim] as const;
  const sheet = WHITE[Math.floor(random() * WHITE.length)] ?? WHITE[0];
  // A rounded head flowing down into a sheet, its hem rippling.
  const body = turned(
    [
      [0, 1.62],
      [0.18, 1.58],
      [0.26, 1.42],
      [0.28, 1.15],
      [0.33, 0.8],
      [0.4, 0.45],
      [0.42, 0.32],
    ],
    16,
    16,
  );
  const position = body.getAttribute("position");
  const p = new THREE.Vector3();
  for (let k = 0; k < position.count; k++) {
    p.fromBufferAttribute(position, k);
    const hem = THREE.MathUtils.smoothstep(0.7 - p.y, 0, 0.4);
    p.y += Math.sin(Math.atan2(p.z, p.x) * 6 + i) * 0.06 * hem;
    position.setXYZ(k, p.x, p.y, p.z);
  }
  body.computeVertexNormals();
  const parts = [
    part(body, sheet),
    // Big dark eyes and a mouth open in a long "oooo".
    ...[-1, 1].map((side) =>
      part(
        new THREE.SphereGeometry(0.05, 8, 6),
        FACE,
        [side * 0.09, 1.42, 0.235],
        [0, 0, 0],
        [1, 1.5, 0.5],
      ),
    ),
    part(new THREE.SphereGeometry(0.045, 8, 6), FACE, [0, 1.28, 0.25], [0, 0, 0], [1, 1.3, 0.5]),
  ];
  if (random() < 0.35) {
    for (let s = 0; s < 8; s++) {
      const ring = new THREE.TorusGeometry(0.27, 0.045, 5, 3, Math.PI / 4);
      ring.rotateZ((s * Math.PI) / 4);
      parts.push(part(ring, s % 2 ? colours[1] : colours[0], [0, 1.18, 0], [Math.PI / 2, 0, 0]));
    }
  }
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.28, 1.12, 0);
    pivot.add(
      solid([part(new THREE.CapsuleGeometry(0.07, 0.24, 3, 6), sheet, [0, -0.16, 0])], SHEET),
    );
    return { pivot, side };
  });
  const object = new THREE.Group();
  object.add(solid(parts, SHEET), ...arms.map((a) => a.pivot));
  const phase = random() * Math.PI * 2;
  return {
    object,
    bounds: { width: 0.85, bottom: 0.3, top: 1.95 },
    shadow: 0,
    pose: (seconds, since) => {
      const swoop = swooping(since);
      object.position.y = 0.25 + Math.sin(seconds * 1.6 + phase) * 0.08 + swoop;
      object.rotation.z = Math.sin(seconds * 1.1 + phase) * 0.06;
      for (const { pivot, side } of arms) {
        const wave =
          swoop > 0 ? 2.4 + Math.sin(since * 20) * 0.4 : 0.5 + Math.sin(seconds * 2 + phase) * 0.2;
        pivot.rotation.z = side * wave;
      }
    },
  };
};
