# Heads Up

A three-lane heading game for phones: head the footballs, dodge everything else and climb the
leaderboard. It's React and three.js, built with Vite, and its usernames and leaderboards are on
Supabase.

## Running it

You need Node 22 or later.

    npm install
    npm run dev

The dev server is reachable from a phone on the same network, which is where the game is meant to be
played. Without Supabase set up, the game plays offline as a guest.

| Command             | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | Serves the game, and the asset tools in `tools/`, with live reload      |
| `npm run build`     | Builds the game into `dist/`                                            |
| `npm test`          | Runs the game's tests, and the database's against an in-memory Postgres |
| `npm run typecheck` | Checks the types                                                        |
| `npm run format`    | Formats everything with Prettier                                        |

## Usernames and leaderboards

There's no email or password. A player picks a username, and if it's free it's theirs: they get a
token that proves it, which the game keeps on the device. The leaderboard ranks everyone by their
total XP, and each venue has a board of the best free-play scores played there.

All of it is three Postgres functions in [`supabase/migrations`](supabase/migrations), which the
game calls with the project's publishable key. The tables are in a schema the Supabase API doesn't
expose, so nothing can read or write them except through those functions.

To set it up:

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration: paste it into the project's SQL Editor, or with the
   [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
   `supabase link --project-ref <project ref>` then `supabase db push`.
3. Copy `.env.example` to `.env.local`, and fill in the project's URL and publishable key, from
   the project's **Connect** dialog or **Project Settings > API Keys**.
4. Restart `npm run dev`.

Scores and XP are whatever the game reports, within limits no real game reaches, so a determined
player could post made-up ones. Checking them would mean replaying games on the server.

## Deploying

`npm run build` makes a static site in `dist/`, which any static host serves: Vercel, Netlify,
Cloudflare Pages or GitHub Pages. Set the variables in `.env.example` in the host's build settings.
`VITE_SITE_URL` is the site's own address, for the picture a shared link shows.

## What's where

- `src/`: the game. `src/game/` is the round itself, drawn with three.js; the rest is the React
  screens around it, the levels and progression, and `online.ts`, which talks to Supabase.
- `supabase/`: the database migration, and its tests.
- `tools/`: pages the dev server serves for building the game's 3D models, kits and venue
  previews. [ASSETS.md](ASSETS.md) explains them.
- `public/`: files served as they are, like the picture a shared link shows.

## What isn't in git

Some of the game's files aren't the project's to share, so they're gitignored, and a fresh clone
plays without them:

- **The 3D models.** The player, crowd and prop models in `src/game/models/`, and the source art
  in `tools/*/in/` that they're built from, are third-party assets (Meshy, Mixamo) whose licences
  need care before they're shared. Without them the game draws its own placeholders.
  [ASSETS.md](ASSETS.md) has the steps for making your own.
- **The clubs' crests and Serie A's artwork.** They're the clubs' and the league's trademarks. Put
  your own in `src/assets/serie-a/`, named as `src/teams.ts` explains. Without them, each club's
  tile is in its colours, and the menus go without the league's mark and triangles.
- **The music.** Each venue's track in `src/game/music/` is under a licence that lets it play in the
  game but not be offered for download on its own. Without it, that venue plays in silence.
  [ASSETS.md](ASSETS.md) lists the tracks and where they're from.
