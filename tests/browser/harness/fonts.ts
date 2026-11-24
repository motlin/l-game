import {readFileSync} from "node:fs";
import type {Page} from "@playwright/test";

const LEXEND = readFileSync(new URL("../../fixtures/fonts/lexend-latin.woff2", import.meta.url));
// Lexend is one variable font. Google Fonts declares it once for each weight the page asks for, so a weight in between
// renders at the nearest of those, and this does the same.
const CSS = [400, 600, 800]
	.map(
		(weight) =>
			`@font-face{font-family:'Lexend';font-style:normal;font-weight:${weight};font-display:swap;src:url(https://fonts.gstatic.com/test/lexend-latin.woff2) format('woff2')}`,
	)
	.join("\n");

// Answers the Google Fonts stylesheet and font file from tests/fixtures/fonts, so pages render Lexend without touching
// the network.
export async function serveFonts(page: Page): Promise<void>
{
	await page.route("https://fonts.googleapis.com/**", async (route) =>
		route.fulfill(
			{
				contentType: "text/css",
				body: CSS,
			},
		),
	);
	await page.route("https://fonts.gstatic.com/**", async (route) =>
		route.fulfill(
			{
				contentType: "font/woff2",
				headers:
				{
					"access-control-allow-origin": "*",
				},
				body: LEXEND,
			},
		),
	);
}
