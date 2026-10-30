# Heads Up's player: Meshy to the game

Heads Up draws a simple placeholder footballer until a real model exists. To use a real one, save
it as `src/game/models/player.glb`, and the next build picks it up.

`player.glb` is gitignored. It's built from a third-party asset whose licence needs care before
it's shared, so each person keeps their own copy. A deploy from a machine without it falls back to
the placeholder. If the file fails to load, the game falls back the same way and logs a warning in
the browser console.

## 1. Make the player in Meshy

Any textured footballer works, standing upright and facing forward. The game only bends the player
sideways at the waist, so a pose that looks good still works best, with the arms by the sides or
the hands on the hips. Download it as **FBX**; the textures come as PNG files beside it.

Free-plan models are licensed CC BY 4.0: credit Meshy wherever the game is published with it.
Don't use real club badges, sponsors or a real player's likeness.

## 2. Build player.glb

1. Put Meshy's files in `tools/player/in/` (gitignored), renamed to `player.fbx`, `basecolor.png`,
   `normal.png`, `roughness.png` and `metallic.png`.
2. Start the dev server:

       npm run dev

3. Open `http://localhost:5173/tools/player/build.html`. It downloads `player.glb`, and shows the
   player from the front, back and side so you can check it.
4. Move `player.glb` to `src/game/models/`.

The build page merges Meshy's duplicated vertices, applies its colour, normal, roughness and metal
maps, and caps textures at 1024 px. The result is about 2 MB.

## 3. Animate it in Mixamo (optional)

With a player rigged and animated in Mixamo, the player stands ready, steps into each lane and
jumps with their own legs, crouches to duck, and falls over when they're knocked out. Without one,
the game bends and lifts the player whole.

1. Mixamo can reject Meshy's FBX with "unable to map your existing skeleton", although it has no
   skeleton. Convert it to an OBJ first, zipped the way Mixamo expects:

       python3 tools/player/fbx_to_obj.py tools/player/in/player.fbx tools/player/in/basecolor.png player.zip

2. On mixamo.com, click **Upload Character**, choose the zip, and place the markers on the chin,
   wrists, elbows, knees and groin.
3. Download an idle, a sidestep, a jump, a crouch, a fall and a headbutt, each as **FBX Binary**,
   **With Skin**, at **30** frames per second, and save them in `tools/player/in/` as `idle.fbx`,
   `walk.fbx`, `jump.fbx`, `crouch.fbx`, `fall.fbx` and `header.fbx`, beside Meshy's four
   textures. The player uses Mixamo's **Ready Idle**, **Side Step**, **Jumping**, **Standing To
   Crouched**, **Falling Down** and **Headbutt**. **Crouched To Standing** and **Illegal
   Headbutt** work too: the build page plays a crouch that comes up out of it backwards. A step or
   a fall either way works, since the build page mirrors each for the other side, and so does a
   step with **In Place** ticked, since it tells the way from how the feet swing.

   The player comes from `idle.fbx`. The other clips play on its skeleton by the bones' names, so a
   clip downloaded for an earlier player in Mixamo still works. The current player's `jump.fbx` is
   the yellow player's (see the backups below): download **Jumping** for this player to replace it.

4. With the dev server running, open `http://localhost:5173/tools/player/build-animated.html`. It
   downloads `player.glb`, and shows the player standing, then each clip from behind.
5. Move `player.glb` to `src/game/models/`.

The build page makes the model the game's size, 1.8 m tall and standing on the origin. It merges
Mixamo's duplicated vertices and applies Meshy's maps. It makes nine clips, in place but for the
falls, since the game moves the player itself:

- `idle`: the idle, with the feet kept where they stand, to loop while the player stands still.
- `step_left`: the sidestep, to the player's left.
- `step_right`: the same sidestep, mirrored.
- `jump`: only the time in the air, with the lowest foot kept on the ground for the game to lift.
- `jump_mirrored`: the same jump, mirrored, so the arms and legs swing the other way.
- `header`: the headbutt cut down to the nod, from just before the head is furthest forward until
  it's back, and only from the spine up, so the legs carry on with whatever they're doing.
- `duck`: the crouch, from standing down into it, played backwards if Mixamo's comes up out of it.
  A crouch can step as it goes, so it keeps the feet where they stand, rather than the hips.
