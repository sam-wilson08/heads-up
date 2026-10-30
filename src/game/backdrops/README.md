# Venue backdrops

`<venue>.webp` is each venue's backdrop: its sky and everything round the pitch that stays put. Each
is a picture made for its venue with Google's Gemini and fitted to the card, its horizon at the
camera's eye height. See `src/game/backdrop.ts` for how the game draws them, and the "The venues"
section of `ASSETS.md` for how they're made and fitted.

`tools/venues/backdrops.html` paints backdrops from the venues' old procedural scenery instead.
Running it would replace these pictures.
