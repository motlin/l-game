# The L Game

Edward de Bono's two-player blocking game, from his 1967 book _The Five-Day Course in Thinking_, with a computer opponent that has solved the game, a four-player battle on a collapsing 6 by 6 floor, a moving-tiles variant, T-piece variants, position codes and a move tree. It started as a single-file Claude artifact and runs as static assets on a Cloudflare Worker at l-game.motlin.com.

## Layout

`index.html` is the game as it came from the artifact: its markup, its stylesheet and its inline scripts. It saves options, scores and games in localStorage under `lgame-*`, `tgame1-*` and `ltgame-*` keys. `src/main.ts` is the one module the build adds, and it registers the service worker.

## Installing and playing offline

The game installs from the browser as a standalone app and plays offline. `src/pwa/manifest.ts` holds the manifest and the fixed files the service worker keeps, and `src/pwa/worker.ts` its logic. `scripts/service-worker-build.ts` builds `src/pwa/sw.ts` to `dist/sw.js`, writes `dist/manifest.webmanifest`, and versions the worker's cache with a hash of everything it keeps, so each deploy that changes them is a new worker. `public/_headers` stops Cloudflare caching `sw.js` and the manifest.

## Icons

`scripts/icons/*.svg` are the hand-drawn sources. `just icons` copies the favicon to `public/` and renders the PNG icons with `rsvg-convert`, and `just og-image` renders the link preview `public/og.jpg` in Chromium with the copy of Lexend in `tests/fixtures/fonts/`, so it needs no network.

## Development

- `just dev` runs the Vite dev server.
- `just worker` builds and serves `dist/` through `wrangler dev`, the way Cloudflare serves it.
- `just verify` runs lint, type checks, the build, Fallow, the pre-commit hooks, the unit tests and the Playwright tests.

Pushing to `main` deploys through `.github/workflows/deploy.yml`, which needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