- `fall_right`: the fall, back and to the player's right. It keeps its travel, since the player
  ends up lying where they land.
- `fall_left`: the same fall, mirrored.

The result is about 4 MB.

## How the game uses the player

- **Size and facing:** it's scaled to 1.8 m tall, stood on the ground and turned to face the goal,
  whatever size and facing Meshy gave it. Meshy's players face the camera, so it's turned round.
- **Leaning:** the game gives it a two-bone skeleton, hips and spine, that bends at the waist,
  1 m up (`WAIST` in `src/game/player.ts`). The legs stay planted and the upper body leans into
  the lane. Arms hanging down past the waist go with the shoulders: below the bend they come away
  from the body as pieces of their own, which follow the spine. A player with a much higher or
  lower waist needs `WAIST` changing to match.
- **Jumping:** the whole player is lifted up to 0.8 m and squashes a little on landing, so the
  model needs no animation of its own.
- **Shirt:** the player's name and number are printed across their upper back, centred about
  1.3 m up, so the name sits just under the collar (`SHIRT_BACK` in `src/game/player.ts`).
- **Kits:** a shader repaints the model's own kit in the one the player picks (`src/kits.ts`). It
  finds the kit by colour, so the model needs Italy's kit: a **blue** shirt with a **white**
  collar, white shorts and blue socks. It tells them apart by height (`HEIGHT` in
  `src/game/kit.ts`). Blue is the socks up to 0.53 m, and the shirt above 1.02 m. White is the
  shorts from 0.64 m, above the boots' white stripes, to the waistband at 1.1 m, then the shirt's
  creases, then the collar above 1.37 m. Below the shirt, white is only kit within 0.3 m of the
  middle, short of the hands hanging beside the shorts. Nothing above 1.57 m, the neck, is kit,
  so the whites of the eyes aren't painted. Where the blue blurs into the white, at the waist and
  the collar, the new colours blur into each other too. A player built differently needs those
  colours and heights changing to match: open `http://localhost:5173/tools/player/analyse.html`
  to see which colours sit at which heights on the model in `tools/player/in/`.

A player animated in Mixamo (step 3) is used a little differently:

- **Size:** it isn't rescaled, because the build page already made it 1.8 m tall.
- **Standing:** it loops `idle` at its own pace whenever it isn't doing anything else, from
  kick-off.
- **Steps:** it plays `step_left` or `step_right` over 0.3 s each time it moves lane.
- **Jumping:** it plays `jump` in time with the game's jump, while the game lifts it, taking turns
  with `jump_mirrored` so no two jumps in a row look the same.
- **Heading:** each time it heads the ball it plays `header` over 0.55 s, over the top of
  whatever else it's doing, standing, stepping or jumping.
- **Ducking:** it plays `duck` down and back up in time with the game's duck, at the Colosseum and
  Sunny Park.
- **Falling:** knocked out by a blow to the head, it plays `fall_left` or `fall_right`, the way the
  blow sends it, and the camera eases back and down to see it land. Tripped over a hurdle, it's
  still pitched forwards whole.
- **Blending:** it blends into each clip from the idle, and back into it again.
- **Leaning:** the lean bends its spine bones (`Spine`, `Spine1` and `Spine2`) rather than the
  two-bone skeleton.
- **Older models:** a `player.glb` built before `idle`, `duck` and the falls stands in the model's
  own pose, bows from the waist to duck, bending the same spine bones, and is toppled whole when
  knocked out.
- **Shirt:** its name and number are skinned to the shirt, so they move with it.

The earlier players are kept in `tools/player/` (all gitignored):

- **The first,** a cartoon in a gold shirt and socks with black shorts and trim, in
  `cartoon-backup/`. Going back to it needs the gold and black detection in `kit.ts`, and its
  waist (0.6 m) and shirt (1.06 m) heights, restored too.
- **The second,** in red with green trim, with its Mixamo clips, in `portugal-backup/`.
- **The third,** in a yellow shirt with black shorts and trim, with its Mixamo clips, in
  `yellow-backup/`.

The second and third each have their `player.glb` and the `kit.ts` that finds their colours kept
with them: going back to one needs its `player.glb` copied to `src/game/models/` and its `kit.ts`
over `src/game/kit.ts`.

