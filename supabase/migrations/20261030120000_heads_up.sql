-- Heads Up online: players who sign in with just a username, the leaderboard of everyone's total XP,
-- and each venue's board of best free-play scores.
--
-- The tables live in their own schema, which the Supabase API doesn't expose, so nobody can read or
-- write them directly: the game calls the three functions at the bottom, in `public`, and those do
-- the checking. There's no email or password. A player picks a name, and if it's free it's theirs:
-- they get back a token that proves it, which the game keeps on the device. The table only keeps a
-- hash of the token, so a leaked table can't sign anyone in.
--
-- Scores and XP are whatever the game reports, up to 500,000 and 100,000,000, so a determined player
-- could post made-up ones. Checking them would mean replaying games on the server.

create schema if not exists heads_up;

-- One row per player, keyed by their name in lower case, so "Sam" and "sam" are the same player.
create table heads_up.players (
  key text primary key,
  -- The name as they typed it.
  username text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  games integer not null default 0,
  last_played_at timestamptz,
  -- All the XP they've earned, as their game last reported it, never less than it's been. Null
  -- until their first game, which keeps them off the leaderboard until then.
  xp integer,
  xp_at timestamptz,
  -- Their best game, once they've played one that scored.
  best integer,
  best_streak integer,
  headers integer,
  best_at timestamptz
);

-- The leaderboard: the most XP first, and whoever got there first ahead of a tie.
create index players_by_xp on heads_up.players (xp desc, xp_at) where xp is not null;

-- Each player's best free-play game at each venue: the venue's board. There's no list of venues,
-- so a new venue has a board as soon as the game has it.
create table heads_up.venue_bests (
  venue text not null,
  player_key text not null references heads_up.players (key) on delete cascade,
  username text not null,
  best integer not null,
  best_streak integer not null,
  headers integer not null,
  best_at timestamptz not null,
  primary key (venue, player_key)
);

create index venue_bests_by_best on heads_up.venue_bests (venue, best desc, best_at);

-- Only the functions below, which run as the tables' owner, touch the tables.
alter table heads_up.players enable row level security;
alter table heads_up.venue_bests enable row level security;

