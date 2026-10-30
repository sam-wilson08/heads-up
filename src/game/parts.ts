import * as THREE from "three";

// Helpers for modelling the things that fly at the player out of simple shapes, shared by the
// classic decoys in ./objects and each venue's own in ./decoys.

/** Adds a shape to a group, placed, scaled and turned. */
export const part = (
  group: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number] = [1, 1, 1],
  rotation: readonly [number, number, number] = [0, 0, 0],
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
};

export const matte = (
  colour: THREE.ColorRepresentation,
  environment: THREE.Texture,
  roughness = 0.7,
) =>
  new THREE.MeshStandardMaterial({
    color: colour,
    roughness,
    envMap: environment,
    envMapIntensity: 0.5,
  });

export const metal = (
  colour: THREE.ColorRepresentation,
  environment: THREE.Texture,
  roughness = 0.3,
) =>
  new THREE.MeshStandardMaterial({ color: colour, metalness: 1, roughness, envMap: environment });