## Check it in the game

With the dev server running, open `http://localhost:5173/tools/kits/preview.html` to see the
player in every kit, from behind, leaning and from the front. Check that the stripes stay on the
shirt and the shorts and socks change colour, with no kit colour on the skin or hair.

Then open `http://localhost:5173` and play. Check that the player faces the goal, leans left and
right without their legs moving, and has their name and number on their back. With an animated
player, check that they step into each lane and jump with their arms up, and stand again between
moves.

## The crowd's fans

The fans who come out to watch a streak, at every venue whose crowd is people, are copies of two
Meshy models, a man, `src/game/models/fan.glb`, and a woman, `src/game/models/fan-woman.glb`
(both gitignored). Seven in ten are the woman, shuffled through the crowd the same way each game
(`WOMEN` and `fanAt` in `src/game/fans.ts`). With only one of them, the crowd's all that one; with
neither, they're built from shapes, as the penguins, aliens and robots still are.

1. Make the fan in Meshy, in an A-pose, about 5,000 triangles: set the polycount, or remesh it,
   before texturing, so the texture's painted on the final shape. The game repaints its blue in the
   kit's main colour and its white above the waist in the kit's second, so a blue shirt and a blue
   and white scarf over darker jeans and white trainers works best.
2. Rig it in Meshy and add one animation, a cheer, then download it as FBX, With Skin, at 30 fps.
3. Put the FBX in `tools/crowd/in/fan/` (gitignored) as `fan.fbx`, with its textures renamed to
   `basecolor.png`, `normal.png`, `roughness.png` and `metallic.png`.
4. With the dev server running, open `http://localhost:5173/tools/crowd/build-fan.html`. It
   downloads `fan.glb`: 1.75 m tall, its fingers' bones gone, its pictures capped at 512 px and its
   clip called `cheer`. About 600 KB.
5. Move `fan.glb` to `src/game/models/`.

The woman's made the same way, from `tools/crowd/in/fan-woman/fan-woman.fbx` and her textures, by
`build-fan.html?figure=fan-woman`, into `fan-woman.glb`. She stands 1.68 m in the game to the man's
1.75 m. Meshy left her at 280,000 triangles, so she was simplified to 5,500 afterwards, keeping
her skin and cheer:

```sh
npx @gltf-transform/cli simplify fan-woman.glb fan-woman.glb --ratio 0.0196 --error 0.01
```

That blurs her face a little up close, which no one sees from the pitch; making her again at
5,000 triangles in Meshy, before texturing, would keep it sharp.

`http://localhost:5173/tools/crowd/fan.html` shows the fan up close and as a crowd of 28 from the
game's camera, in any kit, with the frame rate and draw calls; it reads `tools/crowd/in/fan/`.

In the game (`src/game/fans.ts`), each fan's a copy of the one model, a draw call each, drawn
about the player's size (the crowd makes room for it). Each cheers in its own time, never in step
with the rest: a cheer at its own speed, then a pause of its own, swaying a little in the cheer's
first pose. Its skeleton's only posed when that changes, so a fan between cheers costs nothing.

## The venues' props

Each venue can have one Meshy model of its own, standing in copies behind the goal line either
side, framing the goal: a tree at the park, palms at the beach, pines in the snow, a lunar lander
on the Moon (`src/game/props/models.ts` says which, where and how tall). Each is
`src/game/models/prop-<name>.glb` (gitignored); a venue without its file is as it was, and the
beach keeps its own palms.

1. Make it in Meshy 6 (Text to 3D) at about 5,000 triangles, textured, standing upright on its
   own, with no text or logos, and download it as GLB.
2. Put it in `tools/props/in/` (gitignored), renamed to the prop's name, like `park-tree.glb`.
3. With the dev server running, open `http://localhost:5173/tools/props/build.html` (or
   `?only=park-tree` for one). It downloads `prop-<name>.glb` for each: 1 m tall, standing on the
   origin, its pictures capped at 512 px, about 500 KB. Only the props that should glow (the
   rock's lava, the pylon's neon) keep Meshy's glow map, since Meshy gives everything one, and a
   glow ignores the venue's light.
4. Move the files to `src/game/models/`.

At the Beach the palms bend over the way each gust blows, and spring back once it's passed (see
`src/game/twists/beach.ts`).

