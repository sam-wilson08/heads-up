import { describe, expect, it } from "vitest";
import { flightMsAt, HIGH_REACH, type Item, JUMP_MS, LANES } from "../engine";
import {
  dims,
  DRAGON,
  dragons,
  DUST,
  dustDevils,
  fadeOf,
  flares,
  flashAt,
  GLOOM,
  gloomAt,
  LEAN,
  leanAt,
  leans,
  SHARK,
  sharkAt,
  sharks,
  SMOKE,
  smokeOf,
  SWAY,
  swayOf,
  thicknessOf,
} from "./schedule";
import { BOUNCE_AT, DRIFT_SPAN, driftSpanOf, PORTAL_LEAD, TUNING, type TwistRule } from "./twist";

// Every twist has to leave the player time to act on what it shows them, however hard it bites
// and however fast things are coming. These check the slowest of it, at the fastest flight there is.

const FASTEST = flightMsAt(1);
const STRENGTHS = [0, 0.25, 0.5, 0.75, 1];
const ROUND = 75_000;
const rule = (kind: TwistRule["kind"], s = 1): TwistRule => ({ kind, strength: [s, s] });

describe("the time each twist leaves to act", () => {
  it("leaves 600 ms after a zap to get out of the ball's way", () => {
    for (const s of STRENGTHS) expect((1 - TUNING.zap.at(s)) * FASTEST).toBeGreaterThanOrEqual(600);
  });

  it("settles a drift or a warp into its lane with time to get there", () => {
    for (const s of STRENGTHS) {
      expect((1 - TUNING.breeze.at(s) - DRIFT_SPAN) * FASTEST).toBeGreaterThanOrEqual(400);
      // A mountain gust blows things two lanes at most, which takes longer.
      expect((1 - TUNING.gale.at(s) - driftSpanOf(2)) * FASTEST).toBeGreaterThanOrEqual(400);
      expect((1 - TUNING.warp.at(s)) * FASTEST).toBeGreaterThanOrEqual(500);
      // The portals open well before the warp, so it's no surprise.
      expect(PORTAL_LEAD * FASTEST).toBeGreaterThanOrEqual(200);
    }
  });

  it("shakes the snow off in time to see what's under it", () => {
    for (const s of STRENGTHS) {
      expect((1 - TUNING.snow.until(s)) * FASTEST).toBeGreaterThanOrEqual(450);
    }
  });

  it("lets things out of the dust with half their flight to go", () => {
    for (const s of STRENGTHS) expect((1 - DUST.hidesTo(s)) * FASTEST).toBeGreaterThanOrEqual(450);
  });

  it("settles anything swaying into its lane well before it arrives", () => {
    for (const s of STRENGTHS) {
      expect((1 - SWAY.settled(s)) * FASTEST).toBeGreaterThanOrEqual(380);
      expect(SWAY.reach(s)).toBeLessThan(1);
    }
  });

  it("bites harder as it gets stronger", () => {
    expect(TUNING.zap.chance(1)).toBeGreaterThan(TUNING.zap.chance(0) * 2);
    expect(TUNING.zap.at(1)).toBeGreaterThan(TUNING.zap.at(0));
    expect(DUST.perMinute(1)).toBeGreaterThan(DUST.perMinute(0) * 2);
    expect(SWAY.reach(1)).toBeGreaterThan(SWAY.reach(0) * 2);
  });
});

describe("the dust devils", () => {
  it("spin up in the same lanes at the same times for the same seed", () => {
    expect(dustDevils(rule("dust"), ROUND, 9)).toEqual(dustDevils(rule("dust"), ROUND, 9));
    expect(dustDevils(rule("dust"), ROUND, 9)).not.toEqual(dustDevils(rule("dust"), ROUND, 10));
  });

  it("spin up slowly enough to be seen coming, and never fill every lane", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const devils = dustDevils(rule("dust"), ROUND, seed);
      expect(devils.length).toBeGreaterThan(5);
      for (const devil of devils) {
        expect(devil.from - devil.warnFrom).toBeGreaterThanOrEqual(700);
        expect(LANES).toContain(devil.lane);
      }
      for (let now = 0; now < ROUND; now += 100) {
        const thick = new Set(devils.filter((d) => thicknessOf(d, now) > 0).map((d) => d.lane));
        expect(thick.size).toBeLessThan(3);
      }
    }
  });
});

