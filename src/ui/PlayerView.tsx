import { useEffect, useRef, useState } from "react";
import type { Kit } from "../kits";
import { calm, load3D } from "./studio";
import "./ui.css";

// The player in their kit, moving, drawn live by the menus' 3D studio: on the home screen keeping
// the ball up on their head, and on the Customise screen showing the back of their shirt as their
// name and number are changed. It fills the box it's put in, and is redrawn for a new size. It only
// moves while it's on the page, and not at all for a player who's asked for less motion. Without
// WebGL it's left empty.

export const PlayerView = ({
  kit,
  name,
  number,
  view,
  className,
}: {
  kit: Kit;
  name: string;
  number: number;
  /** All of them, keeping the ball up, or their back, to read the shirt by. */
  view: "keepy-ups" | "back";
  className?: string;
}) => {
  const box = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((was) =>
        was && Math.abs(was.width - width) < 1 && Math.abs(was.height - height) < 1
          ? was
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!size || size.width < 1 || size.height < 1) return undefined;
    // Whether this picture's still wanted, which can change while the player's being built.
    let live = true;
    const wanted = () => live;
    let stop: (() => void) | undefined;
    let free: (() => void) | undefined;
    void load3D().then(async (three) => {
      const element = canvas.current;
      if (!wanted() || !three || !element) return;
      const ratio = three.pixelRatio();
      const width = Math.round(size.width * ratio);
      const height = Math.round(size.height * ratio);
      const still = calm();
      const show = await three.playerShow(kit, name, number, width / height, view, still);
      if (!wanted()) {
        show.dispose?.();
        return;
      }
      free = () => show.dispose?.();
      // Sized only now, the picture's ready, so the last one shows until then.
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      let first = true;
      stop = three.play((seconds, dt) => {
        show.update(seconds, dt);
        if (three.paint(element, show) && first) {
          first = false;
          setDrawn(true);
        }
        return !still;
      });
    });
    return () => {
      live = false;
      stop?.();
      free?.();
    };
  }, [kit, name, number, view, size]);

  return (
    <span
      ref={box}
      className={["player-view", drawn ? "drawn" : "", className ?? ""].join(" ").trim()}
      aria-hidden="true"
    >
      <canvas ref={canvas} />
    </span>
  );
};