### The shark

Underwater, a great white now and then swims slowly across the pitch, 15 m out and up where things
are lobbed through, and hides whatever's behind it as it passes; things come out in front of it
with over half their flight to go. When it swims and which way come from the round's seed, and
its tail sweeps as it goes, bent in its shader (see `SHARK` in `src/game/twists/schedule.ts`,
`src/game/twists/underwater.ts` and `src/game/props/shark.ts`). It's
`src/game/models/prop-shark.glb` (gitignored); without it, there's no shark.

1. Make it in Meshy, textured, at about 7,000 triangles, and download it as FBX: a zip of the
   `.fbx` and its colour, normal, roughness and metallic pictures.
2. Put them in `tools/props/in/shark/` (gitignored) as `shark.fbx`, `colour.png`, `normal.png`,
   `roughness.png` and `metallic.png`.
3. With the dev server running, open `http://localhost:5173/tools/props/shark.html`. It downloads
   `prop-shark.glb`: lying along +X, nose first, 1 m long, its pictures capped at 512 px, about
   1 MB. Its pictures show it from the side and above; if the nose isn't on the right, try
   `?turnY=` with another turn, in radians.
4. Move it to `src/game/models/`.

### The dragon

On Sakura Peak, a long pink Japanese dragon flies laps of the sky, close across the throws and away
round above Fuji, and hides whatever's behind it as it passes. It's Meshy's model, made dead
straight, and bent along its flight in its shader: each frame the game works out its spine, where
its head's been and a slow wave rolling down it, and moves each point of the model from its place
along the straight dragon to the same place along the spine (see `DRAGON` in
`src/game/twists/schedule.ts`, `src/game/twists/dragon.ts` and `src/game/props/dragon.ts`). It's
`src/game/models/prop-dragon.glb` (gitignored); without it, the dragon's built from shapes.

1. Make it in Meshy 7.1 from a side-view picture (Image to 3D), since Text to 3D squashes something
   this long and thin: one straight line, head to tail, with its back up, the legs small and close
   under it and nothing coiled, crossing or reaching far out, so it bends cleanly. Remesh it to
   about 20,000 triangles before downloading it as GLB, textured but not rigged.
2. Put it in `tools/props/in/dragon/` (gitignored) as `dragon.glb`.
3. With the dev server running, open `http://localhost:5173/tools/props/dragon.html`. It downloads
   `prop-dragon.glb`: straight along +X, head first, its back up, 1 m long, its colour capped at
   2048 px and its normal map at 1024, both JPEG, about 3 MB. Its pictures show it from the side
   and from above; if the head isn't on the right, try `?turnY=` with another turn, in radians.
4. Move it to `src/game/models/`.

## The venues

Each venue's backdrop is a picture in `src/game/backdrops/`: its sky and everything round the
pitch that stays put while a round's played, from the hills and trees to the stands and their
crowds. In the game it's one flat card standing just behind the goal, unlit, so the whole backdrop
costs one draw and no shading (see `src/game/backdrop.ts`). What moves, or what a venue's twist
needs, is still drawn live in front of it: the castle's torches and candelabras, the emperor, the
flares, the octopus, the kelp and the shark, the beach's palms, the fair's bunting and lights, the
snow. Candles out and the lightning dim or flash the backdrop with the rest of the light.

The picture's ground carries on in front of the card as its floor, `<venue>-floor.webp`: a second
picture, laid on the ground from the card's foot to just behind the player, cut so that from the
camera it lines up with the card's picture exactly. It covers the pitch, so the ground is the
picture's own all the way to the horizon, and only the pitch's chalk, the goal's shadow and the
player's own are drawn over it (see `src/game/ground.ts`). Its ground nearest the camera is the
picture's nearest strip, mirrored strip by strip, so it's always ground.