describe("the currents", () => {
  const item = (id: number): Item => ({
    id,
    kind: "ball",
    lane: 0,
    launchedAt: 30_000,
    flightMs: 1200,
  });

  it("sway things the same way every time, and differently from each other", () => {
    expect(swayOf(rule("sway"), ROUND, 3, item(5), 0.2)).toBe(
      swayOf(rule("sway"), ROUND, 3, item(5), 0.2),
    );
    const sways = [1, 2, 3, 4, 5].map((id) => swayOf(rule("sway"), ROUND, 3, item(id), 0.2));
    expect(new Set(sways).size).toBe(5);
  });

  it("keep things within reach of their lane, and settle them into it", () => {
    for (let id = 1; id <= 50; id++) {
      for (let p = 0; p <= 1; p += 0.02) {
        expect(Math.abs(swayOf(rule("sway"), ROUND, 1, item(id), p))).toBeLessThanOrEqual(
          SWAY.reach(1),
        );
      }
      expect(swayOf(rule("sway"), ROUND, 1, item(id), SWAY.settled(1))).toBeCloseTo(0, 5);
    }
  });
});

describe("the shark", () => {
  it("swims past at the same times, the same way, for the same seed", () => {
    expect(sharks(rule("sway"), ROUND, 9)).toEqual(sharks(rule("sway"), ROUND, 9));
    expect(sharks(rule("sway"), ROUND, 9)).not.toEqual(sharks(rule("sway"), ROUND, 10));
  });

  it("is seen coming, comes one at a time, and lets things out with half their flight to go", () => {
    expect((1 - SHARK.hidesTo) * FASTEST).toBeGreaterThanOrEqual(450);
    for (const s of STRENGTHS) {
      for (let seed = 1; seed <= 20; seed++) {
        const passes = sharks(rule("sway", s), ROUND, seed);
        expect(passes.length).toBeGreaterThan(0);
        // From its nose coming on at the edge of a phone held upright, 3.3 m out where it swims,
        // to reaching the lanes, swimming its fastest.
        expect(((3.3 - SHARK.lanes) / SHARK.speed(0)) * 1000).toBeGreaterThanOrEqual(350);
        for (const [i, pass] of passes.entries()) {
          expect(pass.from - pass.warnFrom).toBeGreaterThan(2000);
          expect(pass.to).toBeLessThanOrEqual(ROUND);
          const next = passes[i + 1];
          if (next) expect(next.warnFrom).toBeGreaterThan(pass.gone);
        }
      }
    }
  });

  it("swims right across, from one side to the other", () => {
    for (const pass of sharks(rule("sway"), ROUND, 4)) {
      expect(sharkAt(pass, pass.warnFrom)).toBeCloseTo(-pass.way * SHARK.reach, 5);
      expect(sharkAt(pass, pass.gone)).toBeCloseTo(pass.way * SHARK.reach, 5);
      expect(sharkAt(pass, pass.warnFrom - 1)).toBeUndefined();
      // Its nose reaches the lanes when it's due to.
      const nose = (sharkAt(pass, pass.from) ?? 0) * pass.way + SHARK.length / 2;
      expect(nose).toBeCloseTo(-SHARK.lanes, 5);
    }
  });
});

