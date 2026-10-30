import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The migration, run on a real Postgres (PGlite, in memory), and called as the game calls it: as
// Supabase's anon role, through the three functions, with errors turned into HTTP statuses the way
// Supabase's API turns them (PT409 is a 409).

const MIGRATIONS = join(__dirname, "migrations");

const setup = async () => {
  const db = new PGlite();
  // Supabase has these roles already.
  await db.exec("create role anon nologin; create role authenticated nologin;");
  for (const file of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await db.exec("set role anon");
  return db;
};

type Db = Awaited<ReturnType<typeof setup>>;

const rpc = async (db: Db, fn: string, args: Record<string, unknown> = {}) => {
  const names = Object.keys(args);
  const params = names.map((name, i) => `${name} => $${i + 1}`).join(", ");
  try {
    const { rows } = await db.query<{ result: Record<string, any> }>(
      `select public.${fn}(${params}) as result`,
      names.map((name) => args[name] ?? null),
    );
    return { status: 200, body: rows[0]?.result ?? {} };
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    const status = code?.startsWith("PT") ? Number(code.slice(2)) : 400;
    return { status, body: { error: message } as Record<string, any> };
  }
};

const signIn = (db: Db, username: unknown, token?: string) =>
  rpc(db, "heads_up_sign_in", { p_username: username, p_token: token });

const signUp = async (db: Db, username: string) =>
  (await signIn(db, username)).body.token as string;

const post = (
  db: Db,
  game: {
    username: string;
    token: unknown;
    score: unknown;
    bestStreak?: unknown;
    headers?: unknown;
    xp: unknown;
    venue?: unknown;
  },
) =>
  rpc(db, "heads_up_post_score", {
    p_username: game.username,
    p_token: game.token,
    p_score: game.score,
    p_best_streak: game.bestStreak ?? 0,
    p_headers: game.headers ?? 0,
    p_xp: game.xp,
    p_venue: game.venue,
  });

const leaderboard = (db: Db, query: { limit?: number; me?: string; venue?: string } = {}) =>
  rpc(db, "heads_up_leaderboard", {
    p_limit: query.limit ?? 50,
    p_me: query.me,
    p_venue: query.venue,
  });

describe("usernames", () => {
  it("tidies spacing, and keeps the case typed while matching any case", async () => {
    const db = await setup();
    const { body } = await signIn(db, "  Sam   Wilson ");
    expect(body.username).toBe("Sam Wilson");
    expect((await signIn(db, "sam wilson")).status).toBe(409);
  });

  it("turns away names too short, too long, oddly made or rude", async () => {
    const db = await setup();
    for (const name of ["ab", "x".repeat(17), "!bang", "<script>", "f.u.c.k", "a#b", undefined]) {
      expect((await signIn(db, name)).status).toBe(400);
    }
    expect((await signIn(db, "Zoë_99")).status).toBe(200);
  });
});

describe("signing in with just a username", () => {
  it("gives a free name to whoever asks, with a token that proves it", async () => {
    const { status, body } = await signIn(await setup(), "Header");
    expect(status).toBe(200);
    expect(body).toMatchObject({ username: "Header", best: 0, games: 0 });
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("won't give a taken name to anyone else, whatever its case", async () => {
    const db = await setup();
    await signUp(db, "Header");
    const { status, body } = await signIn(db, "HEADER");
    expect(status).toBe(409);
    expect(body.error).toBe("That username's taken");
    expect((await signIn(db, "header", "x")).status).toBe(409);
  });

  it("signs a player back in with their token", async () => {
    const db = await setup();
    const token = await signUp(db, "Header");
    const { status, body } = await signIn(db, "header", token);
    expect(status).toBe(200);
    expect(body).toMatchObject({ username: "Header", token });
  });

  it("explains what's wrong with a name it won't take", async () => {
    const { status, body } = await signIn(await setup(), "ab");
    expect(status).toBe(400);
    expect(body.error).toMatch(/at least 3/);
  });
});

describe("posting scores", () => {
  const game = (token: unknown, score: unknown, xp: unknown) => ({
    username: "Header",
    token,
    score,
    bestStreak: 9,
    headers: 31,
    xp,
  });

  it("puts a player on the board with their XP, and makes a scoring game their best", async () => {
    const db = await setup();
    const token = await signUp(db, "Header");
    const { status, body } = await post(db, game(token, 1200, 1500));
    expect(status).toBe(200);
    expect(body).toEqual({ xp: 1500, rank: 1, best: 1200, newBest: true, games: 1 });
  });

  it("only ever raises a player's XP, and keeps their best when a later game scores less", async () => {
    const db = await setup();
    const token = await signUp(db, "Header");
    await post(db, game(token, 1200, 1500));
    expect((await post(db, game(token, 300, 900))).body).toEqual({
      xp: 1500,
      rank: 1,
      best: 1200,
      newBest: false,
      games: 2,
    });
    expect((await post(db, game(token, 0, 2100))).body).toMatchObject({
      xp: 2100,
      best: 1200,
      games: 3,
    });
  });

  it("turns away a game without the player's token", async () => {
    const db = await setup();
    await signUp(db, "Header");
    expect((await post(db, game("not theirs", 99999, 99999))).status).toBe(401);
    expect((await post(db, game(undefined, 99999, 99999))).status).toBe(401);
  });

  it("turns away scores and XP that aren't whole numbers, or are beyond any real game", async () => {
    const db = await setup();
    const token = await signUp(db, "Header");
    for (const score of [-1, 1.5, 500_001, undefined]) {
      expect((await post(db, game(token, score, 10))).status).toBe(400);
    }
    for (const xp of [-1, 2.5, 100_000_001, undefined]) {
      expect((await post(db, game(token, 10, xp))).status).toBe(400);
    }
  });
});

describe("the leaderboard", () => {
  const withPlayers = async (xps: Record<string, number>) => {
    const db = await setup();
    for (const [username, xp] of Object.entries(xps)) {
      const token = await signUp(db, username);
      await post(db, { username, token, score: 100, bestStreak: 2, headers: 5, xp });
    }
    return db;
  };

  it("lists players with the most XP first, with equal XP sharing a rank", async () => {
    const db = await withPlayers({ Ana: 500, Ben: 900, Cal: 500, Dee: 100 });
    const { status, body } = await leaderboard(db);
    expect(status).toBe(200);
    expect(
      body.entries.map((e: { username: string; rank: number; xp: number }) => [
        e.rank,
        e.username,
        e.xp,
      ]),
    ).toEqual([
      [1, "Ben", 900],
      [2, "Ana", 500],
      [2, "Cal", 500],
      [4, "Dee", 100],
    ]);
    expect(body.entries[0]).toMatchObject({ best: 100, at: expect.any(String) });
    expect(body.updatedAt).toEqual(expect.any(String));
    expect(body.me).toBeUndefined();
  });

  it("leaves out players who haven't played yet", async () => {
    const db = await withPlayers({ Ana: 500 });
    await signUp(db, "Newbie");
    expect((await leaderboard(db)).body.entries).toHaveLength(1);
    expect((await leaderboard(db, { me: "newbie" })).body.me).toBeUndefined();
  });

  it("says where a player ranks when they're beyond the top of the list", async () => {
    const db = await withPlayers({ Ana: 500, Ben: 900, Cal: 300 });
    const { body } = await leaderboard(db, { limit: 1, me: "cal" });
    expect(body.entries).toHaveLength(1);
    expect(body.me).toMatchObject({ rank: 3, username: "Cal", xp: 300 });
  });

  it("checks the limit", async () => {
    expect((await leaderboard(await setup(), { limit: 0 })).status).toBe(400);
  });
});

describe("each venue's free-play board", () => {
  /** Plays a free-play game at a venue, or with no venue, as a level's game is posted. */
  const play = (db: Db, username: string, token: string, score: number, venue?: unknown) =>
    post(db, {
      username,
      token,
      score,
      bestStreak: Math.round(score / 100),
      headers: 10,
      xp: 1000,
      venue,
    });

  const board = (db: Db, venue: string, me?: string) =>
    leaderboard(db, { venue, limit: 2, ...(me ? { me } : {}) });

  it("makes a free-play game a player's best at its venue, and says where it ranks there", async () => {
    const db = await setup();
    const ana = await signUp(db, "Ana");
    const ben = await signUp(db, "Ben");
    await play(db, "Ben", ben, 3000, "beach");
    const first = await play(db, "Ana", ana, 1200, "beach");
    expect(first.body.venue).toEqual({ venue: "beach", best: 1200, newBest: true, rank: 2 });
    const better = await play(db, "Ana", ana, 4000, "beach");
    expect(better.body.venue).toEqual({ venue: "beach", best: 4000, newBest: true, rank: 1 });
    const worse = await play(db, "Ana", ana, 900, "beach");
    expect(worse.body.venue).toEqual({ venue: "beach", best: 4000, newBest: false, rank: 1 });
  });

  it("keeps each venue's board to the games played there", async () => {
    const db = await setup();
    const ana = await signUp(db, "Ana");
    await play(db, "Ana", ana, 1200, "beach");
    await play(db, "Ana", ana, 800, "moon");
    expect((await board(db, "beach")).body.entries).toMatchObject([{ score: 1200 }]);
    expect((await board(db, "moon")).body.entries).toMatchObject([{ score: 800 }]);
    expect((await board(db, "snow")).body.entries).toEqual([]);
  });

  it("leaves a game without a venue, or that didn't score, off the venues' boards", async () => {
    const db = await setup();
    const ana = await signUp(db, "Ana");
    expect((await play(db, "Ana", ana, 1200)).body.venue).toBeUndefined();
    expect((await play(db, "Ana", ana, 0, "park")).body.venue).toBeUndefined();
    expect((await board(db, "park")).body.entries).toEqual([]);
    // Once they've a best there, a game that didn't score still says what it is.
    await play(db, "Ana", ana, 500, "park");
    expect((await play(db, "Ana", ana, 0, "park")).body.venue).toEqual({
      venue: "park",
      best: 500,
      newBest: false,
      rank: 1,
    });
  });

  it("lists a venue's best games first, ties sharing a rank, and where `me` is past the list", async () => {
    const db = await setup();
    for (const [username, score] of [
      ["Ana", 500],
      ["Ben", 900],
      ["Cal", 500],
    ] as const) {
      await play(db, username, await signUp(db, username), score, "volcano");
    }
    const { status, body } = await board(db, "volcano", "cal");
    expect(status).toBe(200);
    expect(body.venue).toBe("volcano");
    const at = expect.any(String);
    expect(body.entries).toEqual([
      { rank: 1, username: "Ben", score: 900, bestStreak: 9, at },
      { rank: 2, username: "Ana", score: 500, bestStreak: 5, at },
    ]);
    expect(body.me).toEqual({ rank: 2, username: "Cal", score: 500, bestStreak: 5, at });
    expect((await board(db, "volcano", "dee")).body.me).toBeUndefined();
  });

  it("turns away a venue that isn't one", async () => {
    const db = await setup();
    const ana = await signUp(db, "Ana");
    for (const venue of ["", "Park", "venue#park", "x"]) {
      expect((await play(db, "Ana", ana, 100, venue)).status).toBe(400);
    }
    expect((await board(db, "park#all")).status).toBe(400);
  });
});

describe("what the game's key can reach", () => {
  it("can't read or write the tables, or call anything but the three functions", async () => {
    const db = await setup();
    await signUp(db, "Header");
    for (const sql of [
      "select * from heads_up.players",
      "update heads_up.players set xp = 1",
      "select heads_up.hash_token('x')",
    ]) {
      await expect(db.query(sql)).rejects.toThrow(/permission denied/);
    }
  });
});
