# The L Game

Edward de Bono's two-player blocking game, from his 1967 book _The Five-Day Course in Thinking_, with a computer opponent that has solved the game, a four-player battle on a collapsing 6 by 6 floor, a moving-tiles variant, T-piece variants, position codes and a move tree. It started as a single-file Claude artifact and runs as static assets on a Cloudflare Worker at l-game.motlin.com.

## Layout

`index.html` is the markup and `src/styles/game.css` the stylesheet. `src/main.ts` starts each part of the game in the order the artifact's inline scripts ran, each on its own so a failure in one leaves the rest working, then registers the service worker.

`src/game/` is the game:

- `piece.ts` reads which game the page plays (the L game, the T game or L vs T), and `variant.ts` rewords the page for the other two and wires the switch between them.
- `storage.ts` maps setting keys to the piece's own keys. The T game and L vs T keep their 2-player settings, stats, saved games and game in progress under `tgame1-*` and `ltgame-*`, and everything else under the shared `lgame-*` keys. The artifact did this by patching `Storage.prototype`; the keys read and written are the same.
- `geometry.ts` holds board geometry shared by every game: turning squares, piece placements and outlines. `view.ts` holds the view (flat or 3D, turned how far) and the board-turn animation, `iso.ts` draws any board in 3D, `art.ts` the hammers and the odds bar, `modes.ts` switches between the three games, and `errors.ts` shows the error bar.
- `classic/` is the 2-player game. `rules.ts` builds the placements, positions and position codes for one piece, `solver.ts` solves every position, and `state.ts` holds the game in play. `game.ts` runs the game, the computer player, hints and drawing; `tree.ts` is the move tree, `lose.ts` the ways to lose and the solver's facts (with the finish frequencies in `common.ts`), `tutorial.ts` the first-match lesson, `codes.ts` the code guide and decoder, `colors.ts` the names and colors, and `mini.ts` the small boards they all draw.
- `battle/` is the 4-player battle: `rules.ts` its placements and codes, `game.ts` the match, its computer players and drawing, `art.ts` statues and the crumbling floor, and `guide.ts` the strategy guide's pictures.
- `tiles/` is Moving Tiles: `floor.ts` the moving floor and `game.ts` the rest.

`tests/unit/game.test.ts` checks the move counts from each opening, the solved position counts, that each opening is a draw, and that every position's code reads back. `tests/browser/play.spec.ts` plays a move against the computer, opens the battle and switches to the T game.

## Installing and playing offline

The game installs from the browser as a standalone app and plays offline. `src/pwa/manifest.ts` holds the manifest and the fixed files the service worker keeps, and `src/pwa/worker.ts` its logic. `scripts/service-worker-build.ts` builds `src/pwa/sw.ts` to `dist/sw.js`, writes `dist/manifest.webmanifest`, and versions the worker's cache with a hash of everything it keeps, so each deploy that changes them is a new worker. `public/_headers` stops Cloudflare caching `sw.js` and the manifest.

## Icons

`scripts/icons/*.svg` are the hand-drawn sources. `just icons` copies the favicon to `public/` and renders the PNG icons with `rsvg-convert`, and `just og-image` renders the link preview `public/og.jpg` in Chromium with the copy of Lexend in `tests/fixtures/fonts/`, so it needs no network.

## Development

- `just dev` runs the Vite dev server.
- `just worker` builds and serves `dist/` through `wrangler dev`, the way Cloudflare serves it.
- `just verify` runs lint, type checks, the build, Fallow, the pre-commit hooks, the unit tests and the Playwright tests.

Pushing to `main` deploys through `.github/workflows/deploy.yml`, which needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
