import {readFileSync} from "node:fs";
import {chromium} from "@playwright/test";

// Renders scripts/icons/og.svg to public/og.jpg in Chromium. Lexend comes from the game's copy in src/styles/fonts, so
// it needs no network. Run it with `just og-image` after changing the SVG.
const OUT = "public/og.jpg";
const svg = readFileSync("scripts/icons/og.svg", "utf8");
const lexend = readFileSync("src/styles/fonts/lexend-latin.woff2").toString("base64");
const fontFaces = [400, 600, 800]
	.map(
		(weight) =>
			`@font-face{font-family:Lexend;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${lexend}) format("woff2")}`,
	)
	.join("");
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
	await page.setContent(
		`<style>${fontFaces}body{margin:0}svg{display:block}</style>${svg}`,
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