A venue can have its backdrop in two layers: its sky and far distance as `<venue>-far.webp`, on a
card ten times as far off and that much bigger, so from the camera it covers just what the near
card does, and everything nearer as `<venue>.webp`, cut out round its scenery, so the far one shows
through. As the camera moves, the near scenery slides across the far, as near things do. Each pair
is made in Gemini from the venue's one picture: a far plate, with the nearer scenery taken out and
the sky carried on where it was, and a near layer, with the sky and distance replaced by a flat
key colour (magenta, or green where the scenery's pink). The key's cut out, the fringe it leaves
round everything taken out and the edges pulled in three pixels, then both are fitted to the card
with the same horizon, and the floor's made from the near layer. Sunny Park, the Beach, Snowy
Pitch, the Moon, Underwater, the Volcano, Mars and Space Stadium are in two layers; the rest are
one picture.

The pictures are made for each venue with Google's Gemini: an ultra-wide 21:9 picture, 3,168 by
1,344 pixels, at eye level from the pitch, with nothing in the bottom middle, where the goal
stands. Each is fitted to the card with its horizon (where the ground meets the far scenery) at
the camera's eye height, scaled to cover the card's full height, which makes it 35 to 60 metres
wide: more than a phone or a desktop's game sees. Past its sides it's reflected, for the widest
screens. The menus' venue pictures look no further than 17 metres either side of the middle, so
they stay within it (see `src/ui/three/subjects.ts`). Where a venue draws something live over its
picture's scenery, it's placed where the picture has it: the castle's flames on its torches
(`PICTURED_TORCHES` in `props/castle.ts`). A new picture needs them placing again.

Each picture is 2,048 by 880 pixels and kept under 200 KB, its quality lowered until it is. It
holds three parts of the card side by side: the middle, as fine as a phone held upright needs, and
either side of it, more coarsely, which only a wider screen shows. Each floor picture is 2,048 by
1,174 pixels, in the same three parts, and kept under 160 KB. A venue without a picture has its
sky drawn instead, and without a floor picture, its pitch is drawn as it was.

At the Leaning Tower the whole screen leans over, up to 14 degrees (see `src/game/twists/pisa.ts`).
On a phone held upright that stays within the card, but on a laptop's wide screen it swings the
top corners up past the card's top, where the picture's own sky carries on as a flat colour, and
the lower corners past the floor picture's near edge onto the pitch. So the Leaning Tower's picture
needs plain sky along its top, and its pitch colours in `venues.ts` match its lawn as it's lit.
Its picture is one layer for now: Gemini's far plate, with the tower and the sky, 16:9 rather than
21:9, which makes it 38.5 metres wide.

Sakura Peak stands on the edge of a cliff: the ground ends 2.2 metres in front of the player
(`ledge` in `venues.ts`), and past it there's a sheer drop to a sea of cloud, with Fuji across it.
Its picture is Gemini's far plate of the summit's scene, Fuji and the cloud with the summit taken
out, fitted with its horizon where the cloud meets Fuji's foot and scaled up until it reaches the
cliff's edge in the floor, which makes it 56 metres wide. Its floor picture is the cloud out to the
edge, then a jagged lip of weathered rock with the cliff's face in shade past it, and the summit's
grass from the full picture this side of it, reflected to and fro from the middle for the sides.
On a cliff, nothing in the air casts a shadow, the player's ends at the edge, no crowd comes, and
the grass laid over the floor stops short of the lip (see `grassOverFloor` in
`src/game/ground.ts`). The blossom on the slopes sways in the wind, and bows the way a gust blows
(see `src/game/twists/sakura.ts`). It's picked out by its pink in the shader, so nothing else in
the picture can be pink: its sky is blue and gold. It has no goal. The pink dragon that flies over
now and then is built in code, not a picture (see `src/game/twists/dragon.ts`).

The backdrops used to be painted from the venues' own scenery, built in 3D from the code in
`src/game/props/` (`backdrop.ts`, `stands.ts` and the rest), by
`http://localhost:5173/tools/venues/backdrops.html` with the dev server running. Painting them
again would replace the pictures; `?venue=park,moon` paints only some.

Each venue's light is set in `src/game/look.ts`: the sun (or floodlights, candles or lava) that
shapes the player from behind and to one side, a light from in front that edges them, the sky's and
ground's light all round, the haze, and the exposure. Only the player casts a shadow as they play;
the goal's is painted into the pitch, and everything else has a soft shadow under it. The venue's
sky and surroundings are baked into an environment map when the round loads, for everything shiny
to reflect. The picture goes through Khronos's neutral tone mapping, which keeps kit colours true.

So what's drawn in 3D sits in each backdrop picture rather than on it, the venue takes its colours
from the picture: its sky, the haze along its horizon and its ground, sampled when it loads (see
`pictureColours` in `src/game/backdrop.ts`). They colour the light from the sky and the ground, what
shiny things reflect, and the haze, which fades the goal and the far crowd a little into the
horizon, as the picture's own nearest things are. Each venue's sun comes from the side its
picture is lit from, so the player's shadow falls the way the picture's shadows do. A new picture
lit from the other side needs its `key` (and `rim`) turning round in `look.ts`.

With the dev server running, open `http://localhost:5173/tools/venues/preview.html` to see every
venue as the game draws it on a phone, a few seconds into a round, with things in flight. The
page's own text lists its options: one venue or a few, how far into the round, another screen
size, another kit, a quality tier, the stand-in player, and the player knocked out. Each picture's
caption gives its draw calls, for keeping an eye on how much each venue costs to draw.

## The music

Each venue can have a track of its own, which loops while a round's played there and fades out at
the whistle; the menus are silent (see `src/game/music.ts`). It's `src/game/music/<venue id>.m4a`,
loaded only when that venue's played. A venue without one plays in silence, and the mute button
only shows where there's music.

Tracks are free ones, under a licence that allows them in a game without paying: Pixabay's own
licence (no credit needed, but never offered for download on their own) or CC0. A CC BY track
needs a credit in the game, which there's nowhere for yet. Keep each track's page and licence
below. The tracks are gitignored: a public repository would offer them for download on their own.

1. Download the MP3 from its page.
2. Find its beats: decode it to WAV (`afconvert -f WAVE -d LEI16@44100 in.mp3 in.wav`) and find
   when its first and last notes start, to the millisecond, and so its tempo.
3. Cut a loop from a downbeat early on to the same place in the bar near the end, before the
   track's ending, a few milliseconds before each note starts, crossfading the last 20 ms of the
   loop into what comes just before its start, so it wraps round unbroken. Starting on a downbeat,
   the music hits at kick-off.
4. Encode it: `afconvert -f m4af -d aac -b 96000 -q 127 loop.wav <venue id>.m4a`, about 1.3 MB for
   a hundred seconds. Browsers trim AAC's own silence off each end, so the loop stays seamless.
   Keep tracks about as loud as each other: Sakura Peak's is about -21.5 dBFS.

| Venue       | Track                                                                                                                     | Licence                                     | Loop                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------ |
| Sakura Peak | [Natsu-Matsuri, HarumachiMusic](https://pixabay.com/music/world-natsu-matsuri-fun-japanese-shamisen-366769/), 30 Oct 2026 | Pixabay, on YouTube's Content ID, no credit | 1.394–105.858 s, 108 bpm |

## The link preview

`public/preview.jpg` is the picture a shared link shows in WhatsApp, Slack, iMessage and the like,
set by the `og:` tags in `index.html`. It's 1200 × 630, kept under 300 KB, since WhatsApp leaves
out bigger pictures. It's the Final venue drawn by the game at 680 × 630, the gold kit about to head
a ball, with the title beside it over the middle of a floodlit pitch, as the title screens have
it. WhatsApp and the others keep a link's picture for a while, so a changed one can take days to
show on a link already shared. The tags give the picture's full address, since that's all the
previews take, so they change if the site moves to another domain.

## Serie A branding

The menus are dressed in Serie A's brand from `src/assets/serie-a/`:

- **The league's mark:** `serie-a.png`, made from Serie A's logo with its white background taken out and the "SERIE A" wordmark turned white, so it reads on the dark menus. The A and the tricolour bar keep their colours.
- **The triangles:** `triangles.png`, faded in across the top of the menus.
- **The five clubs' crests:** `juventus.svg`, `milan.png`, `inter.webp`, `roma.webp` and `napoli.svg`, each shown on a white tile.

A new player picks one of those clubs as soon as they have a name (`src/teams.ts`,
`src/ui/TeamPicker.tsx`). Its kit is theirs from the start, and its crest shows beside their
name.

The kits are named for Serie A clubs (`src/kits.ts`). The lettering is Montserrat, the nearest
open font to Serie A's own, bundled in `src/assets/fonts/` under the SIL Open Font License.

The league's mark and the crests are Serie A's and the clubs' trademarks. Check they're cleared
for wherever the game's shared.
