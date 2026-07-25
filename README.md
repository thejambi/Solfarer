# Solfarer (web)

Wander the real stars in a browser — 2,236 real star systems of the
100-light-year Local Bubble (HYG catalog), in their true spectral colors.
Drag to pan, scroll to zoom, click a star for its card, SET COURSE to go.

Travel is honest 1g relativity, and the optional flight rides the
Lighthaul engine's relativistic optics — aberration, Doppler, beaming,
and the blueshifted CMB — over the real star field, with the twin clocks
running. AUTO TRAVEL skips the ride. A localStorage ledger keeps your
lifetime score: journeys, light-years, how much younger you are than the
universe.

The full circle: Lighthaul (web game) → Lighthaul (Pebble game) →
Lighthaul Watchface → Solfarer (watchface) → Solfarer Atlas (Pebble app)
→ back to the web.

Static site, no build step: serve the directory and open it.
`tools/make_stars_js.py` regenerates `src/stars.js` from the HYG CSV.
`src/relativity.js` is shared with the Lighthaul web game.
