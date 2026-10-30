import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Item } from "../engine";
import type { TwistRule } from "./twist";
import { glowDisc, PLAIN, progress, type TwistContext, type TwistView } from "./view";

// Snowy Pitch: some things come over caked in snow, a ball and a snowball alike, so they all look
// the same white clump until the snow shakes off in a puff of powder and shows what's inside, with
// time enough to act on it (see twists/twist.ts). The clump hides whatever's in it completely.

/** How many flakes the snow bursts into as it shakes off, and how long they fly. */
const PUFF = { flakes: 10, ms: 450 };

const snowedOf = (item: Item) => (item.twist?.kind === "snowed" ? item.twist : undefined);

/** A rough clump of snow, bigger than anything it could be hiding. */
const clumpGeometry = () => {
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, 3);
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  geometry = mergeVertices(geometry);
  const position = geometry.getAttribute("position");
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const d = p.clone().normalize();
    const bump = Math.sin(d.x * 7.1) * Math.sin(d.y * 6.3 + 1) * Math.sin(d.z * 5.7 + 2);
    p.multiplyScalar(1 + bump * 0.12);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
};

export const snow = (context: TwistContext, rule: TwistRule): TwistView => {
  const { scene, calm } = context;
  if (rule.kind !== "snow") return PLAIN;
  const geometry = clumpGeometry();
  // Icy blue-grey, packed snow, so a clump shows against the white of the snowy pitch and sky.
  const material = new THREE.MeshStandardMaterial({ color: "#9fb6d2", roughness: 0.95 });
  const flake = new THREE.SpriteMaterial({
    map: glowDisc(),
    color: "#7f9fc9",
    transparent: true,
    depthWrite: false,
  });

  return {
    dress: (item) => {
      const snowed = snowedOf(item);
      if (!snowed) return undefined;
      const clump = new THREE.Mesh(geometry, material);
      const flakes = Array.from({ length: PUFF.flakes }, () => new THREE.Sprite(flake.clone()));
      for (const f of flakes) f.visible = false;
      scene.add(clump, ...flakes);
      const out = flakes.map((_, k) => {
        const a = (k / PUFF.flakes) * Math.PI * 2 + item.id;
        return new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8 + 0.3, 0.2);
      });
      return {
        update: (current, round, _object, at, size) => {
          const p = progress(current, round.now);
          const caked = p < snowed.until;
          clump.visible = caked && size > 0.001;
          if (clump.visible) {
            clump.position.copy(at);
            clump.scale.setScalar(size * 1.45);
            if (!calm) clump.rotation.set(round.now * 0.004, round.now * 0.003, 0);
          }
          // The snow bursts off in a puff of flakes.
          const since = round.now - (current.launchedAt + current.flightMs * snowed.until);
          const puffing = since >= 0 && since < PUFF.ms;
          for (const [k, f] of flakes.entries()) {
            f.visible = puffing;
            if (!puffing) continue;
            const t = since / PUFF.ms;
            f.position
              .copy(at)
              .addScaledVector(out[k] ?? new THREE.Vector3(), size * (0.4 + t * 1.6));
            f.scale.setScalar(size * 0.45 * (1 - t * 0.5));
            f.material.opacity = 1 - t;
          }
          return { show: !caked, glow: !caked };
        },
        dispose: () => {
          scene.remove(clump, ...flakes);
          for (const f of flakes) f.material.dispose();
        },
      };
    },
    update: () => undefined,
    warmUp: [new THREE.Mesh(geometry, material), new THREE.Sprite(flake)],
    dispose: () => {
      geometry.dispose();
      material.dispose();
      flake.map?.dispose();
      flake.dispose();
    },
  };
};