-- Names are tidied as typed: trimmed, with repeated spaces closed up.
create function heads_up.tidy_name(input text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(input, '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g')
$$;

-- What's wrong with a tidied name, or null if nothing is. The game checks the same rules (see
-- nameProblem in src/online.ts), so a mistake shows before it asks.
create function heads_up.name_problem(name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when name is null then 'Pick a username'
    when char_length(name) < 3 then 'Usernames are at least 3 characters'
    when char_length(name) > 16 then 'Usernames are at most 16 characters'
    -- Letters (any alphabet), digits, spaces, and _ - . between them.
    when name !~ '^[[:alpha:][:digit:]][[:alpha:][:digit:] _.-]*$'
      then 'Use letters, numbers, spaces, _ - and .'
    -- Words a leaderboard shouldn't show, matched anywhere once the spacing is taken out.
    when regexp_replace(lower(name), '[ _.-]', '', 'g')
      ~ '(fuck|shit|cunt|bitch|nigg|fagg|rape|nazi|wank|twat|pussy|cock|dick)'
      then 'Pick a different username'
  end
$$;

create function heads_up.hash_token(token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;

-- Claims a free name, with a new token that proves it's theirs, or signs back in to a name with its
-- token. A taken name without its token is a 409.
create function public.heads_up_sign_in(p_username text, p_token text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := heads_up.tidy_name(p_username);
  v_problem text := heads_up.name_problem(v_name);
  v_player heads_up.players;
  v_token text;
begin
  if v_problem is not null then
    raise exception using errcode = 'PT400', message = v_problem;
  end if;

  select * into v_player from heads_up.players where key = lower(v_name);
  if found then
    if p_token is null or v_player.token_hash <> heads_up.hash_token(p_token) then
      raise exception using errcode = 'PT409', message = 'That username''s taken';
    end if;
    return jsonb_build_object(
      'username', v_player.username,
      'token', p_token,
      'best', coalesce(v_player.best, 0),
      'games', v_player.games
    );
  end if;

  -- Two random UUIDs: 244 random bits.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into heads_up.players (key, username, token_hash)
  values (lower(v_name), v_name, heads_up.hash_token(v_token))
  on conflict (key) do nothing;
  -- Someone claimed it in the moment since we looked.
  if not found then
    raise exception using errcode = 'PT409', message = 'That username''s taken';
  end if;
  return jsonb_build_object('username', v_name, 'token', v_token, 'best', 0, 'games', 0);
end
$$;

-- Counts a finished game, raises the player's XP to p_xp (their total, as the game has it) if that's
-- more, and makes the game their best if it beats it. A free-play game comes with its venue, and is
-- their best there if it beats their last one there. A level's game comes with a score of 0 and no
-- venue, since its scores don't compare with free play's, but its XP still counts.
--
-- Returns { xp, rank, best, newBest, games }, and after free play
-- venue: { venue, best, newBest, rank } once they've scored there. A wrong token is a 401.
create function public.heads_up_post_score(
  p_username text,
  p_token text,
  p_score integer,
  p_best_streak integer,
  p_headers integer,
  p_xp integer,
  p_venue text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := heads_up.tidy_name(p_username);
  v_player heads_up.players;
  v_new_best boolean;
  v_venue_new_best boolean := false;
  v_venue_best integer;
  v_result jsonb;
begin
  if heads_up.name_problem(v_name) is not null or p_token is null then
    raise exception using errcode = 'PT401', message = 'Sign in to post a score';
  end if;
  if p_venue is not null and p_venue !~ '^[a-z][a-z0-9-]{1,23}$' then
    raise exception using errcode = 'PT400', message = 'That isn''t a venue';
  end if;
  if p_score is null or p_score not between 0 and 500000
    or p_best_streak is null or p_best_streak not between 0 and 10000
    or p_headers is null or p_headers not between 0 and 10000
    or p_xp is null or p_xp not between 0 and 100000000 then
    raise exception using errcode = 'PT400',
      message = 'The score, best streak, headers and XP are whole numbers a game could reach';
  end if;

  select * into v_player from heads_up.players
  where key = lower(v_name) and token_hash = heads_up.hash_token(p_token)
  for update;
  if not found then
    raise exception using errcode = 'PT401', message = 'Sign in again to post a score';
  end if;

  -- XP only ever goes up, so a device that's behind can't lower it.
  v_new_best := p_score > coalesce(v_player.best, 0);
  update heads_up.players set
    games = games + 1,
    last_played_at = now(),
    xp = greatest(xp, p_xp),
    xp_at = case when p_xp > coalesce(xp, -1) then now() else xp_at end,
    best = case when v_new_best then p_score else best end,
    best_streak = case when v_new_best then p_best_streak else best_streak end,
    headers = case when v_new_best then p_headers else headers end,
    best_at = case when v_new_best then now() else best_at end
  where key = v_player.key
  returning * into v_player;

  if p_venue is not null then
    if p_score > 0 then
      insert into heads_up.venue_bests as b
        (venue, player_key, username, best, best_streak, headers, best_at)
      values (p_venue, v_player.key, v_player.username, p_score, p_best_streak, p_headers, now())
      on conflict (venue, player_key) do update set
        username = excluded.username,
        best = excluded.best,
        best_streak = excluded.best_streak,
        headers = excluded.headers,
        best_at = excluded.best_at
      where b.best < excluded.best;
      v_venue_new_best := found;
    end if;
    select best into v_venue_best from heads_up.venue_bests
    where venue = p_venue and player_key = v_player.key;
  end if;

  v_result := jsonb_build_object(
    'xp', v_player.xp,
    'best', coalesce(v_player.best, 0),
    'newBest', v_new_best,
    'games', v_player.games
  );
  if v_player.xp > 0 then
    v_result := v_result || jsonb_build_object(
      'rank', (select count(*) + 1 from heads_up.players where xp > v_player.xp)
    );
  end if;
  if v_venue_best is not null then
    v_result := v_result || jsonb_build_object('venue', jsonb_build_object(
      'venue', p_venue,
      'best', v_venue_best,
      'newBest', v_venue_new_best,
      'rank', (
        select count(*) + 1 from heads_up.venue_bests where venue = p_venue and best > v_venue_best
      )
    ));
  end if;
  return v_result;
end
$$;

-- The players with the most XP, most first, with equal XP sharing a rank (1, 2, 2, 4), and where
-- p_me ranks once they've played. With p_venue, the best free-play games at that venue instead, as
-- { rank, username, score, bestStreak, at }.
create function public.heads_up_leaderboard(
  p_limit integer default 50,
  p_me text default null,
  p_venue text default null
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer;
  v_me_name text := heads_up.tidy_name(p_me);
  v_me_key text;
  v_entries jsonb;
  v_me jsonb;
begin
  if p_limit is null or p_limit < 1 then
    raise exception using errcode = 'PT400', message = 'The limit is a whole number from 1 to 100';
  end if;
  v_limit := least(p_limit, 100);
  if heads_up.name_problem(v_me_name) is null then
    v_me_key := lower(v_me_name);
  end if;

  if p_venue is not null then
    if p_venue !~ '^[a-z][a-z0-9-]{1,23}$' then
      raise exception using errcode = 'PT400', message = 'That isn''t a venue';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', rank,
      'username', username,
      'score', best,
      'bestStreak', best_streak,
      'at', best_at
    ) order by best desc, best_at), '[]'::jsonb)
    into v_entries
    from (
      select *, rank() over (order by best desc) as rank
      from (
        select * from heads_up.venue_bests
        where venue = p_venue
        order by best desc, best_at
        limit v_limit
      ) top
    ) ranked;

    select jsonb_build_object(
      'rank', (
        select count(*) + 1 from heads_up.venue_bests ahead
        where ahead.venue = p_venue and ahead.best > mine.best
      ),
      'username', mine.username,
      'score', mine.best,
      'bestStreak', mine.best_streak,
      'at', mine.best_at
    )
    into v_me
    from heads_up.venue_bests mine
    where mine.venue = p_venue and mine.player_key = v_me_key;

    return jsonb_build_object('venue', p_venue, 'entries', v_entries, 'updatedAt', now())
      || case when v_me is null then '{}'::jsonb else jsonb_build_object('me', v_me) end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'username', username,
    'xp', xp,
    'best', coalesce(best, 0),
    'at', xp_at
  ) order by xp desc, xp_at), '[]'::jsonb)
  into v_entries
  from (
    select *, rank() over (order by xp desc) as rank
    from (
      select * from heads_up.players
      where xp is not null
      order by xp desc, xp_at
      limit v_limit
    ) top
  ) ranked;

  select jsonb_build_object(
    'rank', (select count(*) + 1 from heads_up.players ahead where ahead.xp > mine.xp),
    'username', mine.username,
    'xp', mine.xp,
    'best', coalesce(mine.best, 0),
    'at', mine.xp_at
  )
  into v_me
  from heads_up.players mine
  where mine.key = v_me_key and mine.xp > 0;

  return jsonb_build_object('entries', v_entries, 'updatedAt', now())
    || case when v_me is null then '{}'::jsonb else jsonb_build_object('me', v_me) end;
end
$$;

-- The game calls these with the project's publishable (anon) key, and nothing else is callable.
revoke all on function
  public.heads_up_sign_in(text, text),
  public.heads_up_post_score(text, text, integer, integer, integer, integer, text),
  public.heads_up_leaderboard(integer, text, text)
from public;
grant execute on function
  public.heads_up_sign_in(text, text),
  public.heads_up_post_score(text, text, integer, integer, integer, integer, text),
  public.heads_up_leaderboard(integer, text, text)
to anon, authenticated;
