import * as THREE from "three";

// Draws many small meshes that share a material as one: a three.js BatchedMesh for each material,
// holding a copy of every mesh's shape, placed and shown each frame where the mesh it stands for
// is. The meshes stay where they were, so whatever moves them (a cheering fan's arms, a ghost's
// sway) carries on as before, but they're no longer drawn themselves. A crowd of figures
// made of a few meshes each is then a few draw calls in all, rather than a hundred or more.

export interface Batches {
  /**
   * Copies where each mesh now is, and whether it shows, into its batch. Called once whatever
   * moves them has moved them, before the frame's drawn.
   */
  sync(): void;
}

/** The kinds of meshes a batch can stand in for: plain ones, not skinned, instanced or morphed. */
const batchable = (o: THREE.Object3D): o is THREE.Mesh<THREE.BufferGeometry, THREE.Material> => {
  if (!(o instanceof THREE.Mesh)) return false;
  const mesh = o as THREE.Mesh;
  return (
    !(mesh instanceof THREE.SkinnedMesh) &&
    !(mesh instanceof THREE.InstancedMesh) &&
    !(mesh instanceof THREE.BatchedMesh) &&
    !Array.isArray(mesh.material) &&
    // A shader of its own doesn't know how to find its place in a batch.
    !(mesh.material instanceof THREE.ShaderMaterial) &&
    Object.keys(mesh.geometry.morphAttributes).length === 0 &&
    mesh.customDepthMaterial === undefined &&
    mesh.customDistanceMaterial === undefined
  );
};

/** What a batch has to agree on: its material, its shadows, and the shape of its geometry. */
const keyOf = (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>) => {
  const { geometry } = mesh;
  const attributes = Object.entries(geometry.attributes)
    .map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}`)
    .sort()
    .join(",");
  return [
    mesh.material.uuid,
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.renderOrder,
    geometry.index ? "indexed" : "flat",
    attributes,
  ].join("|");
};

interface Batch {
  readonly mesh: THREE.BatchedMesh;
  readonly parts: readonly { readonly from: THREE.Mesh; readonly id: number; shown: boolean }[];
}

/**
 * What a mesh a batch stands for wears instead of its own material, so compiling the scene
 * doesn't compile its material a second time, unbatched, for something never drawn.
 */
const UNDRAWN = new THREE.MeshBasicMaterial({ visible: false });

const relative = new THREE.Matrix4();
const rootInverse = new THREE.Matrix4();

/**
 * Batches the meshes under `root` that share a material, where at least `least` do. The batches
 * are added to `root`, and the meshes they stand for are no longer drawn by themselves: they keep
 * their place, but not their material, which only the batch has now.
 */
export const batchMeshes = (root: THREE.Object3D, least = 2): Batches => {
  const groups = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  root.traverse((o) => {
    if (!batchable(o)) return;
    const key = keyOf(o);
    const group = groups.get(key);
    if (group) group.push(o);
    else groups.set(key, [o]);
  });

  const batches: Batch[] = [];
  for (const meshes of groups.values()) {
    const [first] = meshes;
    if (!first || meshes.length < least) continue;
    const shapes = [...new Set(meshes.map((m) => m.geometry))];
    const vertices = shapes.reduce((n, g) => n + g.getAttribute("position").count, 0);
    const indices = shapes.reduce((n, g) => n + (g.index?.count ?? 0), 0);
    const batch = new THREE.BatchedMesh(meshes.length, vertices, indices, first.material);
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    // Its copies move every frame, so its own bounds would be out of date; and it's cheaper to
    // draw a few that are off the screen than to test each one. Opaque copies needn't be sorted.
    batch.frustumCulled = false;
    batch.perObjectFrustumCulled = false;
    batch.sortObjects = first.material.transparent;
    const ids = new Map(shapes.map((g) => [g, batch.addGeometry(g)]));
    const parts = meshes.map((from) => {
      const id = batch.addInstance(ids.get(from.geometry) ?? 0);
      batch.setVisibleAt(id, false);
      // No longer drawn itself, nor casting its own shadow: the batch does both.
      from.layers.disableAll();
      from.material = UNDRAWN;
      return { from, id, shown: false };
    });
    batch.visible = false;
    root.add(batch);
    batches.push({ mesh: batch, parts });
  }

  /** The meshes showing this frame: those whose every parent up to the root is visible. */
  const showing = new Set<THREE.Object3D>();
  return {
    sync: () => {
      if (batches.length === 0) return;
      showing.clear();
      root.traverseVisible((o) => {
        showing.add(o);
      });
      root.updateMatrixWorld(true);
      rootInverse.copy(root.matrixWorld).invert();
      for (const { mesh, parts } of batches) {
        let any = false;
        for (const part of parts) {
          const shown = showing.has(part.from);
          if (shown !== part.shown) {
            mesh.setVisibleAt(part.id, shown);
            part.shown = shown;
          }
          if (!shown) continue;
          any = true;
          mesh.setMatrixAt(part.id, relative.multiplyMatrices(rootInverse, part.from.matrixWorld));
        }
        mesh.visible = any;
      }
    },
  };
};
