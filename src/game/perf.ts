import type * as THREE from "three";
import type { Quality } from "./quality";

// The numbers over the game with `?perf` in the address, to see how a phone copes: frames a
// second, how long each frame's work takes, what each frame draws, and the tier it's drawn at.
// It's plain text in a box, written twice a second, so watching costs next to nothing.

export interface PerfOverlay {
  /** Counts a frame: `ms` since the last, and `work` milliseconds of it spent on the game. */
  frame(ms: number, work: number, renderer: THREE.WebGLRenderer, quality: Quality): void;
  dispose(): void;
}

const STYLE = [
  "position:absolute",
  "left:8px",
  "bottom:max(8px, env(safe-area-inset-bottom))",
  "z-index:50",
  "padding:6px 8px",
  "border-radius:6px",
  "background:rgba(0,0,0,0.65)",
  "color:#9fffb0",
  "font:600 11px/1.35 ui-monospace,Menlo,monospace",
  "white-space:pre",
  "pointer-events:none",
].join(";");

export const perfOverlay = (parent: HTMLElement): PerfOverlay => {
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = STYLE;
  box.textContent = "perf…";
  parent.appendChild(box);
  let frames = 0;
  let span = 0;
  let work = 0;
  let worst = 0;
  return {
    frame: (ms, spent, renderer, quality) => {
      frames++;
      span += ms;
      work += spent;
      worst = Math.max(worst, ms);
      if (span < 500) return;
      const { calls, triangles } = renderer.info.render;
      const ratio = renderer.getPixelRatio();
      const size = renderer.domElement;
      box.textContent = [
        `${((frames * 1000) / span).toFixed(0)} fps  worst ${worst.toFixed(0)} ms`,
        `frame ${(span / frames).toFixed(1)} ms  work ${(work / frames).toFixed(1)} ms`,
        `${calls} draws  ${(triangles / 1000).toFixed(0)}k tris`,
        `${quality.tier}  ×${ratio}  ${size.width}×${size.height}`,
        `shadows ${quality.shadowMapSize || "off"}  aa ${quality.antialias ? "on" : "off"}  ${renderer.info.programs?.length ?? 0} shaders`,
      ].join("\n");
      frames = 0;
      span = 0;
      work = 0;
      worst = 0;
    },
    dispose: () => box.remove(),
  };
};