describe("the time the later stages' twists leave to act", () => {
  it("bounces a high ball off its trampoline in time to jump for it", () => {
    // From the bounce to taking off for a jump that meets it at the top, and to the last moment
    // a jump can still meet it.
    const left = (1 - BOUNCE_AT) * FASTEST;
    expect(left - JUMP_MS / 2).toBeGreaterThanOrEqual(400);
    expect(left - JUMP_MS * HIGH_REACH[0]).toBeGreaterThanOrEqual(550);
  });

  it("lets things out of the flare smoke with as long to go as the dust does", () => {
    for (const s of STRENGTHS) {
      expect((1 - SMOKE.hidesTo(s)) * FASTEST).toBeGreaterThanOrEqual(450);
      expect(SMOKE.hidesTo(s)).toBeLessThanOrEqual(DUST.hidesTo(s) + 0.03);
    }
  });

  it("gives a good look at everything thrown in the castle's gloom before it fades", () => {
    for (const s of STRENGTHS) {
      expect(GLOOM.fadeAt(s) * FASTEST).toBeGreaterThanOrEqual(400);
      expect(GLOOM.fadeAt(s) + GLOOM.fadeSpan).toBeLessThan(1);
    }
  });

  it("bites harder as it gets stronger", () => {
    expect(TUNING.bounce.chance(1)).toBeGreaterThan(TUNING.bounce.chance(0) * 2);
    expect(TUNING.ghosts.chance(1)).toBeGreaterThan(TUNING.ghosts.chance(0) * 2);
    expect(SMOKE.perMinute(1)).toBeGreaterThan(SMOKE.perMinute(0) * 2);
    expect(SMOKE.hidesTo(1)).toBeGreaterThan(SMOKE.hidesTo(0));
    expect(SMOKE.density(1)).toBeGreaterThan(SMOKE.density(0));
    expect(SMOKE.thickMs(1)).toBeGreaterThan(SMOKE.thickMs(0));
    expect(GLOOM.perMinute(1)).toBeGreaterThan(GLOOM.perMinute(0) * 2);
    expect(GLOOM.dimMs(1)).toBeGreaterThan(GLOOM.dimMs(0) * 2);
    expect(GLOOM.fadeAt(1)).toBeLessThan(GLOOM.fadeAt(0));
  });
});

