import { useEffect, useState } from "react";
import type * as ThreeModule from "./three";

// Loads the menus' 3D when it's first wanted, so the title screen opens before three.js arrives.
// Until it has, and wherever there's no WebGL, the menus show flat pictures instead.

export type Three = typeof ThreeModule;

let loading: Promise<Three | undefined> | undefined;
let loaded: Three | null | undefined;

/** The 3D studio, or undefined if it can't be had: no WebGL, or the download failed. */
export const load3D = (): Promise<Three | undefined> => {
  loading ??= import("./three")
    .then((three) => {
      loaded = three.studio() ? three : null;
      return loaded ?? undefined;
    })
    .catch((error: unknown) => {
      console.warn("Couldn't load the menus' 3D, so they're drawn flat", error);
      loaded = null;
      return undefined;
    });
  return loading;
};

/** The 3D studio: undefined while it loads, null if there isn't one. */
export const use3D = (): Three | null | undefined => {
  const [three, setThree] = useState(loaded);
  useEffect(() => {
    let current = true;
    void load3D().then((value) => {
      if (current) setThree(value ?? null);
    });
    return () => {
      current = false;
    };
  }, []);
  return three;
};

const pictures = new Map<string, string>();

/**
 * A picture the studio takes, by what it's of: its image address once it's ready, or undefined
 * until then (and for good, if it can't be taken). A picture already taken shows straight away.
 */
export const usePicture = (
  key: string,
  take: (three: Three) => Promise<string | undefined>,
): string | undefined => {
  const [url, setUrl] = useState(() => pictures.get(key));
  useEffect(() => {
    const known = pictures.get(key);
    setUrl(known);
    if (known) return undefined;
    let current = true;
    void load3D()
      .then((three) => (three ? take(three) : undefined))
      .then((taken) => {
        if (!taken) return;
        pictures.set(key, taken);
        if (current) setUrl(taken);
      });
    return () => {
      current = false;
    };
    // Only the key: it says what the picture is of, and `take` is only how.
  }, [key]);
  return url;
};

/** Whether the player has asked for less motion. */
export const calm = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
