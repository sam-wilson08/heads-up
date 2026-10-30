import * as THREE from "three";

// Textures the scene draws for itself on a canvas, rather than loading image files.

const canvasTexture = (
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  colour = true,
): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * One repeat of a goal net's mesh, measured in the sides of its hexagons: three across and root
 * three down. The texture squeezes it into a square, so whatever uses it scales it back out.
 */
export const NET_TILE = { across: 3, down: Math.sqrt(3) };

/**
 * A goal net's mesh of hexagons, as an alpha map: white cord on black. Blending cords into black
 * keeps their colour for the material to set, so from far off the net fades rather than greys.
 */
export const netTexture = (): THREE.Texture => {
  const size = 256;
  const texture = canvasTexture(
    size,
    size,
    (ctx) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, size, size);
      // Drawn in hexagon sides. Squeezing the pen with the drawing keeps the cord the same
      // thickness all round once the net scales the tile back out.
      ctx.scale(size / NET_TILE.across, size / NET_TILE.down);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.16;
      ctx.lineJoin = "round";
      // Flat-topped hexagons in columns 1.5 sides apart, every other column half a hexagon down.
      // Those around the edges are drawn too, for the parts that wrap round into the tile.
      for (let column = -1; column <= 2; column++) {
        for (let row = -1; row <= 1; row++) {
          const x = column * 1.5;
          const y = (row + (column % 2 ? 0.5 : 0)) * NET_TILE.down;
          ctx.beginPath();
          for (let corner = 0; corner < 6; corner++) {
            const angle = (corner * Math.PI) / 3;
            ctx.lineTo(x + Math.cos(angle), y + Math.sin(angle));
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    },
    false,
  );
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

/** A soft round shadow, dark in the middle and fading out. */
export const shadowTexture = (): THREE.Texture =>
  canvasTexture(64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.5)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });

/** A round glow, for floodlights, stars and the like. */
export const glowTexture = (): THREE.Texture =>
  canvasTexture(64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.25, "rgba(255, 255, 255, 0.6)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });

/**
 * A soft ring of rainbow, its colour going round it, faintly filled in the middle: the glow round
 * a football on a streak. Each pixel keeps its colour however faint, and the texture's
 * premultiplied, so its edges don't darken as it shrinks into the distance.
 */
export const rainbowTexture = (): THREE.Texture => {
  const size = 128;
  const texture = canvasTexture(size, size, (ctx) => {
    const image = ctx.createImageData(size, size);
    const colour = new THREE.Color();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / (size / 2) - 1;
        const dy = (y + 0.5) / (size / 2) - 1;
        const r = Math.hypot(dx, dy);
        const ring =
          THREE.MathUtils.smoothstep(r, 0.3, 0.58) * (1 - THREE.MathUtils.smoothstep(r, 0.62, 1));
        const alpha = Math.max(ring, 0.18 * (1 - THREE.MathUtils.smoothstep(r, 0, 0.6)));
        colour.setHSL((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, 1, 0.58, THREE.SRGBColorSpace);
        colour.convertLinearToSRGB();
        const i = (y * size + x) * 4;
        image.data[i] = Math.round(colour.r * 255);
        image.data[i + 1] = Math.round(colour.g * 255);
        image.data[i + 2] = Math.round(colour.b * 255);
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  texture.premultiplyAlpha = true;
  return texture;
};

/** The player's name and number, for the back of the shirt. */
export const shirtTexture = (name: string, number: number): THREE.Texture =>
  canvasTexture(512, 512, (ctx) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(20, 28, 48, 0.85)";
    ctx.lineJoin = "round";

    const label = name.trim().toUpperCase();
    let size = 76;
    ctx.font = `800 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.letterSpacing = "6px";
    while (ctx.measureText(label).width > 470 && size > 28) {
      size -= 2;
      ctx.font = `800 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    }
    ctx.lineWidth = 10;
    ctx.strokeText(label, 256, 110);
    ctx.fillText(label, 256, 110);

    // As big as fits on the flat of the back. Any wider and a pair of digits reaches round the sides,
    // where the shirt turns away and the decal smears them.
    const digits = String(number);
    ctx.letterSpacing = "0px";
    size = 300;
    ctx.font = `800 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    while (ctx.measureText(digits).width > 340 && size > 200) {
      size -= 10;
      ctx.font = `800 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    }
    ctx.lineWidth = 16;
    ctx.strokeText(digits, 256, 330);
    ctx.fillText(digits, 256, 330);
  });