describe("the pitch invaders' flares", () => {
  it("are planted at the same times in the same lanes for the same seed, and others for another", () => {
    expect(flares(rule("flare"), ROUND, 5)).toEqual(flares(rule("flare"), ROUND, 5));
    expect(flares(rule("flare"), ROUND, 5)).not.toEqual(flares(rule("flare"), ROUND, 6));
  });

  it("come with an invader running on well before the smoke's thick, one lane at a time", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const spells = flares(rule("flare"), ROUND, seed);
      expect(spells.length).toBeGreaterThan(3);
      expect(spells[0]?.warnFrom).toBeGreaterThanOrEqual(4000);
      for (const [i, spell] of spells.entries()) {
        expect(LANES).toContain(spell.lane);
        expect(spell.from - spell.warnFrom).toBeGreaterThanOrEqual(1500);
        expect(spell.plantedAt).toBeGreaterThan(spell.warnFrom);
        // It hangs a few seconds, then clears, all before the next invader runs on.
        expect(spell.to - spell.from).toBeGreaterThanOrEqual(2500);
        expect(spell.to + SMOKE.clearMs).toBeLessThan(ROUND);
        const next = spells[i + 1];
        if (next) expect(next.warnFrom).toBeGreaterThanOrEqual(spell.to + SMOKE.clearMs);
      }
      for (let now = 0; now < ROUND; now += 100) {
        expect(spells.filter((spell) => smokeOf(spell, now) > 0).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("smoke thick only once planted, then thin and clear", () => {
    const spell = flares(rule("flare"), ROUND, 3)[0];
    if (!spell) throw new Error("No flares");
    expect(smokeOf(spell, spell.plantedAt - 1)).toBe(0);
    expect(smokeOf(spell, (spell.from + spell.to) / 2)).toBe(1);
    expect(smokeOf(spell, spell.to + SMOKE.clearMs / 2)).toBeLessThan(1);
    expect(smokeOf(spell, spell.to + SMOKE.clearMs + 1)).toBe(0);
  });

  it("come more often, thicker and hiding things for longer the stronger the twist", () => {
    const all = (s: number) =>
      [1, 2, 3, 4, 5].flatMap((seed) => flares(rule("flare", s), ROUND, seed));
    expect(all(1).length).toBeGreaterThan(all(0).length * 1.8);
    expect(Math.min(...all(1).map((f) => f.density))).toBeGreaterThan(
      Math.max(...all(0).map((f) => f.density)),
    );
    expect(Math.min(...all(1).map((f) => f.hidesTo))).toBeGreaterThan(
      Math.max(...all(0).map((f) => f.hidesTo)),
    );
  });
});

describe("the castle's candles", () => {
  const spells = (seed: number, s = 1) => dims(rule("haunt", s), ROUND, seed);

  it("go out at the same times for the same seed, and others for another", () => {
    expect(spells(8)).toEqual(spells(8));
    expect(spells(8)).not.toEqual(spells(9));
  });

  it("gutter before going out, stay out a few seconds, and stay lit a while between", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const all = spells(seed);
      expect(all.length).toBeGreaterThan(3);
      for (const [i, dim] of all.entries()) {
        expect(dim.from - dim.warnFrom).toBeGreaterThanOrEqual(800);
        expect(dim.to - dim.from).toBeGreaterThanOrEqual(GLOOM.dimMs(0));
        expect(dim.to - dim.from).toBeLessThanOrEqual(GLOOM.dimMs(1));
        const next = all[i + 1];
        if (next) expect(next.warnFrom - dim.to).toBeGreaterThanOrEqual(GLOOM.restMs);
      }
    }
  });

  it("go out more often, and for longer, the stronger the twist", () => {
    const count = (s: number) => [1, 2, 3, 4, 5].reduce((n, seed) => n + spells(seed, s).length, 0);
    expect(count(1)).toBeGreaterThan(count(0) * 1.8);
  });

  it("flash with lightning only while they're out", () => {
    let flashes = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const all = spells(seed);
      for (let now = 0; now < ROUND; now += 10) {
        if (flashAt(all, now) === 0) continue;
        flashes++;
        expect(all.some((dim) => now >= dim.from && now <= dim.to)).toBe(true);
        expect(gloomAt(all, now)).toBe(0);
      }
    }
    expect(flashes).toBeGreaterThan(0);
  });

  const thrown = (launchedAt: number): Item => ({
    id: 1,
    kind: "ball",
    lane: 0,
    launchedAt,
    flightMs: FASTEST,
  });
  /** A dim with no lightning in it, so nothing lights things up again mid-test. */
  const dark = () => {
    for (let seed = 1; ; seed++) {
      const all = spells(seed);
      const dim = all.find((d) => d.lightning === undefined);
      if (dim) return { all, dim };
    }
  };

  it("show things clearly as they're thrown in the dark, then take them away", () => {
    const { all, dim } = dark();
    const item = thrown(dim.from + 300);
    const at = (p: number) => item.launchedAt + item.flightMs * p;
    expect(fadeOf(all, item, at(0.1))).toBe(0);
    expect(fadeOf(all, item, at(dim.fadeAt))).toBe(0);
    expect(fadeOf(all, item, at(dim.fadeAt + GLOOM.fadeSpan + 0.05))).toBeCloseTo(1, 5);
  });

  it("leave in sight anything already close when they go out, and anything thrown in the light", () => {
    const { all, dim } = dark();
    const close = thrown(dim.from - FASTEST * 0.7);
    expect(fadeOf(all, close, dim.from + 250)).toBe(0);
    // Long gone by the time the next dim comes, or lit all the way.
    const early = thrown(dim.warnFrom - 2 * FASTEST);
    for (let now = early.launchedAt; now < early.launchedAt + FASTEST; now += 20) {
      expect(fadeOf(all, early, now)).toBe(0);
    }
  });

  it("bring things back into sight when the lightning flashes or the candles relight", () => {
    const all = spells(1);
    const struck = all.find((d) => d.lightning !== undefined);
    if (struck?.lightning === undefined) throw new Error("No lightning");
    const item = thrown(struck.lightning - FASTEST * 0.8);
    expect(fadeOf(all, item, struck.lightning + 20)).toBe(0);
    const late = thrown(struck.to - FASTEST * 0.3);
    expect(fadeOf(all, late, struck.to + GLOOM.relightMs + 10)).toBe(0);
  });
});

