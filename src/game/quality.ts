// How much the game asks of the device it's on. Each round is drawn at a quality tier: the top one
// looks as the game was designed, and those below give up detail the player is least likely to
// notice, first sharpness and shadow detail, then the sun's cast shadows, which the soft blob
// shadows under everything stand in for. Phones, tablets and computers all draw at the top tier;
// only software rendering, or a GPU or device known to struggle, starts lower. The game is drawn
// cheaply enough for that: the venues' backdrops are pictures (see ./backdrop.ts), the only shadow
// that's cast is the player's, and everything that can appear is compiled and drawn behind the
// loading screen before the round starts. Nothing here changes how the game plays: only how it's
// drawn.
//
// In the address, `?quality=high` (or medium, or low) fixes the tier, and `?perf` shows the frame
// rate and what each frame draws (see ./perf.ts).

export type Tier = "high" | "medium" | "low";

const TIERS: readonly Tier[] = ["high", "medium", "low"];

export interface Quality {
  readonly tier: Tier;
  /** The most pixels drawn for each CSS pixel. A phone's screen may have three. */
  readonly pixelRatio: number;
  /** Whether edges are multisampled. It's fixed when the renderer's made, so only between rounds. */
  readonly antialias: boolean;
  /** How many texels a side the sun's shadow map has, or 0 for no cast shadows at all. */
  readonly shadowMapSize: number;
  /**
   * Whether the venue's sky, ground and lights are baked into the light shiny things reflect, or a
   * plain lit room stands in (see look.ts).
   */
  readonly bakeEnvironment: boolean;
  /** At most how many of the crowd come out on a streak. */
  readonly crowd: number;
}

const LEVELS: Readonly<Record<Tier, Quality>> = {
  // As designed: sharp on a phone's screen, with fine shadows and the whole crowd. The shadow map
  // covers only the player and the ground round them, so 1,024 texels a side is plenty.
  high: {
    tier: "high",
    pixelRatio: 2,
    antialias: true,
    shadowMapSize: 1024,
    bakeEnvironment: true,
    crowd: 28,
  },
  // Little softer on a phone, with softer-edged shadows: about half the pixels to fill.
  medium: {
    tier: "medium",
    pixelRatio: 1.5,
    antialias: true,
    shadowMapSize: 512,
    bakeEnvironment: true,
    crowd: 28,
  },
  // A third of the pixels, no multisampling and no cast shadows, and a smaller crowd.
  low: {
    tier: "low",
    pixelRatio: 1.25,
    antialias: false,
    shadowMapSize: 0,
    bakeEnvironment: false,
    crowd: 14,
  },
};

const isTier = (value: unknown): value is Tier => TIERS.includes(value as Tier);

const query = (() => {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
})();

/** `?perf`: shows the frame rate, frame time, draw calls, triangles and tier over the game. */
export const SHOW_PERF = query.has("perf");

/** `?quality=…`: a tier fixed by hand. */
const FORCED = (() => {
  const value = query.get("quality");
  return isTier(value) ? value : undefined;
})();

/** What's known about the device, for the first guess at its tier. */
export interface Device {
  /** The GPU's name, if the browser says. Safari only ever says "Apple GPU". */
  readonly gpu: string;
  readonly cores: number | undefined;
  /** In gigabytes, rounded down, where the browser says (Chrome does, Safari doesn't). */
  readonly memory: number | undefined;
}

/** Software rendering, or a GPU that's known to struggle with a scene like this one. */
const WEAK_GPU =
  /swiftshader|llvmpipe|softpipe|software|basic render|mali-[0-9t]|mali-g(31|51|52|57)\b|adreno \(tm\) [2-5]\d\d|powervr/i;
/** A first guess at the tier for a device, before any frames have been timed. */
export const guessTier = ({ gpu, cores, memory }: Device): Tier => {
  if (WEAK_GPU.test(gpu)) return "low";
  if ((memory !== undefined && memory <= 2) || (cores !== undefined && cores <= 2)) return "low";
  return "high";
};

/** The GPU's name, from a throwaway context. Empty if there's no WebGL. */
const gpuName = (): string => {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "";
  }
};

let device: Device | undefined;

/** The device the game's running on, looked at once. */
export const thisDevice = (): Device => {
  device ??= {
    gpu: gpuName(),
    cores: navigator.hardwareConcurrency || undefined,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  };
  return device;
};

let current: Quality | undefined;

/** The quality the next round is drawn at: the tier fixed in the address, or the device's guess. */
export const roundQuality = (): Quality => {
  current = LEVELS[FORCED ?? guessTier(thisDevice())];
  return current;
};

/**
 * The quality the round being built or played is drawn at, for what draws it: the renderer, the
 * lights (see look.ts) and the crowd. Before any round, the device's own.
 */
export const quality = (): Quality => current ?? roundQuality();
