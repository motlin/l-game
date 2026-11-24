import {readFileSync} from "node:fs";
import {expect, test} from "vite-plus/test";
import {APPLE_TOUCH_ICON, FAVICON, MANIFEST, PRECACHE_URLS} from "../../../src/pwa/manifest.ts";

const read = (path: string): Buffer => readFileSync(new URL(`../../../${path}`, import.meta.url));

// A PNG's width and height sit in its IHDR chunk, right after the 8-byte signature and the chunk's length and type.
const pngSize = (bytes: Buffer): string => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

test("the manifest installs a standalone app in the color of the page", () =>
{
	expect(MANIFEST).toStrictEqual(
		{
			id: "/",
			name: "The L Game",
			short_name: "The L Game",
			description: "Edward de Bono's L game, for two or four players",
			start_url: "/",
			scope: "/",
			display: "standalone",
			orientation: "any",
			background_color: "#d9b88b",
			theme_color: "#d9b88b",
			icons: [
				{
					src: "/icons/icon-192.png",
					sizes: "192x192",
					type: "image/png",
					purpose: "any",
				},
				{
					src: "/icons/icon-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "any",
				},
				{
					src: "/icons/icon-maskable-512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
			],
		},
	);
});

test("every icon the manifest names is a PNG of the size it claims", () =>
{
	expect(MANIFEST.icons.map(({src}) => pngSize(read(`public${src}`)))).toStrictEqual(
		MANIFEST.icons.map(({sizes}) => sizes),
	);
	expect(pngSize(read(`public${APPLE_TOUCH_ICON}`))).toBe("180x180");
});

test("the page links the manifest and gives Safari the tags it reads for a home screen app", () =>
{
	const html = read("index.html").toString("utf8");
	const tags = [
		...html.matchAll(
			/<(?:link rel="(?:manifest|icon|apple-touch-icon)"|meta name="(?:theme-color|[\w-]*web-app-[\w-]+)")[^>]*>/g,
		),
	].map(([tag]) => tag);
	expect(tags).toStrictEqual([
		'<link rel="manifest" href="/manifest.webmanifest">',
		'<meta name="theme-color" content="#d9b88b">',
		'<meta name="mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-capable" content="yes">',
		'<meta name="apple-mobile-web-app-status-bar-style" content="default">',
		`<meta name="apple-mobile-web-app-title" content="The L Game">`,
		'<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
		'<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
	]);
	expect(tags[1]).toContain(MANIFEST.theme_color);
	expect(tags[6]).toContain(FAVICON);
	expect(tags[7]).toContain(APPLE_TOUCH_ICON);
});

test("the worker keeps the page, the manifest and every icon for offline play", () =>
{
	expect(PRECACHE_URLS).toStrictEqual([
		"/",
		"/manifest.webmanifest",
		"/icons/icon-192.png",
		"/icons/icon-512.png",
		"/icons/icon-maskable-512.png",
		"/icons/apple-touch-icon.png",
		"/favicon.svg",
	]);
});

test("Cloudflare serves the manifest as a manifest and never lets the worker go stale", () =>
{
	expect(read("public/_headers").toString("utf8")).toBe(`/sw.js
  Cache-Control: no-cache
  Content-Type: text/javascript; charset=utf-8

/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: no-cache
`);
});