describe("the Leaning Tower's lean", () => {
  const tips = (seed: number, s = 1) => leans(rule("lean", s), ROUND, seed);
  const degrees = (radians: number) => (radians * 180) / Math.PI;

  it("leans at the same times, the same ways, for the same seed, and others for another", () => {
    expect(tips(8)).toEqual(tips(8));
    expect(tips(8)).not.toEqual(tips(9));
  });

  it("creaks before going over, holds a few seconds, and stays level a while between", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const all = tips(seed);
      expect(all.length).toBeGreaterThan(3);
      expect(new Set(all.map((tip) => tip.side)).size).toBe(2);
      for (const [i, tip] of all.entries()) {
        expect(tip.from - tip.warnFrom).toBe(LEAN.warnMs);
        expect(tip.to - tip.from).toBeGreaterThanOrEqual(LEAN.overMs + LEAN.holdMs(0));
        expect(tip.to + LEAN.backMs).toBeLessThanOrEqual(ROUND - 500);
        const next = all[i + 1];
        if (next)
          expect(next.warnFrom - (tip.to + LEAN.backMs)).toBeGreaterThanOrEqual(LEAN.restMs);
      }
    }
  });

  it("jolts only towards the side it's going, then goes all the way over and back to level", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const all = tips(seed);
      for (const tip of all) {
        for (let now = tip.warnFrom; now < tip.from; now += 10) {
          const lean = leanAt(all, now) * tip.side;
          expect(lean).toBeGreaterThanOrEqual(0);
          expect(degrees(lean)).toBeLessThanOrEqual(LEAN.shudder + 1e-9);
        }
        expect(leanAt(all, tip.from + LEAN.overMs)).toBeCloseTo(tip.side * tip.angle);
        expect(leanAt(all, tip.to)).toBeCloseTo(tip.side * tip.angle);
        expect(leanAt(all, tip.to + LEAN.backMs)).toBe(0);
      }
      expect(leanAt(all, 0)).toBe(0);
      expect(leanAt(all, ROUND - 1)).toBe(0);
    }
  });

  it("goes over further, and spends longer over, the stronger the twist", () => {
    const over = (s: number) =>
      [1, 2, 3, 4, 5].reduce(
        (ms, seed) => ms + tips(seed, s).reduce((sum, tip) => sum + tip.to - tip.from, 0),
        0,
      );
    expect(over(1)).toBeGreaterThan(over(0) * 2);
    expect(degrees(Math.max(...tips(1, 1).map((tip) => tip.angle)))).toBeCloseTo(LEAN.degrees(1));
    expect(degrees(Math.max(...tips(1, 0).map((tip) => tip.angle)))).toBeCloseTo(LEAN.degrees(0));
  });
});

describe("Sakura Peak's dragon", () => {
  const passes = (seed: number, s = 1, roundMs = ROUND) => dragons(rule("gale", s), roundMs, seed);

  it("flies at the same times, the same ways, for the same seed, and others for another", () => {
    expect(passes(8)).toEqual(passes(8));
    expect(passes(8)).not.toEqual(passes(9));
  });

  it("flies its laps now and then, both ways, and leaves the sky clear a while between", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => {
      const each = passes(seed);
      expect(each.length).toBeGreaterThanOrEqual(1);
      for (const [i, pass] of each.entries()) {
        expect(pass.from).toBeGreaterThanOrEqual(4000);
        expect(pass.to - pass.from).toBeGreaterThanOrEqual(DRAGON.passMs(1));
        expect(pass.to).toBeLessThanOrEqual(ROUND - 500);
        const next = each[i + 1];
        if (next) expect(next.from - pass.to).toBeGreaterThanOrEqual(DRAGON.restMs);
      }
      return each;
    });
    expect(new Set(all.map((pass) => pass.side)).size).toBe(2);
  });

  it("lets what it hides out in front of it with half its flight to go", () => {
    expect((1 - DRAGON.hidesTo) * FASTEST).toBeGreaterThanOrEqual(450);
  });

  it("comes more often the stronger the twist", () => {
    // Over a longer round, since a pass is a good while.
    const count = (s: number) =>
      [1, 2, 3, 4, 5, 6].reduce((n, seed) => n + passes(seed, s, ROUND * 4).length, 0);
    expect(count(1)).toBeGreaterThan(count(0) * 1.5);
  });
});
