import {readFileSync} from "node:fs";
import {chromium} from "@playwright/test";
import {serveFonts} from "../tests/browser/harness/fonts.ts";

// Renders scripts/icons/og.svg to public/og.jpg in Chromium. Lexend comes from the copy in tests/fixtures/fonts, so it
// needs no network. Run it with `just og-image` after changing the SVG.
const OUT = "public/og.jpg";
const svg = readFileSync("scripts/icons/og.svg", "utf8");
const browser = await chromium.launch();
try
{
	const page = await browser.newPage(
		{
			viewport:
			{
				width: 1200,
				height: 630,
			},
		},
	);
	await serveFonts(page);
	await page.setContent(
		`<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;800&display=block" rel="stylesheet">
<style>body{margin:0}svg{display:block}</style>${svg}`,
		{
			waitUntil: "networkidle",
		},
	);
	const loaded = await page.evaluate(async () =>
	{
		const faces = await Promise.all(
			["400 40px Lexend", "600 40px Lexend", "800 40px Lexend"].map(async (font) =>
				document.fonts.load(font, "The L Game"),
			),
		);
		return faces.every((face) => face.length > 0);
	});
	if (!loaded) throw new Error("Lexend did not load, so the card would show a fallback font");
	await page.screenshot(
		{
			path: OUT,
			type: "jpeg",
			quality: 85,
		},
	);
	console.log(`wrote ${OUT}`);
}
finally
{
	await browser.close();
}
