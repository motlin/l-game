# `just --list --unsorted`
[group('default')]
default:
    @just --list --unsorted

ci := env("CI", "")

export PATH := justfile_directory() / "node_modules/.bin" + ":" + env("PATH")

# Install dependencies
[group('setup')]
install:
    pnpm install

# Run the Vite dev server
dev *args: install
    vp dev {{ args }}

# Build and serve dist/ on miniflare, the way Cloudflare serves it
worker *args: build
    wrangler dev {{ args }}

# Run linter
lint: install
    vp lint {{ if ci != "" { "--format github" } else { "--fix" } }}

# Run formatter
format: install
    pre-commit run just-fmt --all-files
    oxfmt-next-line {{ if ci != "" { "--check" } else { "" } }}

# Run checks (lint + typecheck; formatting is `just format`)
check *args: install
    vp run --cache check {{ if ci != "" { "" } else { "--fix" } }} {{ args }}

# Run tests
test *args: install
    vp run --cache test:run {{ args }}

# Type-check the project
typecheck: install
    vp run typecheck

# Build the project
build: install
    vp run --cache build

# Render the app icons in public/ from scripts/icons/*.svg
icons:
    cp scripts/icons/favicon.svg public/favicon.svg
    rsvg-convert -w 192 -h 192 scripts/icons/favicon.svg -o public/icons/icon-192.png
    rsvg-convert -w 512 -h 512 scripts/icons/favicon.svg -o public/icons/icon-512.png
    rsvg-convert -w 512 -h 512 scripts/icons/icon-maskable.svg -o public/icons/icon-maskable-512.png
    rsvg-convert -w 180 -h 180 scripts/icons/apple-touch-icon.svg -o public/icons/apple-touch-icon.png

# Render the link preview image public/og.jpg from scripts/icons/og.svg, with its Lexend font
og-image: install
    node scripts/og-image.ts

# scripts/parallel.sh "vp run --cache test:run" "pnpm exec playwright test"
test-suites: install build
    scripts/parallel.sh "vp run --cache test:run" "pnpm exec playwright test"

# Run the Playwright browser tests against a fresh build
test-browser *args: build
    pnpm exec playwright test {{ args }}

# Deploy dist/ to l-game.motlin.com
deploy: build
    pnpm run deploy

# Apply safe Fallow fixes locally, then reject remaining dead code
fallow: install
    {{ if ci == "" { "vp run fallow" } else { "true" } }}
    vp run fallow:ci

# vp run fallow:ci
fallow-check: install
    vp run fallow:ci

# Run pre-commit hooks on all files (same as CI's pre-commit job)
pre-commit: install
    pre-commit run --all-files

# Run all pre-commit checks
[arg("quick", long, value="true", help="Skip tests")]
verify quick="": check build fallow pre-commit
    {{ if quick != "true" { "just test-suites" } else { "true" } }}
    @echo "All pre-commit checks passed!"

# Deprecated alias for `verify`
[arg("quick", long, value="true", help="Skip tests")]
precommit quick="": (verify quick)
