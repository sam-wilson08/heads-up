import { useEffect, useRef, useState } from "react";
import { BallIcon } from "./icons";
import { calm, load3D } from "./studio";
import "./ui.css";

/**
 * The ball on the title screen: the game's own football, rendered in 3D and spinning. It's drawn
 * flat until three.js has loaded, and stays flat without WebGL. It only spins while it's on the
 * page, and not at all for a player who's asked for less motion.
 */
export const TitleBall = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let current = true;
    let stop: (() => void) | undefined;
    void load3D().then((three) => {
      const element = canvas.current;
      const shot = three?.titleBall();
      if (!current || !three || !element || !shot) return;
      const ratio = three.pixelRatio();
      element.width = Math.round(element.clientWidth * ratio);
      element.height = Math.round(element.clientHeight * ratio);
      const still = calm();
      let first = true;
      stop = three.play((seconds) => {
        shot.spin(still ? 0.4 : seconds);
        if (three.paint(element, shot) && first) {
          first = false;
          setDrawn(true);
        }
        return !still;
      });
    });
    return () => {
      current = false;
      stop?.();
    };
  }, []);

  return (
    <span className={drawn ? "ball-3d drawn" : "ball-3d"}>
      <BallIcon />
      <canvas ref={canvas} />
    </span>
  );
};
