// Each venue's own music, looping while a round's played there and faded out at the whistle. The
// menus are silent. A venue's track goes in ./music, named by its id (Sakura Peak's is fuji.m4a),
// and only the one for the venue being played is loaded. A venue without one plays in silence.
//
// Browsers only let a page start making sound from a tap or a key, and a round starts when its
// loading's done, not on a tap, so the first tap or key anywhere on the page starts the audio,
// ready for the first round (see listenForFirstTap). Muting is remembered on the device.

import type { VenueId } from "../venues";

const URLS = import.meta.glob<string>("./music/*.{m4a,mp3}", {
  query: "?url",
  import: "default",
  eager: true,
});

/** Each venue's track, by its id. */
const TRACKS = new Map(
  Object.entries(URLS).map(([path, url]) => [path.replace(/^.*\/|\.\w+$/g, ""), url]),
);

/** How loud the music plays, under whatever else, and how long it fades in and out, in seconds. */
const VOLUME = 0.55;
const FADE_IN = 0.8;
const FADE_OUT = 1.6;
/** How long it takes to go when the player quits, or starts again. */
const CUT = 0.3;

const MUTED_KEY = "heads-up:muted";

/** The page's audio, once a tap or a key has started it, and the volume everything goes through. */
let audio: { context: AudioContext; volume: GainNode } | undefined;

const loadMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
};
let muted = loadMuted();

const start = () => {
  if (!audio) {
    const context = new AudioContext();
    const volume = context.createGain();
    volume.gain.value = muted ? 0 : VOLUME;
    volume.connect(context.destination);
    audio = { context, volume };
  }
  // A phone call or another app can interrupt it, so every tap starts it again if it's stopped.
  if (audio.context.state !== "running" && !document.hidden) void audio.context.resume();
};

/**
 * Starts the page's audio on the first tap or key, and again after anything's interrupted it, and
 * pauses it while the page is hidden. Call it once, as the page loads.
 */
export const listenForFirstTap = (): void => {
  for (const type of ["pointerup", "touchend", "click", "keydown"]) {
    window.addEventListener(type, start, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (!audio) return;
    if (document.hidden) void audio.context.suspend();
    else void audio.context.resume();
  });
};

/** Whether a venue has music, so there's something to mute. */
export const hasMusic = (venue: VenueId): boolean => TRACKS.has(venue);

export const isMuted = (): boolean => muted;

/** Mutes the music, or brings it back, and remembers which on this device. */
export const setMuted = (value: boolean): void => {
  muted = value;
  try {
    localStorage.setItem(MUTED_KEY, value ? "1" : "0");
  } catch {
    // Not remembered this time.
  }
  if (!audio) return;
  const { context, volume } = audio;
  volume.gain.setTargetAtTime(value ? 0 : VOLUME, context.currentTime, 0.05);
};

/** The last venue's track, decoded, kept for the next round there. One at a time: they're big. */
let kept: { venue: VenueId; track: Promise<AudioBuffer | undefined> } | undefined;

const trackFor = (venue: VenueId): Promise<AudioBuffer | undefined> => {
  if (kept?.venue === venue) return kept.track;
  const url = TRACKS.get(venue);
  const track = (async () => {
    if (!url) return undefined;
    const data = await (await fetch(url)).arrayBuffer();
    // Decoding wants the page's audio, which a tap has always started by now: the one on play.
    start();
    return audio?.context.decodeAudioData(data);
  })().catch((error: unknown) => {
    console.warn(`Couldn't load the music for ${venue}`, error);
    return undefined;
  });
  kept = { venue, track };
  return track;
};

export interface Music {
  /** Starts it, fading in, as soon as it's loaded: at kick-off. */
  readonly play: () => void;
  /** Fades it out: at the whistle. */
  readonly fade: () => void;
  /** Stops it quickly, unless it's already fading out: when the round's left. */
  readonly stop: () => void;
}

/** A round's music at a venue, which starts loading straight away, while the round does. */
export const musicFor = (venue: VenueId): Music => {
  const track = trackFor(venue);
  let playing: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
  let over = false;
  const fadeOut = (seconds: number) => {
    over = true;
    if (!playing) return;
    const { source, gain } = playing;
    const now = gain.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    source.stop(now + seconds);
    playing = undefined;
  };
  return {
    play: () => {
      void track.then((buffer) => {
        if (!buffer || !audio || over || playing) return;
        const { context, volume } = audio;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, context.currentTime);
        gain.gain.linearRampToValueAtTime(1, context.currentTime + FADE_IN);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain).connect(volume);
        source.start();
        playing = { source, gain };
      });
    },
    fade: () => fadeOut(FADE_OUT),
    stop: () => {
      if (!over) fadeOut(CUT);
    },
  };
};
